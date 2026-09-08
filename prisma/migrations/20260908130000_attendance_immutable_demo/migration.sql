-- ═══════════════════════════════════════════════════════════════════════════
-- INALTÉRABILITÉ : EXEMPTION DES SESSIONS DE DÉMONSTRATION
--
-- Le déclencheur posé précédemment rendait TOUT émargement signé indestructible.
-- C'est ce qu'on veut pour une session réelle. Mais une session de
-- démonstration ne produit aucune preuve — c'est même sa définition — et ses
-- données doivent pouvoir être purgées d'un seul geste.
--
-- La règle devient donc : un émargement signé est inaltérable SI sa session
-- n'est pas marquée comme démonstration. Les vraies pièces restent protégées
-- exactement comme avant ; le générateur de démonstration peut nettoyer les
-- siennes sans jamais désactiver la protection.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.app_attendance_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_is_demo boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.signed_at IS NULL THEN
      RETURN OLD;
    END IF;
    SELECT s.is_demo INTO v_is_demo FROM public.sessions s WHERE s.id = OLD.session_id;
    IF COALESCE(v_is_demo, false) THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION
      'Emargement signe le % : piece de preuve inalterable, suppression refusee', OLD.signed_at
      USING ERRCODE = 'restrict_violation';
  END IF;

  -- UPDATE : une signature recueillie ne se réécrit pas.
  IF OLD.signed_at IS NOT NULL AND (
       NEW.signed_at IS DISTINCT FROM OLD.signed_at
    OR NEW.status    IS DISTINCT FROM OLD.status
    OR NEW.user_id   IS DISTINCT FROM OLD.user_id
    OR NEW.seance_id IS DISTINCT FROM OLD.seance_id
    OR NEW.document_id IS DISTINCT FROM OLD.document_id
  ) THEN
    SELECT s.is_demo INTO v_is_demo FROM public.sessions s WHERE s.id = OLD.session_id;
    IF COALESCE(v_is_demo, false) THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION
      'Emargement signe le % : piece de preuve inalterable, modification refusee', OLD.signed_at
      USING ERRCODE = 'restrict_violation';
  END IF;

  RETURN NEW;
END;
$$;
