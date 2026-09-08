-- ═══════════════════════════════════════════════════════════════════════════
-- INALTÉRABILITÉ DES ÉMARGEMENTS SIGNÉS
--
-- Un émargement signé est la pièce de preuve la plus sensible du dossier : il
-- atteste qu'une personne était présente à une heure donnée. Les clés
-- étrangères en RESTRICT empêchent déjà de le faire disparaître en supprimant
-- ce qui l'entoure (séance, bloc, leçon, feuille, session), mais rien ne
-- pointe vers la ligne d'émargement elle-même : un DELETE direct passait.
--
-- Ce déclencheur ferme cette porte AU NIVEAU DE LA BASE, quel que soit le
-- chemin employé — application, script, console SQL. Il refuse également de
-- réécrire une signature déjà recueillie.
--
-- Pour une purge légitime (RGPD, données de test), il faut désactiver le
-- déclencheur explicitement : ALTER TABLE public.attendances DISABLE TRIGGER
-- attendances_immutable; — un geste conscient, tracé, et jamais accidentel.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.app_attendance_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.signed_at IS NOT NULL THEN
      RAISE EXCEPTION
        'Emargement signe le % : piece de preuve inalterable, suppression refusee', OLD.signed_at
        USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN OLD;
  END IF;

  -- UPDATE : une signature recueillie ne se réécrit pas.
  IF OLD.signed_at IS NOT NULL AND (
       NEW.signed_at IS DISTINCT FROM OLD.signed_at
    OR NEW.status    IS DISTINCT FROM OLD.status
    OR NEW.user_id   IS DISTINCT FROM OLD.user_id
    OR NEW.seance_id IS DISTINCT FROM OLD.seance_id
    OR NEW.document_id IS DISTINCT FROM OLD.document_id
  ) THEN
    RAISE EXCEPTION
      'Emargement signe le % : piece de preuve inalterable, modification refusee', OLD.signed_at
      USING ERRCODE = 'restrict_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS attendances_immutable ON public.attendances;

CREATE TRIGGER attendances_immutable
  BEFORE DELETE OR UPDATE ON public.attendances
  FOR EACH ROW
  EXECUTE FUNCTION public.app_attendance_immutable();
