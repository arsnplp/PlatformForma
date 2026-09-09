"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

// Ouvrir un fil le marque comme lu pendant le rendu de la PAGE, alors que la
// pastille est calculée par la mise en page — qui a déjà rendu. Sans ce coup
// de rafraîchissement, le compteur resterait en retard d'une navigation.
//
// Une seule fois par montage : on rafraîchit, on ne boucle pas.
export function RefreshOnce() {
  const router = useRouter();
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    done.current = true;
    router.refresh();
  }, [router]);

  return null;
}
