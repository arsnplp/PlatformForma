# Mise en ligne sur le VPS — plateforma.nairox.fr

Runbook complet, à dérouler dans l'ordre. Écrit pour **Debian / Ubuntu** avec
un utilisateur non-root disposant de `sudo`. Les commandes sont à coller telles
quelles, sauf les valeurs entre `<…>`.

Ce fichier décrit *comment mettre en ligne*. `DEPLOIEMENT.md` décrit *ce qui
reste à régler* (mails, signature, rétention…) : les deux se lisent ensemble.

---

## Réglages retenus pour le VPS `srv1278016`

Audit du 9 septembre 2026. La machine héberge **26 sites**, deux applications
Next.js sous PM2 (`comeback-site` sur le port 3000, `comeback-app` sur 3001),
Docker, et 11 tâches cron. Cinq écarts par rapport à la procédure générique en
découlent — les suivre, ils priment sur les sections ci-dessous.

| Point | Générique | **Ici** | Pourquoi |
| --- | --- | --- | --- |
| Node | NodeSource système | **`/opt/node22`, hors du `PATH`** | `/usr/bin/node` est en v20.20.2 et fait tourner les deux apps PM2. Le remplacer les ferait changer de version. |
| Port | 3000 | **3002** | 3000 et 3001 sont pris par `comeback-site` et `comeback-app`. |
| Service | systemd ou PM2 | **systemd** | PM2 tourne déjà, mais son démon est en Node 20 et porte les deux applications de production. Un service systemd isolé ne les touche pas. |
| Swap | si < 2 Go | **obligatoire, avant le build** | La machine a **0 Mo de swap**. Sans lui, un `next build` qui déborde fait choisir une victime au noyau — possiblement une app de production. |
| Cron | `/etc/cron.d` | **`/etc/cron.d`** | Confirmé : 11 tâches existent dans la crontab de root, `CRON_TZ` les aurait toutes décalées. |

### Node isolé dans `/opt/node22`

`@supabase/supabase-js` réclame Node ≥ 22 ; le Node système est en 20.20.2, et
la branche 20 n'est plus maintenue. On installe donc Node 22 **dans son propre
dossier, jamais ajouté au `PATH`** : aucun autre projet ne peut le voir, et
`/usr/bin/node` reste intact pour PM2.

```bash
V=$(curl -fsSL https://nodejs.org/dist/index.json | grep -o '"v22\.[0-9.]*"' | head -1 | tr -d '"')
echo "version retenue : $V"
curl -fsSLO "https://nodejs.org/dist/$V/node-$V-linux-x64.tar.xz"
sudo mkdir -p /opt/node22
sudo tar -xJf "node-$V-linux-x64.tar.xz" -C /opt/node22 --strip-components=1
rm -f "node-$V-linux-x64.tar.xz"

/opt/node22/bin/node -v      # doit afficher v22.x
node -v                      # doit TOUJOURS afficher v20.20.2
```

Toutes les commandes `npm` / `npx` de ce projet passent ensuite par un chemin
absolu : `/opt/node22/bin/npm`, `/opt/node22/bin/npx`.

### Swap — avant toute compilation

```bash
free -m                                  # relever le total avant/après
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
sudo sysctl vm.swappiness=10             # ne swapper qu'en dernier recours
echo 'vm.swappiness=10' | sudo tee /etc/sysctl.d/99-swappiness.conf
free -m
```

### Compiler sous plafond mémoire

Le build est enfermé dans un groupe de contrôle : s'il déborde, **c'est lui**
qui est arrêté, et non une application de production choisie par le noyau.

```bash
cd /var/www/plateforma
/opt/node22/bin/npm ci
/opt/node22/bin/npx prisma generate
/opt/node22/bin/npx prisma migrate deploy
sudo systemd-run --scope -p MemoryMax=2G -p MemorySwapMax=3G \
  /opt/node22/bin/npm run build
```

### Le service, sur le port 3002

Vérifier d'abord que le port est bien libre — la commande ne doit rien afficher :

```bash
sudo ss -tlnp | grep ':3002 '
```

```bash
sudo tee /etc/systemd/system/plateforma.service > /dev/null <<'EOF'
[Unit]
Description=Plateforma — LMS Nairox
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/var/www/plateforma
Environment=NODE_ENV=production
ExecStart=/opt/node22/bin/node /var/www/plateforma/node_modules/next/dist/bin/next start -H 127.0.0.1 -p 3002
Restart=always
RestartSec=5
# Garde-fou : ce service ne peut pas affamer les autres applications.
MemoryMax=1500M

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now plateforma
sudo systemctl status plateforma --no-pager
curl -I http://127.0.0.1:3002/login      # 200 attendu
```

Dans la configuration nginx, remplacer les **quatre** `proxy_pass` par le port
`3002`. Le reste du bloc est inchangé.

### Script de déploiement adapté

```bash
sudo tee /usr/local/bin/plateforma-deploy > /dev/null <<'EOF'
#!/bin/bash
set -euo pipefail
cd /var/www/plateforma
git pull --ff-only
/opt/node22/bin/npm ci
/opt/node22/bin/npx prisma generate
/opt/node22/bin/npx prisma migrate deploy
systemd-run --scope -p MemoryMax=2G -p MemorySwapMax=3G /opt/node22/bin/npm run build
systemctl restart plateforma
echo "✓ déployé"
EOF
sudo chmod 755 /usr/local/bin/plateforma-deploy
```

### Après la mise en ligne — contrôler l'existant

```bash
pm2 list                                  # comeback-site et comeback-app : online
curl -I https://app.getcomeback.fr        # 200
curl -I https://nairox.fr                 # 200
node -v                                   # toujours v20.20.2
sudo ss -tlnp | grep -E ':(3000|3001|3002) '
```

---

## 0. Avant tout — le DNS

Certbot ne peut pas délivrer de certificat tant que le sous-domaine ne pointe
pas sur le VPS. À faire chez le registrar de `nairox.fr`, puis attendre la
propagation :

| Type | Nom          | Valeur          |
| ---- | ------------ | --------------- |
| A    | `plateforma` | `<IP_DU_VPS>`   |

Vérifier depuis le VPS avant d'aller plus loin — la réponse doit être l'IP du VPS :

```bash
dig +short plateforma.nairox.fr
```

---

## 1. Le socle

Next.js 16 exige Node ≥ 20.9. On installe Node 22 LTS.

> **Si le VPS héberge déjà autre chose, lire l'annexe « Cohabitation » en fin
> de fichier AVANT de lancer quoi que ce soit.** Deux commandes de cette
> section touchent l'ensemble de la machine.

```bash
sudo apt update
sudo apt install -y git nginx certbot python3-certbot-nginx
```

Node : **ne pas installer NodeSource si un autre projet Node tourne déjà sur
la machine** — le paquet remplace le Node du système et fera basculer l'autre
projet de version. Dans ce cas, voir l'annexe. Sur un VPS où rien d'autre
n'utilise Node :

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node -v && npm -v && nginx -v
```

On ne lance **pas** `apt upgrade` : mettre à jour tous les paquets d'un VPS
partagé pour installer une application, c'est prendre un risque sur les
services déjà en place pour rien.

**Mémoire.** `next build` compile tout le projet et tient mal sous 2 Go. Si
`free -m` annonce moins de 2 Go de RAM, ajouter du swap une fois pour toutes,
sinon la compilation sera tuée par le noyau sans message clair :

```bash
free -m
ls -la /swapfile 2>/dev/null   # s'il existe déjà, PASSER cette étape
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

Pare-feu, si `ufw` est actif :

```bash
sudo ufw allow 'Nginx Full' && sudo ufw allow OpenSSH && sudo ufw status
```

---

## 2. Lier le dépôt GitHub

Le dépôt est privé. On utilise une **clé de déploiement** en lecture seule,
propre au VPS : pas de mot de passe GitHub sur la machine, et une clé qu'on
révoque seule si le VPS est compromis.

```bash
ssh-keygen -t ed25519 -C "vps-plateforma" -f ~/.ssh/plateforma_deploy -N ""
cat ~/.ssh/plateforma_deploy.pub
```

Copier la ligne affichée, puis sur GitHub :
**github.com/arsnplp/PlatformForma → Settings → Deploy keys → Add deploy key**.
Coller la clé, titre « VPS Nairox », **laisser « Allow write access » décoché**.

Déclarer la clé pour ce dépôt :

```bash
cat >> ~/.ssh/config <<'EOF'

Host github-plateforma
  HostName github.com
  User git
  IdentityFile ~/.ssh/plateforma_deploy
  IdentitiesOnly yes
EOF
chmod 600 ~/.ssh/config
ssh -T git@github-plateforma   # doit répondre « successfully authenticated »
```

Cloner :

```bash
sudo mkdir -p /var/www/plateforma
sudo chown "$USER:$USER" /var/www/plateforma   # ce dossier SEULEMENT
git clone git@github-plateforma:arsnplp/PlatformForma.git /var/www/plateforma
cd /var/www/plateforma
```

---

## 3. Le fichier `.env` de production

**Il doit exister avant la compilation** : les variables `NEXT_PUBLIC_*` sont
inscrites en dur dans le JavaScript envoyé au navigateur au moment du `build`.
Les changer plus tard oblige à recompiler.

```bash
nano /var/www/plateforma/.env
```

Contenu — reprendre les valeurs de la machine de développement, **sauf
`NEXT_PUBLIC_APP_URL` et `CRON_SECRET`** :

```dotenv
# ── Base de données (Supabase)
DATABASE_URL="postgresql://postgres.<ref>:<mdp>@aws-1-eu-west-1.pooler.supabase.com:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://postgres.<ref>:<mdp>@aws-1-eu-west-1.pooler.supabase.com:5432/postgres"

# ── Supabase
NEXT_PUBLIC_SUPABASE_URL="https://<ref>.supabase.co"
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="sb_publishable_…"
SUPABASE_SERVICE_ROLE_KEY="<clé service — serveur uniquement>"

# ── L'URL publique. SANS ELLE, les liens des mails pointent sur localhost.
NEXT_PUBLIC_APP_URL="https://plateforma.nairox.fr"

# ── Mails (voir DEPLOIEMENT.md avant de passer en production)
RESEND_API_KEY="re_…"
MAIL_FROM="Nairox Formation <contact@plateforma.nairox.fr>"
MAIL_MODE="sandbox"
MAIL_SANDBOX_TO="arsene.lecoq8@gmail.com"

# ── Tâches planifiées : générer une valeur neuve, voir plus bas
CRON_SECRET="<openssl rand -hex 32>"

# ── Signature (rester en test tant qu'un parcours complet n'a pas été déroulé)
SIGNWELL_API_KEY="<clé>"
SIGNATURE_MODE="test"

# ── Mini Arsène
ANTHROPIC_API_KEY="<clé de l'espace de travail>"
ANTHROPIC_WORKSPACE_ID=""

# ── Seed (utile seulement sur un projet Supabase neuf)
SEED_ADMIN_EMAIL="enesra92z@gmail.com"
SEED_ADMIN_PASSWORD="<mot de passe>"
SEED_ADMIN_NAME="Arsène Lecoq"
```

Générer le secret du cron et verrouiller le fichier :

```bash
openssl rand -hex 32          # coller le résultat dans CRON_SECRET
chmod 600 /var/www/plateforma/.env
```

`.env` est couvert par `.gitignore` : il ne partira jamais dans un commit.

---

## 4. Compiler

```bash
cd /var/www/plateforma
npm ci
npx prisma generate          # le client Prisma n'est pas versionné : obligatoire
npx prisma migrate deploy    # sans effet si la base est déjà à jour
npm run build
```

**Uniquement sur un projet Supabase neuf** — crée rôles, permissions et le
compte super-administrateur :

```bash
npx tsx prisma/seed.ts
```

---

## 5. Le service systemd

L'application tourne sur `127.0.0.1:3000`, injoignable depuis l'extérieur :
seul nginx lui parle.

```bash
sudo tee /etc/systemd/system/plateforma.service > /dev/null <<EOF
[Unit]
Description=Plateforma — LMS Nairox
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=/var/www/plateforma
Environment=NODE_ENV=production
ExecStart=/var/www/plateforma/node_modules/.bin/next start -H 127.0.0.1 -p 3000
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now plateforma
sudo systemctl status plateforma --no-pager
curl -I http://127.0.0.1:3000/login    # doit répondre 200
```

Les journaux, en cas de souci : `journalctl -u plateforma -f`.

---

## 6. Nginx

```bash
sudo tee /etc/nginx/sites-available/plateforma.nairox.fr > /dev/null <<'EOF'
server {
    listen 80;
    listen [::]:80;
    server_name plateforma.nairox.fr;

    # Les fichiers montent du navigateur DIRECTEMENT vers Supabase par URL
    # signée : nginx ne voit jamais les 50 Mo. Cette marge ne couvre que les
    # formulaires classiques.
    client_max_body_size 25m;

    # Mini Arsène répond en flux NDJSON. Bufferisé, il resterait muet jusqu'à
    # la dernière ligne : la bulle paraîtrait figée pendant tout le travail.
    location /api/assistant {
        proxy_pass http://127.0.0.1:3000;
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 600s;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Le dossier de preuve est une archive streamée : la requête reste ouverte
    # le temps de recopier chaque pièce depuis le stockage.
    location /api/exports {
        proxy_pass http://127.0.0.1:3000;
        proxy_buffering off;
        proxy_read_timeout 900s;
        proxy_send_timeout 900s;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_read_timeout 120s;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF

sudo ln -sf /etc/nginx/sites-available/plateforma.nairox.fr /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
curl -I http://plateforma.nairox.fr/login    # 200 en clair, avant HTTPS
```

---

## 7. HTTPS

```bash
sudo certbot --nginx -d plateforma.nairox.fr --agree-tos -m enesra92z@gmail.com --redirect
```

Certbot modifie le fichier ci-dessus pour ajouter le port 443 et la
redirection depuis le port 80. Vérifier que le renouvellement automatique est
armé :

```bash
sudo certbot renew --dry-run
systemctl list-timers | grep certbot
```

---

## 8. Les tâches planifiées

Deux appels périodiques, protégés par `CRON_SECRET`. Un petit script lit le
secret dans `.env` : il n'est ainsi écrit qu'à un seul endroit.

```bash
sudo tee /usr/local/bin/plateforma-cron > /dev/null <<'EOF'
#!/bin/bash
set -euo pipefail
SECRET=$(grep -E '^CRON_SECRET=' /var/www/plateforma/.env | cut -d= -f2- | tr -d '"')
curl -fsS -X POST -H "Authorization: Bearer $SECRET" \
  "https://plateforma.nairox.fr/api/cron/$1"
EOF
sudo chmod 700 /usr/local/bin/plateforma-cron
sudo /usr/local/bin/plateforma-cron process    # essai immédiat
```

Les deux tâches vont dans **leur propre fichier**, pas dans la crontab de
root : `CRON_TZ` s'applique à toutes les lignes qui le suivent dans un fichier,
et il changerait donc le fuseau des tâches déjà en place.

```bash
sudo tee /etc/cron.d/plateforma > /dev/null <<'EOF'
CRON_TZ=Europe/Paris
SHELL=/bin/bash
PATH=/usr/local/bin:/usr/bin:/bin

0 7 * * *    root /usr/local/bin/plateforma-cron process        >> /var/log/plateforma-cron.log 2>&1
*/15 * * * * root /usr/local/bin/plateforma-cron notifications >> /var/log/plateforma-cron.log 2>&1
EOF
sudo chmod 644 /etc/cron.d/plateforma
```

Un fichier de `/etc/cron.d` porte l'utilisateur en sixième colonne (`root`), à
la différence d'une crontab. `CRON_TZ=Europe/Paris` règle le décalage
été/hiver tout seul : la convocation J-7 part bien à 7h locales toute l'année.

---

## 9. Déployer une nouvelle version

Après chaque `git push` depuis la machine de développement :

```bash
sudo tee /usr/local/bin/plateforma-deploy > /dev/null <<'EOF'
#!/bin/bash
set -euo pipefail
cd /var/www/plateforma
git pull --ff-only
npm ci
npx prisma generate
npx prisma migrate deploy
npm run build
sudo systemctl restart plateforma
echo "✓ déployé"
EOF
sudo chmod 755 /usr/local/bin/plateforma-deploy
```

Ensuite, une seule commande sur le VPS : `plateforma-deploy`.

La compilation remplace `.next` pendant que l'ancienne version tourne encore :
quelques secondes d'incohérence possible avant le redémarrage. Sans
conséquence à un seul formateur ; à revoir le jour où des élèves sont en ligne
en permanence.

---

## 10. Vérifications après bascule

```bash
curl -I https://plateforma.nairox.fr/login          # 200, en HTTPS
curl -I http://plateforma.nairox.fr/login           # 301 vers HTTPS
sudo systemctl status plateforma --no-pager
journalctl -u plateforma -n 50 --no-pager
```

Puis dans le navigateur :

- se connecter avec le compte super-administrateur ;
- ouvrir Mini Arsène et poser une question — la réponse doit s'écrire **au fil
  du texte**. Si elle apparaît d'un bloc après un long silence, le buffering
  nginx n'est pas coupé ;
- créer une formation, la publier, ouvrir une session : le parcours complet ;
- déposer un fichier dans une leçon, puis le rouvrir — cela valide le stockage
  et les URL signées.

Contrôler enfin que l'inaltérabilité des émargements est bien armée sur la base
de production (`tgenabled` doit valoir `O`) :

```sql
SELECT tgname, tgenabled FROM pg_trigger WHERE tgname = 'attendances_immutable';
```

---

## Un point à trancher : une base, ou deux ?

Ce runbook suppose que le VPS pointe sur le **projet Supabase déjà utilisé en
développement** — c'est le plus rapide, la base vient d'être remise à zéro, les
migrations et les quatre buckets privés sont en place.

La contrepartie est réelle : un `npm run dev` sur la machine de développement
écrira alors dans la base **de production**. Tant que la plateforme n'a qu'un
utilisateur, c'est tenable. Dès qu'un vrai élève y dépose une pièce, créer un
second projet Supabase pour le développement, et n'y toucher que là — les
étapes 3 et 4 sont exactement les mêmes, avec le `seed` en plus.

---

## Annexe — Cohabitation avec ce qui tourne déjà sur le VPS

Cette procédure installe une application sur une machine qui en héberge
peut-être d'autres. Rien ici ne supprime de données, mais **cinq gestes
touchent l'ensemble du système**. À lire avant de commencer.

### L'audit préalable, en lecture seule

Il ne modifie rien. Sa sortie dit lesquelles des variantes ci-dessous
s'appliquent.

```bash
echo "=== OS ==="; head -2 /etc/os-release
echo "=== Node ==="; which node && node -v || echo "aucun node"
echo "=== serveur web ==="; systemctl is-active nginx apache2 caddy 2>/dev/null
echo "=== ports occupés ==="; sudo ss -tlnp | grep -E ':(80|443|3000|3001) '
echo "=== /var/www ==="; ls -la /var/www 2>/dev/null
echo "=== sites nginx ==="; ls /etc/nginx/sites-enabled/ 2>/dev/null
echo "=== services ==="; systemctl list-units --type=service --state=running --no-pager \
  | grep -viE 'systemd|dbus|cron|ssh|networkd|resolved|journald|logind|udev|getty|polkit|rsyslog|timesync|unattended'
echo "=== crontab root ==="; sudo crontab -l 2>/dev/null || echo "vide"
echo "=== pm2 ==="; which pm2 && pm2 list 2>/dev/null || echo "pas de pm2"
echo "=== swap ==="; free -m | grep -i swap; ls -la /swapfile 2>/dev/null
```

### Les cinq points de contact, et leur parade

**1. Node déjà installé pour un autre projet.** Le paquet NodeSource remplace
le Node du système : l'autre projet changerait de version sans prévenir, avec
ses modules natifs compilés pour l'ancienne. Parade — installer Node pour le
seul utilisateur qui fait tourner la plateforme, sans toucher au Node système :

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
source ~/.bashrc
nvm install 22
nvm which 22          # noter ce chemin : il ira dans le service systemd
```

Le service systemd doit alors pointer sur ce Node-là plutôt que sur celui du
système :

```ini
ExecStart=/home/<user>/.nvm/versions/node/v22.x.x/bin/node /var/www/plateforma/node_modules/.bin/next start -H 127.0.0.1 -p 3000
```

**2. Un autre serveur web (Apache, Caddy).** Installer nginx crée un conflit
sur le port 80 et peut faire tomber les sites en place. Si Apache sert déjà le
VPS, ne pas installer nginx : garder Apache et lui ajouter un `VirtualHost`
mandataire. Les réglages qui comptent restent les mêmes — `ProxyPass` vers
`127.0.0.1:3000`, et surtout **pas de mise en tampon sur `/api/assistant`** :

```apache
<VirtualHost *:80>
    ServerName plateforma.nairox.fr
    ProxyPreserveHost On
    ProxyPass        /api/assistant http://127.0.0.1:3000/api/assistant flushpackets=on
    ProxyPassReverse /api/assistant http://127.0.0.1:3000/api/assistant
    ProxyPass        / http://127.0.0.1:3000/
    ProxyPassReverse / http://127.0.0.1:3000/
</VirtualHost>
```

Puis `sudo certbot --apache -d plateforma.nairox.fr`.

**3. Le port 3000 déjà pris.** C'est le port par défaut de la plupart des
applications Node : le service refuserait de démarrer. Prendre un port libre
(3010, par exemple) et le reporter aux **deux** endroits : `-p 3010` dans
`ExecStart`, et les quatre `proxy_pass` de la configuration nginx.

**4. `/var/www` partagé avec d'autres sites.** Ne jamais s'approprier le
dossier parent : seul `/var/www/plateforma` change de propriétaire. C'est déjà
ce que fait l'étape 2. En cas de doute, installer ailleurs — `/srv/plateforma`
ou `/home/<user>/plateforma` conviennent aussi bien, à condition de reporter le
chemin dans le service systemd et les scripts.

**5. Des tâches cron déjà en place.** `CRON_TZ` s'applique à toutes les lignes
qui le suivent *dans le même fichier* : posé dans la crontab de root, il
changerait le fuseau des tâches existantes. L'étape 8 passe pour cette raison
par `/etc/cron.d/plateforma`, un fichier séparé qui n'affecte que ses deux
lignes.

### Ce qui, en revanche, ne touche à rien

- Le **bloc `server` nginx** : nginx sélectionne par `server_name`, un nouveau
  domaine ne détourne pas le trafic des autres. `systemctl reload nginx`
  recharge sans couper les connexions en cours.
- **Certbot** : il ne modifie que le fichier du domaine demandé et ajoute son
  minuteur de renouvellement.
- Le **service `plateforma`** : nom neuf, à vérifier tout de même par
  `systemctl status plateforma` — il doit répondre « could not be found ».
- Le **clone du dépôt** et le `.env` : confinés au dossier de l'application.
- `ufw allow` : ajoute une règle, n'en retire aucune.

### Vérification après coup

Une fois la plateforme en ligne, contrôler que l'existant n'a pas bougé :

```bash
systemctl status nginx --no-pager        # ou apache2
curl -I https://<votre-autre-site>       # doit toujours répondre 200
sudo ss -tlnp | grep -E ':(80|443) '
```
