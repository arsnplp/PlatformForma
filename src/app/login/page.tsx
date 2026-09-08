import { redirect } from "next/navigation";
import { getCurrentUser, landingFor } from "@/lib/auth/session";
import { LoginForm } from "@/components/auth/login-form";

export const metadata = { title: "Connexion" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const user = await getCurrentUser();
  if (user) redirect(landingFor(user));

  const { next, invitation } = await searchParams;
  const nextPath = typeof next === "string" ? next : undefined;
  const expiredInvitation = invitation === "expiree";

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm">
        <p className="text-sm text-foreground-secondary">Plateforme de formation</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Connexion</h1>
        {expiredInvitation ? (
          <p className="mt-4 rounded-md bg-status-orange-bg px-3 py-2 text-sm text-status-orange">
            Ce lien d&apos;activation a expiré ou a déjà servi. Demandez à votre formateur de vous en renvoyer un —
            votre compte, lui, reste actif.
          </p>
        ) : null}

        <div className="mt-8">
          <LoginForm next={nextPath} />
        </div>
      </div>
    </main>
  );
}
