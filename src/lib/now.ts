import "server-only";

// Horloge isolée : lire l'heure pendant le rendu rendrait les composants
// impurs. On la lit une fois, au bord, et on la passe en donnée.
export async function currentTime(): Promise<number> {
  return Date.now();
}
