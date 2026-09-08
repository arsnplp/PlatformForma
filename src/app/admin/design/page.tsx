import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

import { requireUser } from "@/lib/auth/session";

// Référence visuelle du design system (spec §3) : tokens, typographie,
// couleurs de sens et composants, tels qu'ils s'appliquent au back-office
// comme à l'espace élève.
export default async function DesignSystemPage() {
  await requireUser("/admin/design");
  return (
    <div className="w-full max-w-content">
      <p className="text-sm text-foreground-secondary">Plateforme de formation</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Design system</h1>
      <p className="mt-3 text-foreground-secondary">
        Un seul jeu de tokens, partagé entre le back-office et l&apos;espace élève.
        Fond blanc, texte quasi-noir, un accent discret, couleurs réservées au sens.
      </p>

      <Separator className="my-10" />

      <h2 className="text-xl font-semibold">Typographie</h2>
      <div className="mt-4 space-y-2">
        <p className="text-3xl font-semibold">Titre de page</p>
        <p className="text-2xl font-semibold">Titre de section</p>
        <p className="text-xl font-medium">Sous-titre</p>
        <p>Corps de texte, interligne généreux, largeur de lecture limitée.</p>
        <p className="text-sm text-foreground-secondary">Texte secondaire</p>
        <p className="text-xs text-foreground-tertiary">Texte tertiaire</p>
        <p className="font-mono text-sm">code monospace</p>
      </div>

      <Separator className="my-10" />

      <h2 className="text-xl font-semibold">Couleurs de sens</h2>
      <div className="mt-4 flex flex-wrap gap-2">
        <span className="rounded-sm bg-status-gray-bg px-2 py-0.5 text-sm text-status-gray">Brouillon</span>
        <span className="rounded-sm bg-status-blue-bg px-2 py-0.5 text-sm text-status-blue">Planifiée</span>
        <span className="rounded-sm bg-status-green-bg px-2 py-0.5 text-sm text-status-green">Active</span>
        <span className="rounded-sm bg-status-yellow-bg px-2 py-0.5 text-sm text-status-yellow">En attente</span>
        <span className="rounded-sm bg-status-orange-bg px-2 py-0.5 text-sm text-status-orange">À corriger</span>
        <span className="rounded-sm bg-status-red-bg px-2 py-0.5 text-sm text-status-red">Annulée</span>
        <span className="rounded-sm bg-status-purple-bg px-2 py-0.5 text-sm text-status-purple">Archivée</span>
      </div>

      <Separator className="my-10" />

      <h2 className="text-xl font-semibold">Composants</h2>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button>Action principale</Button>
        <Button variant="secondary">Secondaire</Button>
        <Button variant="outline">Contour</Button>
        <Button variant="ghost">Discret</Button>
        <Button variant="destructive">Supprimer</Button>
        <Badge>Badge</Badge>
        <Badge variant="secondary">Secondaire</Badge>
        <Badge variant="outline">Contour</Badge>
      </div>
      <div className="mt-6 max-w-sm space-y-2">
        <Label htmlFor="demo">Champ de saisie</Label>
        <Input id="demo" placeholder="Nom de la formation" />
      </div>
    </div>
  );
}
