"use client";

import { useId, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FormField } from "./form-field";

// Le mot de passe du compte, posé à la création. C'est le créateur qui le
// transmet — aucun mail ne part d'ici.
//
// Il est visible en clair : le cacher n'aurait aucun sens puisqu'il faut le
// recopier pour le donner, et un champ masqué ferait multiplier les fautes
// de frappe sur un secret qu'on ne peut plus relire.
export function PasswordField({
  name = "password",
  label = "Mot de passe",
  errors,
  required = true,
}: {
  name?: string;
  label?: string;
  errors?: string[];
  required?: boolean;
}) {
  const id = useId();
  const [value, setValue] = useState("");
  const [copied, setCopied] = useState(false);

  // Sans ambiguïté à l'oral ni à la recopie : ni O/0, ni I/l/1.
  function generate() {
    const alphabet = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const bytes = crypto.getRandomValues(new Uint8Array(14));
    setValue([...bytes].map((b) => alphabet[b % alphabet.length]).join(""));
    setCopied(false);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <FormField id={id} label={label} errors={errors}>
      <span className="flex flex-wrap items-center gap-2">
        <Input
          id={id}
          name={name}
          value={value}
          onChange={(e) => { setValue(e.target.value); setCopied(false); }}
          placeholder="Huit caractères au minimum"
          autoComplete="off"
          spellCheck={false}
          className="min-w-0 flex-1 font-mono"
          required={required}
        />
        <Button type="button" variant="outline" size="sm" onClick={generate}>Générer</Button>
        {value ? (
          <Button type="button" variant="ghost" size="sm" onClick={copy}>
            {copied ? "Copié" : "Copier"}
          </Button>
        ) : null}
      </span>
    </FormField>
  );
}
