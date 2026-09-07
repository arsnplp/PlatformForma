import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { ActivationForm } from "@/components/auth/activation-form";

export const metadata = { title: "Activation du compte" };

// Deuxième temps de l'invitation : la session est ouverte par le lien, l'élève
// choisit son mot de passe. Sans session valide, retour au lien expiré.
export default async function ActivationPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login?invitation=expiree");

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm">
        <p className="text-sm text-foreground-secondary">Plateforme de formation</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Bienvenue {me.name.split(" ")[0]}</h1>
        <p className="mt-2 text-sm text-foreground-secondary">
          Choisissez votre mot de passe pour activer votre compte. Vous vous connecterez ensuite avec {me.email}.
        </p>
        <div className="mt-8">
          <ActivationForm />
        </div>
      </div>
    </main>
  );
}
