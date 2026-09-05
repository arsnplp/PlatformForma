-- ═════════════════════════════════════════════════════════════════════════════
-- Sécurité applicative (spec §4)
--   1. Synchronisation auth.users → public.users (trigger)
--   2. Fonctions d'aide RLS (permissions en DONNÉES, jamais de rôle en dur)
--   3. Activation du RLS + policies sur toutes les tables
--   4. Nettoyage des privilèges par défaut Supabase (anon / authenticated)
--
-- Rappel : le rôle `postgres` (Prisma) et `service_role` contournent le RLS.
-- Le RLS protège l'accès direct via supabase-js / PostgREST / Storage ;
-- l'application vérifie les permissions côté serveur (src/lib/auth).
-- Les références au schéma `auth` sont en plpgsql ou gardées par un test
-- d'existence, pour que la migration passe aussi sur la shadow database.
-- ═════════════════════════════════════════════════════════════════════════════

-- ─── 1. auth.users → public.users ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.app_handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, email, name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'name', split_part(NEW.email, '@', 1))
  )
  ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.app_handle_auth_user_email_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.email IS DISTINCT FROM OLD.email THEN
    UPDATE public.users SET email = NEW.email WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'auth') THEN
    DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
    CREATE TRIGGER on_auth_user_created
      AFTER INSERT ON auth.users
      FOR EACH ROW EXECUTE FUNCTION public.app_handle_new_auth_user();

    DROP TRIGGER IF EXISTS on_auth_user_email_changed ON auth.users;
    CREATE TRIGGER on_auth_user_email_changed
      AFTER UPDATE OF email ON auth.users
      FOR EACH ROW EXECUTE FUNCTION public.app_handle_auth_user_email_change();
  END IF;
END
$$;

-- ─── 2. Fonctions d'aide RLS ─────────────────────────────────────────────────
-- SECURITY DEFINER : elles lisent user_roles / sessions / enrollments sans
-- déclencher récursivement le RLS de ces tables.

CREATE OR REPLACE FUNCTION public.app_current_user_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN auth.uid();
END;
$$;

CREATE OR REPLACE FUNCTION public.app_has_permission(p_key text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.role_permissions rp ON rp.role_id = ur.role_id
    JOIN public.permissions p ON p.id = rp.permission_id
    JOIN public.users u ON u.id = ur.user_id
    WHERE ur.user_id = public.app_current_user_id()
      AND u.archived_at IS NULL
      AND p.key = p_key
  );
END;
$$;

-- « voit tout » = possède can_view_all_dossiers (donnée, modifiable sans code)
CREATE OR REPLACE FUNCTION public.app_sees_everything()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.app_has_permission('can_view_all_dossiers');
END;
$$;

CREATE OR REPLACE FUNCTION public.app_is_trainer_of(p_session uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.sessions s
    WHERE s.id = p_session AND s.trainer_id = public.app_current_user_id()
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.app_is_enrolled_in(p_session uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.enrollments e
    WHERE e.session_id = p_session AND e.user_id = public.app_current_user_id()
  );
END;
$$;

-- Accès au MODÈLE (contenu d'une version) : admin, formateur d'une session
-- sur cette version, ou élève inscrit à une session sur cette version.
CREATE OR REPLACE FUNCTION public.app_can_read_version(p_version uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.app_sees_everything() THEN RETURN true; END IF;
  RETURN EXISTS (
    SELECT 1
    FROM public.sessions s
    LEFT JOIN public.enrollments e ON e.session_id = s.id
    WHERE s.formation_version_id = p_version
      AND (s.trainer_id = public.app_current_user_id()
           OR e.user_id = public.app_current_user_id())
  );
END;
$$;

-- Accès au PROCESS d'une version (templates d'étapes / de mails) : admin ou
-- formateur d'une session sur cette version. Jamais les élèves.
CREATE OR REPLACE FUNCTION public.app_can_read_version_process(p_version uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.app_sees_everything() THEN RETURN true; END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.sessions s
    WHERE s.formation_version_id = p_version
      AND s.trainer_id = public.app_current_user_id()
  );
END;
$$;

-- ─── 3. RLS : activation + policies (lecture) ────────────────────────────────
-- Aucune policy d'écriture : les écritures passent par le serveur (Prisma),
-- protégées par les vérifications de permissions applicatives.

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.access_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prospects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.formations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.formation_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.process_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.step_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.step_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.time_aggregates ENABLE ROW LEVEL SECURITY;

-- Identité & rôles
CREATE POLICY users_select ON public.users FOR SELECT TO authenticated USING (
  id = public.app_current_user_id()
  OR public.app_sees_everything()
  OR public.app_has_permission('can_manage_users')
  OR EXISTS (
    SELECT 1 FROM public.enrollments e
    JOIN public.sessions s ON s.id = e.session_id
    WHERE e.user_id = users.id AND s.trainer_id = public.app_current_user_id()
  )
);
CREATE POLICY roles_select ON public.roles FOR SELECT TO authenticated USING (true);
CREATE POLICY permissions_select ON public.permissions FOR SELECT TO authenticated USING (true);
CREATE POLICY role_permissions_select ON public.role_permissions FOR SELECT TO authenticated USING (true);
CREATE POLICY user_roles_select ON public.user_roles FOR SELECT TO authenticated USING (
  user_id = public.app_current_user_id()
  OR public.app_sees_everything()
  OR public.app_has_permission('can_manage_users')
);
CREATE POLICY access_logs_select ON public.access_logs FOR SELECT TO authenticated USING (
  public.app_sees_everything()
);

-- CRM
CREATE POLICY companies_select ON public.companies FOR SELECT TO authenticated USING (
  public.app_sees_everything()
  OR EXISTS (
    SELECT 1 FROM public.sessions s
    WHERE s.company_id = companies.id AND s.trainer_id = public.app_current_user_id()
  )
);
CREATE POLICY prospects_select ON public.prospects FOR SELECT TO authenticated USING (
  public.app_sees_everything()
);

-- Modèle : formations et contenu
CREATE POLICY formations_select ON public.formations FOR SELECT TO authenticated USING (
  public.app_sees_everything()
  OR EXISTS (
    SELECT 1 FROM public.formation_versions v
    WHERE v.formation_id = formations.id AND public.app_can_read_version(v.id)
  )
);
CREATE POLICY formation_versions_select ON public.formation_versions FOR SELECT TO authenticated USING (
  public.app_can_read_version(id)
);
CREATE POLICY modules_select ON public.modules FOR SELECT TO authenticated USING (
  public.app_can_read_version(formation_version_id)
);
CREATE POLICY lessons_select ON public.lessons FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.modules m
    WHERE m.id = lessons.module_id AND public.app_can_read_version(m.formation_version_id)
  )
);
CREATE POLICY content_blocks_select ON public.content_blocks FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.lessons l
    JOIN public.modules m ON m.id = l.module_id
    WHERE l.id = content_blocks.lesson_id AND public.app_can_read_version(m.formation_version_id)
  )
);
CREATE POLICY exercises_select ON public.exercises FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.modules m
    WHERE m.id = exercises.module_id AND public.app_can_read_version(m.formation_version_id)
  )
  OR EXISTS (
    SELECT 1 FROM public.lessons l
    JOIN public.modules m ON m.id = l.module_id
    WHERE l.id = exercises.lesson_id AND public.app_can_read_version(m.formation_version_id)
  )
);

-- Modèle : process (jamais visible des élèves)
CREATE POLICY process_templates_select ON public.process_templates FOR SELECT TO authenticated USING (
  public.app_can_read_version_process(formation_version_id)
);
CREATE POLICY step_templates_select ON public.step_templates FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.process_templates pt
    WHERE pt.id = step_templates.process_template_id
      AND public.app_can_read_version_process(pt.formation_version_id)
  )
);
CREATE POLICY message_templates_select ON public.message_templates FOR SELECT TO authenticated USING (
  public.app_can_read_version_process(formation_version_id)
);

-- Vécu : sessions et dossiers
CREATE POLICY sessions_select ON public.sessions FOR SELECT TO authenticated USING (
  public.app_sees_everything()
  OR trainer_id = public.app_current_user_id()
  OR public.app_is_enrolled_in(id)
);
CREATE POLICY enrollments_select ON public.enrollments FOR SELECT TO authenticated USING (
  public.app_sees_everything()
  OR user_id = public.app_current_user_id()
  OR public.app_is_trainer_of(session_id)
);
CREATE POLICY step_instances_select ON public.step_instances FOR SELECT TO authenticated USING (
  public.app_sees_everything()
  OR public.app_is_trainer_of(session_id)
);
CREATE POLICY documents_select ON public.documents FOR SELECT TO authenticated USING (
  public.app_sees_everything()
  OR owner_user_id = public.app_current_user_id()
  OR (session_id IS NOT NULL AND public.app_is_trainer_of(session_id))
);
CREATE POLICY attendances_select ON public.attendances FOR SELECT TO authenticated USING (
  public.app_sees_everything()
  OR user_id = public.app_current_user_id()
  OR public.app_is_trainer_of(session_id)
);
CREATE POLICY conversations_select ON public.conversations FOR SELECT TO authenticated USING (
  public.app_sees_everything()
  OR user_id = public.app_current_user_id()
  OR public.app_is_trainer_of(session_id)
);
CREATE POLICY messages_select ON public.messages FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = messages.conversation_id
      AND (public.app_sees_everything()
           OR c.user_id = public.app_current_user_id()
           OR public.app_is_trainer_of(c.session_id))
  )
);
CREATE POLICY submissions_select ON public.submissions FOR SELECT TO authenticated USING (
  public.app_sees_everything()
  OR user_id = public.app_current_user_id()
  OR public.app_is_trainer_of(session_id)
);
CREATE POLICY activity_logs_select ON public.activity_logs FOR SELECT TO authenticated USING (
  public.app_sees_everything()
  OR user_id = public.app_current_user_id()
  OR public.app_is_trainer_of(session_id)
);
CREATE POLICY time_aggregates_select ON public.time_aggregates FOR SELECT TO authenticated USING (
  public.app_sees_everything()
  OR user_id = public.app_current_user_id()
  OR public.app_is_trainer_of(session_id)
);

-- ─── 4. Privilèges : plus rien pour anon, lecture/écriture seulement pour
--        authenticated (TRUNCATE contourne le RLS : retiré).
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
REVOKE TRUNCATE, TRIGGER, REFERENCES ON ALL TABLES IN SCHEMA public FROM authenticated;
DO $$
BEGIN
  IF to_regclass('public._prisma_migrations') IS NOT NULL THEN
    REVOKE ALL ON public._prisma_migrations FROM anon, authenticated;
  END IF;
END
$$;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE TRUNCATE, TRIGGER, REFERENCES ON TABLES FROM authenticated;
