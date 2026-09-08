import "server-only";

// ═══════════════════════════════════════════════════════════════════════════
// GARDE-FOU DE LA SIGNATURE ÉLECTRONIQUE
//
// Tant que SIGNATURE_MODE ne vaut pas exactement "production" :
//   • toute demande part en test_mode chez SignWell — le document n'a AUCUNE
//     valeur juridique et n'est pas décompté ;
//   • l'adresse du signataire est réécrite vers MAIL_SANDBOX_TO, comme pour
//     les mails : aucun élève réel ne peut être sollicité.
//
// La signature se fait en mode embarqué (embedded_signing), donc SignWell
// n'envoie lui-même aucun mail : on signe depuis la plateforme. C'est une
// deuxième barrière, indépendante de la première.
//
// La bascule est explicite et manuelle, jamais déduite de NODE_ENV.
// ═══════════════════════════════════════════════════════════════════════════

export type SignatureMode = "test" | "production";

export function getSignatureMode(): SignatureMode {
  return process.env.SIGNATURE_MODE?.trim() === "production" ? "production" : "test";
}

export function isSignatureTest(): boolean {
  return getSignatureMode() !== "production";
}

export function getSignwellKey(): string {
  const key = process.env.SIGNWELL_API_KEY?.trim();
  if (!key) throw new Error("SIGNWELL_API_KEY manquante : signature impossible.");
  return key;
}

// Signataire réellement sollicité. En test, c'est toujours la boîte de test,
// et le nom rappelle qui aurait dû recevoir la demande.
//
// `key` sert quand plusieurs personnes signent le même document (feuille
// d'émargement) : le prestataire refuse deux signataires ayant la même adresse.
// On utilise alors le sous-adressage (« moi+cle@domaine »), qui donne des
// adresses distinctes livrées dans la MÊME boîte de test.
export function resolveSigner(
  intended: { name: string; email: string },
  key?: string,
): { name: string; email: string; redirected: boolean } {
  if (!isSignatureTest()) return { ...intended, redirected: false };

  const to = process.env.MAIL_SANDBOX_TO?.trim();
  if (!to) throw new Error("MAIL_SANDBOX_TO manquante : signature de test impossible.");

  return {
    name: `${intended.name} (test → ${intended.email})`,
    email: key ? withSubAddress(to, key) : to,
    redirected: true,
  };
}

function withSubAddress(address: string, key: string): string {
  const at = address.lastIndexOf("@");
  if (at <= 0) return address;
  const local = address.slice(0, at).split("+")[0];
  const domain = address.slice(at + 1);
  const tag = key.replace(/[^a-zA-Z0-9]/g, "").slice(0, 20) || "signataire";
  return `${local}+${tag}@${domain}`;
}
