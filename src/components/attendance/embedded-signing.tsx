"use client";

import { useEffect, useRef, useState } from "react";

// Signature SANS quitter la plateforme : SignWell fournit une librairie qui
// affiche la page de signature dans une fenêtre par-dessus la nôtre, et nous
// prévient quand c'est signé. C'est ce qui rend supportables 18 signatures.
type SignWellEmbedInstance = { open: () => void; close: () => void };
type SignWellEmbedOptions = {
  url: string;
  events: { completed?: () => void; declined?: () => void; closed?: () => void };
};
declare global {
  interface Window {
    SignWellEmbed?: new (options: SignWellEmbedOptions) => SignWellEmbedInstance;
  }
}

const SCRIPT_SRC = "https://static.signwell.com/assets/embedded.js";

export function useEmbeddedSigning(onCompleted: () => void) {
  const [loading, setLoading] = useState(false);
  // La dernière version du callback, sans le lire pendant le rendu.
  const done = useRef(onCompleted);
  useEffect(() => {
    done.current = onCompleted;
  }, [onCompleted]);

  useEffect(() => {
    if (document.querySelector(`script[src="${SCRIPT_SRC}"]`)) return;
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    document.head.appendChild(script);
  }, []);

  async function open(url: string) {
    setLoading(true);
    try {
      // La librairie peut arriver après le premier rendu : on l'attend brièvement.
      for (let i = 0; i < 40 && !window.SignWellEmbed; i++) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      if (!window.SignWellEmbed) {
        // Repli : sans la librairie, on ouvre la page de signature à part.
        window.open(url, "_blank", "noopener,noreferrer");
        return;
      }
      const embed = new window.SignWellEmbed({
        url,
        events: {
          completed: () => { embed.close(); done.current(); },
          closed: () => done.current(),
        },
      });
      embed.open();
    } finally {
      setLoading(false);
    }
  }

  return { open, loading };
}
