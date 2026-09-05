import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { LoginForm } from "@/components/auth/login-form";

export const metadata = { title: "Connexion" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const user = await getCurrentUser();
  if (user) redirect("/admin");

  const { next } = await searchParams;
  const nextPath = typeof next === "string" ? next : undefined;

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm">
        <p className="text-sm text-foreground-secondary">Plateforme de formation</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Connexion</h1>
        <div className="mt-8">
          <LoginForm next={nextPath} />
        </div>
      </div>
    </main>
  );
}
