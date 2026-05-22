-- ============================================================================
-- 0002_signalements.sql
-- ============================================================================
-- Table pour les signalements d'avis et de profils par les utilisateurs.
-- À exécuter dans le SQL Editor de Supabase.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.signalements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cible_type TEXT NOT NULL CHECK (cible_type IN ('avis', 'artisan', 'demande')),
  cible_id UUID NOT NULL,
  raison TEXT NOT NULL,
  details TEXT,
  reporter_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reporter_email TEXT,
  statut TEXT NOT NULL DEFAULT 'nouveau' CHECK (statut IN ('nouveau', 'examine', 'rejete', 'accepte')),
  notes_admin TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_signalements_statut ON public.signalements(statut);
CREATE INDEX IF NOT EXISTS idx_signalements_cible ON public.signalements(cible_type, cible_id);
CREATE INDEX IF NOT EXISTS idx_signalements_created ON public.signalements(created_at DESC);

COMMENT ON TABLE public.signalements IS 'Signalements utilisateurs : avis ou profils inappropriés';

-- RLS
ALTER TABLE public.signalements ENABLE ROW LEVEL SECURITY;

-- INSERT : utilisateur authentifié peut signaler (rate limité côté app)
DROP POLICY IF EXISTS "signalements_insert_authed" ON public.signalements;
CREATE POLICY "signalements_insert_authed" ON public.signalements
  FOR INSERT TO authenticated
  WITH CHECK (reporter_id = auth.uid() OR reporter_email = auth.email());

-- SELECT : admins uniquement (les users ne voient pas leurs propres signalements)
DROP POLICY IF EXISTS "signalements_select_admin" ON public.signalements;
CREATE POLICY "signalements_select_admin" ON public.signalements
  FOR SELECT TO authenticated
  USING (public.is_admin());

-- UPDATE/DELETE : admins uniquement
DROP POLICY IF EXISTS "signalements_update_admin" ON public.signalements;
CREATE POLICY "signalements_update_admin" ON public.signalements
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "signalements_delete_admin" ON public.signalements;
CREATE POLICY "signalements_delete_admin" ON public.signalements
  FOR DELETE TO authenticated
  USING (public.is_admin());
