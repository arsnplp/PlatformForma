import { redirect } from "next/navigation";
import { getCurrentUser, hasPermission } from "@/lib/auth/session";

// La racine n'affiche rien : elle oriente. Le personnel va au back-office,
// l'élève dans son espace, un visiteur vers la page de connexion.
export default async function Home() {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  redirect(hasPermission(me, "can_access_backoffice") ? "/admin" : "/espace");
}
