// ═══════════════════════════════════════════════════════════════════════════
// TEMPS DE CONNEXION (spec §9)
//
// Double usage : suivi pédagogique et preuve d'assiduité FOAD exigée par
// l'OPCO. Des chiffres inutilisables en audit sont pires que pas de chiffres :
// un onglet oublié une nuit fabriquerait huit heures de formation fictives.
//
// D'où trois garde-fous :
//   • le battement n'est émis que si la page est visible ET que l'apprenant a
//     interagi récemment ;
//   • le serveur borne ce qu'il accepte : un battement ne peut jamais valoir
//     plus que l'intervalle prévu, marge comprise ;
//   • un battement isolé (onglet rouvert après des heures) ne crédite que son
//     propre intervalle, jamais le temps écoulé depuis le précédent.
// ═══════════════════════════════════════════════════════════════════════════

/// Intervalle entre deux battements, côté navigateur.
export const HEARTBEAT_SECONDS = 30;

/// Sans interaction pendant ce délai, on considère l'apprenant absent.
export const IDLE_SECONDS = 180;

/// Plafond serveur d'un battement : l'intervalle plus une marge de latence.
export const MAX_HEARTBEAT_SECONDS = HEARTBEAT_SECONDS + 15;

export function formatSeconds(total: number): string {
  if (total < 60) return `${total} s`;
  const minutes = Math.floor(total / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${String(rest).padStart(2, "0")}`;
}
