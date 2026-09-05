import type { ReactNode } from "react";
import { Label } from "@/components/ui/label";

// Champ de formulaire : label, contrôle, aide et erreurs (issues de FormState.fieldErrors).
export function FormField({
  id,
  label,
  hint,
  errors,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  errors?: string[];
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {errors?.length ? (
        <p className="text-sm text-status-red">{errors.join(" · ")}</p>
      ) : hint ? (
        <p className="text-sm text-foreground-tertiary">{hint}</p>
      ) : null}
    </div>
  );
}

export function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="rounded-md bg-status-red-bg px-3 py-2 text-sm text-status-red" role="alert">
      {message}
    </p>
  );
}
