-- ============================================================================
-- 0003_audit_logs.sql
-- ============================================================================
-- Journal des actions admin (audit trail) :
-- qui a supprimé quoi, accepté quel signalement, etc.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_email TEXT,
  action TEXT NOT NULL,      -- ex: 'delete_avis', 'accept_signalement', 'delete_demande'
  target_type TEXT,          -- ex: 'avis', 'demande', 'signalement', 'artisan'
  target_id UUID,
  details JSONB,             -- métadonnées libres (raison, valeur précédente, etc.)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON public.audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON public.audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON public.audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_target ON public.audit_logs(target_type, target_id);

COMMENT ON TABLE public.audit_logs IS 'Journal des actions sensibles : qui a fait quoi et quand';

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- INSERT : utilisateurs authentifiés (le filtrage métier se fait côté app)
-- L'actor_id doit correspondre à l'utilisateur courant pour éviter l'usurpation
DROP POLICY IF EXISTS "audit_logs_insert_self" ON public.audit_logs;
CREATE POLICY "audit_logs_insert_self" ON public.audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (actor_id = auth.uid());

-- SELECT : admins uniquement
DROP POLICY IF EXISTS "audit_logs_select_admin" ON public.audit_logs;
CREATE POLICY "audit_logs_select_admin" ON public.audit_logs
  FOR SELECT TO authenticated
  USING (public.is_admin());

-- Personne ne peut modifier/supprimer (audit immutable)
DROP POLICY IF EXISTS "audit_logs_no_modify" ON public.audit_logs;
CREATE POLICY "audit_logs_no_modify" ON public.audit_logs
  FOR UPDATE TO authenticated
  USING (false);

DROP POLICY IF EXISTS "audit_logs_no_delete" ON public.audit_logs;
CREATE POLICY "audit_logs_no_delete" ON public.audit_logs
  FOR DELETE TO authenticated
  USING (false);
