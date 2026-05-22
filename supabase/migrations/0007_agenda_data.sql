-- ============================================================================
-- 0007_agenda_data.sql
-- ============================================================================
-- Persistance de l'agenda artisan dans Supabase (avant : localStorage).
--
-- Structure générique key/value JSONB pour stocker :
--  - week-{YYYY-MM-DD}   : créneaux d'une semaine (slots)
--  - titles              : titres des blocs (sur les colonnes)
--  - notes               : notes par cellule
--  - blocked_days        : tableau de dates bloquées
--  - intervention_types  : types d'intervention personnalisés
--
-- Cette structure permet d'évoluer sans changer le schéma à chaque nouveau
-- type de donnée. Tout est isolé par artisan via la colonne artisan_id +
-- RLS stricte.
-- ============================================================================


CREATE TABLE IF NOT EXISTS public.agenda_data (
  artisan_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (artisan_id, key)
);

CREATE INDEX IF NOT EXISTS idx_agenda_data_artisan
  ON public.agenda_data (artisan_id);

COMMENT ON TABLE public.agenda_data IS
  'Stockage générique key/value pour l''agenda d''un artisan (slots, titres, notes, etc.).';


-- RLS : l'artisan ne voit / modifie que ses propres lignes
ALTER TABLE public.agenda_data ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "agenda_data_select_own" ON public.agenda_data;
CREATE POLICY "agenda_data_select_own" ON public.agenda_data
  FOR SELECT TO authenticated
  USING (artisan_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "agenda_data_insert_own" ON public.agenda_data;
CREATE POLICY "agenda_data_insert_own" ON public.agenda_data
  FOR INSERT TO authenticated
  WITH CHECK (artisan_id = auth.uid());

DROP POLICY IF EXISTS "agenda_data_update_own" ON public.agenda_data;
CREATE POLICY "agenda_data_update_own" ON public.agenda_data
  FOR UPDATE TO authenticated
  USING (artisan_id = auth.uid())
  WITH CHECK (artisan_id = auth.uid());

DROP POLICY IF EXISTS "agenda_data_delete_own" ON public.agenda_data;
CREATE POLICY "agenda_data_delete_own" ON public.agenda_data
  FOR DELETE TO authenticated
  USING (artisan_id = auth.uid());


-- Realtime : permettre la synchro entre devices d'un même artisan
ALTER PUBLICATION supabase_realtime ADD TABLE public.agenda_data;
ALTER TABLE public.agenda_data REPLICA IDENTITY FULL;
