-- ============================================================================
-- 0014_national_readiness.sql
-- ============================================================================
-- Préparation au déploiement régional → national (audit du 2 septembre 2026).
--
--   A. Nettoyage RLS : suppression des 26 policies historiques (rôle `public`,
--      noms en français) qui coexistaient avec les policies durcies. Les
--      policies étant combinées en OU, elles annulaient le durcissement
--      (INSERT anonyme sur demandes/avis, UPDATE libre sur messages, etc.).
--   B. Réécriture des policies conservées avec `(select auth.uid())` :
--      évaluées une fois par requête et non par ligne (lint auth_rls_initplan).
--      Découpage des policies ALL en INSERT/UPDATE/DELETE pour ne garder
--      qu'une policy SELECT par rôle (lint multiple_permissive_policies).
--   C. Fonctions : search_path figé, EXECUTE révoqué pour `anon` sur les
--      fonctions SECURITY DEFINER, next_document_number verrouillée
--      (propriétaire + anti-collision).
--   D. Index : doublon supprimé, FK indexées, unicité des numéros de facture.
--   E. Normalisation nationale : norm_text() (minuscules, sans accents),
--      colonnes générées artisans.metier_norm / zones_norm, vue artisans_public
--      étendue, RPC search_artisans() (filtres + tri + pagination côté DB).
--   F. Rate limiting partagé : table rate_limits + check_rate_limit()
--      (service_role uniquement) — remplace le limiteur en mémoire, inopérant
--      sur Vercel (une mémoire par lambda).
--   G. Référentiel localités suisses (swisstopo) : table localites +
--      search_localites() pour l'autocomplétion. Données dans 0015.
--
-- Idempotente. Re-jouable sans casser.
-- ============================================================================


-- ============================================================================
-- E0. Extensions + normalisation de texte
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;

-- unaccent() est STABLE ; on l'enveloppe en IMMUTABLE (dictionnaire figé)
-- pour pouvoir l'utiliser dans des colonnes générées et des index.
-- Miroir JS : src/lib/text.ts → normalizeText(). Garder les deux alignés.
CREATE OR REPLACE FUNCTION public.norm_text(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE PARALLEL SAFE STRICT
SET search_path = public
AS $$
  SELECT btrim(
    regexp_replace(
      lower(extensions.unaccent(p)),
      '[[:space:]\-''’.]+', ' ', 'g'
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.norm_text_array(p text[])
RETURNS text[]
LANGUAGE sql
IMMUTABLE PARALLEL SAFE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p IS NULL THEN NULL
    ELSE coalesce(
      (SELECT array_agg(DISTINCT public.norm_text(z))
         FROM unnest(p) AS z
        WHERE z IS NOT NULL AND btrim(z) <> ''),
      '{}'::text[]
    )
  END;
$$;

GRANT EXECUTE ON FUNCTION public.norm_text(text)         TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.norm_text_array(text[]) TO anon, authenticated, service_role;


-- ============================================================================
-- A. Suppression des policies historiques (rôle `public`)
-- ============================================================================
-- Toutes les policies créées sans clause TO (donc pour `public`) sont les
-- anciennes policies de la V1 HTML. Les policies durcies (0001 → 0013) ciblent
-- explicitement `authenticated` / `anon`. Balayage programmatique : robuste
-- aux accents et aux fautes de frappe dans les noms.

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND roles = '{public}'::name[]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I',
                   r.policyname, r.schemaname, r.tablename);
    RAISE NOTICE 'Policy historique supprimée : %.% → %', r.schemaname, r.tablename, r.policyname;
  END LOOP;
END $$;


-- ============================================================================
-- B. Policies durcies, réécrites en forme initplan
-- ============================================================================
-- Sémantique strictement identique à 0001/0011/0013 ; seule la forme change :
-- auth.uid() → (select auth.uid()), is_admin() → (select public.is_admin()).

-- --- affectations -----------------------------------------------------------
DROP POLICY IF EXISTS "affectations_all_owner" ON public.affectations;
CREATE POLICY "affectations_all_owner" ON public.affectations
  FOR ALL TO authenticated
  USING      (artisan_id = (select auth.uid()) OR (select public.is_admin()))
  WITH CHECK (artisan_id = (select auth.uid()) OR (select public.is_admin()));

-- --- agenda_data ------------------------------------------------------------
DROP POLICY IF EXISTS "agenda_data_select_own" ON public.agenda_data;
DROP POLICY IF EXISTS "agenda_data_insert_own" ON public.agenda_data;
DROP POLICY IF EXISTS "agenda_data_update_own" ON public.agenda_data;
DROP POLICY IF EXISTS "agenda_data_delete_own" ON public.agenda_data;
CREATE POLICY "agenda_data_select_own" ON public.agenda_data
  FOR SELECT TO authenticated
  USING (artisan_id = (select auth.uid()) OR (select public.is_admin()));
CREATE POLICY "agenda_data_insert_own" ON public.agenda_data
  FOR INSERT TO authenticated
  WITH CHECK (artisan_id = (select auth.uid()));
CREATE POLICY "agenda_data_update_own" ON public.agenda_data
  FOR UPDATE TO authenticated
  USING      (artisan_id = (select auth.uid()))
  WITH CHECK (artisan_id = (select auth.uid()));
CREATE POLICY "agenda_data_delete_own" ON public.agenda_data
  FOR DELETE TO authenticated
  USING (artisan_id = (select auth.uid()));

-- --- artisans ---------------------------------------------------------------
DROP POLICY IF EXISTS "artisans_public_select" ON public.artisans;
DROP POLICY IF EXISTS "artisans_self_insert"   ON public.artisans;
DROP POLICY IF EXISTS "artisans_self_update"   ON public.artisans;
DROP POLICY IF EXISTS "artisans_self_delete"   ON public.artisans;
CREATE POLICY "artisans_public_select" ON public.artisans
  FOR SELECT TO anon, authenticated
  USING (true);
CREATE POLICY "artisans_self_insert" ON public.artisans
  FOR INSERT TO authenticated
  WITH CHECK (id = (select auth.uid()));
CREATE POLICY "artisans_self_update" ON public.artisans
  FOR UPDATE TO authenticated
  USING      (id = (select auth.uid()) OR (select public.is_admin()))
  WITH CHECK (id = (select auth.uid()) OR (select public.is_admin()));
CREATE POLICY "artisans_self_delete" ON public.artisans
  FOR DELETE TO authenticated
  USING (id = (select auth.uid()) OR (select public.is_admin()));

-- --- audit_logs -------------------------------------------------------------
DROP POLICY IF EXISTS "audit_logs_select_admin" ON public.audit_logs;
DROP POLICY IF EXISTS "audit_logs_insert_none"  ON public.audit_logs;
DROP POLICY IF EXISTS "audit_logs_no_modify"    ON public.audit_logs;
DROP POLICY IF EXISTS "audit_logs_no_delete"    ON public.audit_logs;
CREATE POLICY "audit_logs_select_admin" ON public.audit_logs
  FOR SELECT TO authenticated
  USING ((select public.is_admin()));
CREATE POLICY "audit_logs_insert_none" ON public.audit_logs
  FOR INSERT TO anon, authenticated
  WITH CHECK (false);
CREATE POLICY "audit_logs_no_modify" ON public.audit_logs
  FOR UPDATE TO authenticated
  USING (false);
CREATE POLICY "audit_logs_no_delete" ON public.audit_logs
  FOR DELETE TO authenticated
  USING (false);

-- --- avis -------------------------------------------------------------------
DROP POLICY IF EXISTS "avis_public_select" ON public.avis;
DROP POLICY IF EXISTS "avis_insert_client" ON public.avis;
DROP POLICY IF EXISTS "avis_update"        ON public.avis;
DROP POLICY IF EXISTS "avis_delete"        ON public.avis;
CREATE POLICY "avis_public_select" ON public.avis
  FOR SELECT TO anon, authenticated
  USING (true);
CREATE POLICY "avis_insert_client" ON public.avis
  FOR INSERT TO authenticated
  WITH CHECK (client_email = (select auth.email()));
CREATE POLICY "avis_update" ON public.avis
  FOR UPDATE TO authenticated
  USING      (artisan_id = (select auth.uid()) OR client_email = (select auth.email()) OR (select public.is_admin()))
  WITH CHECK (artisan_id = (select auth.uid()) OR client_email = (select auth.email()) OR (select public.is_admin()));
CREATE POLICY "avis_delete" ON public.avis
  FOR DELETE TO authenticated
  USING (client_email = (select auth.email()) OR (select public.is_admin()));

-- --- demandes ---------------------------------------------------------------
DROP POLICY IF EXISTS "demandes_select_owner"      ON public.demandes;
DROP POLICY IF EXISTS "demandes_insert_client"     ON public.demandes;
DROP POLICY IF EXISTS "demandes_update_admin_only" ON public.demandes;
DROP POLICY IF EXISTS "demandes_delete"            ON public.demandes;
CREATE POLICY "demandes_select_owner" ON public.demandes
  FOR SELECT TO authenticated
  USING (artisan_id = (select auth.uid()) OR client_email = (select auth.email()) OR (select public.is_admin()));
CREATE POLICY "demandes_insert_client" ON public.demandes
  FOR INSERT TO authenticated
  WITH CHECK (client_email = (select auth.email()));
-- UPDATE direct réservé aux admins ; les artisans passent par update_demande_status()
CREATE POLICY "demandes_update_admin_only" ON public.demandes
  FOR UPDATE TO authenticated
  USING      ((select public.is_admin()))
  WITH CHECK ((select public.is_admin()));
CREATE POLICY "demandes_delete" ON public.demandes
  FOR DELETE TO authenticated
  USING (artisan_id = (select auth.uid()) OR client_email = (select auth.email()) OR (select public.is_admin()));

-- --- documents --------------------------------------------------------------
-- Avant : documents_all_owner (ALL) + documents_select → 2 policies SELECT.
-- Après : 1 SELECT (artisan, client destinataire, admin) + écritures propriétaire.
DROP POLICY IF EXISTS "documents_all_owner"    ON public.documents;
DROP POLICY IF EXISTS "documents_select"       ON public.documents;
DROP POLICY IF EXISTS "documents_insert_owner" ON public.documents;
DROP POLICY IF EXISTS "documents_update_owner" ON public.documents;
DROP POLICY IF EXISTS "documents_delete_owner" ON public.documents;
CREATE POLICY "documents_select" ON public.documents
  FOR SELECT TO authenticated
  USING (artisan_id = (select auth.uid()) OR client_email = (select auth.email()) OR (select public.is_admin()));
CREATE POLICY "documents_insert_owner" ON public.documents
  FOR INSERT TO authenticated
  WITH CHECK (artisan_id = (select auth.uid()) OR (select public.is_admin()));
CREATE POLICY "documents_update_owner" ON public.documents
  FOR UPDATE TO authenticated
  USING      (artisan_id = (select auth.uid()) OR (select public.is_admin()))
  WITH CHECK (artisan_id = (select auth.uid()) OR (select public.is_admin()));
CREATE POLICY "documents_delete_owner" ON public.documents
  FOR DELETE TO authenticated
  USING (artisan_id = (select auth.uid()) OR (select public.is_admin()));

-- --- employes ---------------------------------------------------------------
DROP POLICY IF EXISTS "employes_all_owner" ON public.employes;
CREATE POLICY "employes_all_owner" ON public.employes
  FOR ALL TO authenticated
  USING      (artisan_id = (select auth.uid()) OR (select public.is_admin()))
  WITH CHECK (artisan_id = (select auth.uid()) OR (select public.is_admin()));

-- --- messages ---------------------------------------------------------------
DROP POLICY IF EXISTS "messages_select_participants" ON public.messages;
DROP POLICY IF EXISTS "messages_insert_participants" ON public.messages;
DROP POLICY IF EXISTS "messages_update_admin_only"   ON public.messages;
DROP POLICY IF EXISTS "messages_delete_admin"        ON public.messages;
CREATE POLICY "messages_select_participants" ON public.messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.demandes d
      WHERE d.id = messages.demande_id
        AND (d.artisan_id = (select auth.uid()) OR d.client_email = (select auth.email()))
    )
    OR (select public.is_admin())
  );
CREATE POLICY "messages_insert_participants" ON public.messages
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.demandes d
      WHERE d.id = messages.demande_id
        AND (
          (d.artisan_id = (select auth.uid()) AND messages.sender_type = 'artisan')
          OR (d.client_email = (select auth.email()) AND messages.sender_type = 'client')
        )
    )
  );
-- UPDATE direct réservé aux admins ; participants → mark_messages_read()
CREATE POLICY "messages_update_admin_only" ON public.messages
  FOR UPDATE TO authenticated
  USING      ((select public.is_admin()))
  WITH CHECK ((select public.is_admin()));
CREATE POLICY "messages_delete_admin" ON public.messages
  FOR DELETE TO authenticated
  USING ((select public.is_admin()));

-- --- prestations ------------------------------------------------------------
-- Avant : prestations_public_select + prestations_write_owner (ALL) → 2 SELECT.
DROP POLICY IF EXISTS "prestations_public_select" ON public.prestations;
DROP POLICY IF EXISTS "prestations_write_owner"   ON public.prestations;
DROP POLICY IF EXISTS "prestations_insert_owner"  ON public.prestations;
DROP POLICY IF EXISTS "prestations_update_owner"  ON public.prestations;
DROP POLICY IF EXISTS "prestations_delete_owner"  ON public.prestations;
CREATE POLICY "prestations_public_select" ON public.prestations
  FOR SELECT TO anon, authenticated
  USING (true);
CREATE POLICY "prestations_insert_owner" ON public.prestations
  FOR INSERT TO authenticated
  WITH CHECK (artisan_id = (select auth.uid()) OR (select public.is_admin()));
CREATE POLICY "prestations_update_owner" ON public.prestations
  FOR UPDATE TO authenticated
  USING      (artisan_id = (select auth.uid()) OR (select public.is_admin()))
  WITH CHECK (artisan_id = (select auth.uid()) OR (select public.is_admin()));
CREATE POLICY "prestations_delete_owner" ON public.prestations
  FOR DELETE TO authenticated
  USING (artisan_id = (select auth.uid()) OR (select public.is_admin()));

-- --- signalements -----------------------------------------------------------
DROP POLICY IF EXISTS "signalements_insert_authed" ON public.signalements;
DROP POLICY IF EXISTS "signalements_select_admin"  ON public.signalements;
DROP POLICY IF EXISTS "signalements_update_admin"  ON public.signalements;
DROP POLICY IF EXISTS "signalements_delete_admin"  ON public.signalements;
CREATE POLICY "signalements_insert_authed" ON public.signalements
  FOR INSERT TO authenticated
  WITH CHECK (reporter_id = (select auth.uid()) OR reporter_email = (select auth.email()));
CREATE POLICY "signalements_select_admin" ON public.signalements
  FOR SELECT TO authenticated
  USING ((select public.is_admin()));
CREATE POLICY "signalements_update_admin" ON public.signalements
  FOR UPDATE TO authenticated
  USING      ((select public.is_admin()))
  WITH CHECK ((select public.is_admin()));
CREATE POLICY "signalements_delete_admin" ON public.signalements
  FOR DELETE TO authenticated
  USING ((select public.is_admin()));

-- admins_no_client_access (0001) : USING (false) — aucune fonction auth, inchangée.


-- ============================================================================
-- C. Fonctions : search_path, EXECUTE, next_document_number
-- ============================================================================

ALTER FUNCTION public.get_booked_slots(uuid) SET search_path = public;
ALTER FUNCTION public.update_updated_at()    SET search_path = public;

-- Numérotation devis/factures :
--   - réservée au propriétaire (ou admin) : un artisan ne peut plus compter
--     les documents d'un autre ;
--   - verrou consultatif par (artisan, type) pour sérialiser les appels
--     concurrents dans une même transaction ;
--   - l'index unique idx_documents_artisan_numero (section D) garantit
--     qu'une collision entre « obtenir le numéro » et « insérer » échoue
--     proprement au lieu de produire deux factures identiques.
CREATE OR REPLACE FUNCTION public.next_document_number(p_artisan_id uuid, p_type text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  prefix   text;
  year_str text;
  next_num integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;
  IF p_artisan_id IS DISTINCT FROM auth.uid() AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Accès refusé : numérotation réservée au propriétaire';
  END IF;
  IF p_type NOT IN ('devis', 'facture') THEN
    RAISE EXCEPTION 'Type de document invalide : %', p_type;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_artisan_id::text || ':' || p_type));

  prefix   := CASE p_type WHEN 'devis' THEN 'DEV' ELSE 'FAC' END;
  year_str := to_char(now(), 'YYYY');

  SELECT coalesce(max(nullif(split_part(numero, '-', 3), '')::integer), 0) + 1
    INTO next_num
    FROM public.documents
   WHERE artisan_id = p_artisan_id
     AND type = p_type
     AND numero LIKE prefix || '-' || year_str || '-%';

  RETURN prefix || '-' || year_str || '-' || lpad(next_num::text, 3, '0');
END;
$$;

-- Fonctions trigger : jamais appelées via l'API REST.
REVOKE EXECUTE ON FUNCTION public.avis_edit_guard()  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at() FROM PUBLIC, anon, authenticated;

-- Fonctions réservées aux utilisateurs connectés (gardes internes conservées).
REVOKE EXECUTE ON FUNCTION public.is_admin()                                       FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_artisan_bank_details_admin(uuid)             FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_artisan_ide_admin(uuid)                      FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.revoke_artisan_ide_admin(uuid, text)             FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.record_audit_event(text, text, uuid, jsonb)      FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.update_demande_status(uuid, text)                FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.mark_messages_read(uuid)                         FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.next_document_number(uuid, text)                 FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_my_bank_details()                            FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.update_my_bank_details(text, text, text, text)   FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_my_unread_counts_artisan()                   FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_my_unread_counts_client()                    FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.delete_my_account()                              FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.is_admin()                                        TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_artisan_bank_details_admin(uuid)              TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_artisan_ide_admin(uuid)                       TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.revoke_artisan_ide_admin(uuid, text)              TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_audit_event(text, text, uuid, jsonb)       TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_demande_status(uuid, text)                 TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mark_messages_read(uuid)                          TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.next_document_number(uuid, text)                  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_my_bank_details()                             TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_my_bank_details(text, text, text, text)    TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_my_unread_counts_artisan()                    TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_my_unread_counts_client()                     TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_my_account()                               TO authenticated, service_role;

-- Réservée au service_role (appelée par /api/verify-ide avec la clé serveur).
REVOKE EXECUTE ON FUNCTION public.set_ide_verification_admin(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.set_ide_verification_admin(uuid, text, text, text) TO service_role;

-- Restent publiques (visiteur non connecté) :
--   check_completed_demande(uuid, text) — badge « avis vérifié » sur /avis
--   get_booked_slots(uuid)              — créneaux déjà pris sur /demande
GRANT EXECUTE ON FUNCTION public.check_completed_demande(uuid, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_booked_slots(uuid)              TO anon, authenticated, service_role;


-- ============================================================================
-- D. Index
-- ============================================================================

-- Doublon exact de idx_messages_demande_created
DROP INDEX IF EXISTS public.idx_messages_demande;

-- FK sans index (lint unindexed_foreign_keys)
CREATE INDEX IF NOT EXISTS idx_affectations_demande
  ON public.affectations (demande_id) WHERE demande_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_documents_devis_source
  ON public.documents (devis_source_id) WHERE devis_source_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_signalements_reporter
  ON public.signalements (reporter_id) WHERE reporter_id IS NOT NULL;

-- Deux documents d'un même artisan ne peuvent pas porter le même numéro.
CREATE UNIQUE INDEX IF NOT EXISTS idx_documents_artisan_numero
  ON public.documents (artisan_id, numero);


-- ============================================================================
-- G. Référentiel localités suisses (données : 0015_localites_seed.sql)
-- ============================================================================
-- Placée avant E : search_artisans() référence la table (une fonction SQL est
-- validée à sa création, la table doit donc déjà exister).

CREATE TABLE IF NOT EXISTS public.localites (
  id       bigint  GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  npa      integer NOT NULL,
  nom      text    NOT NULL,
  nom_norm text    GENERATED ALWAYS AS (public.norm_text(nom)) STORED,
  commune  text,
  bfs_nr   integer,
  canton   char(2) NOT NULL,
  lat      double precision,
  lng      double precision,
  langue   text,
  UNIQUE (nom, npa)
);
COMMENT ON TABLE public.localites IS
  'Localités suisses officielles (swisstopo, Ortschaftenverzeichnis PLZ). Base de l''autocomplétion et du filtre canton.';

CREATE INDEX IF NOT EXISTS idx_localites_nom_norm ON public.localites (nom_norm text_pattern_ops);
CREATE INDEX IF NOT EXISTS idx_localites_npa      ON public.localites (npa);
CREATE INDEX IF NOT EXISTS idx_localites_canton   ON public.localites (canton);

ALTER TABLE public.localites ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "localites_public_select" ON public.localites;
CREATE POLICY "localites_public_select" ON public.localites
  FOR SELECT TO anon, authenticated
  USING (true);
GRANT SELECT ON public.localites TO anon, authenticated;

-- Autocomplétion : préfixe de nom (ou de mot dans le nom) ou préfixe de NPA.
-- Une ligne par (nom, canton) : « Lausanne » sort une fois, pas 15 (NPA).
CREATE OR REPLACE FUNCTION public.search_localites(p_q text, p_limit integer DEFAULT 8)
RETURNS TABLE (nom text, npa integer, canton text, commune text)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH q AS (
    SELECT public.norm_text(coalesce(p_q, '')) AS n,
           btrim(coalesce(p_q, ''))            AS raw
  )
  SELECT s.nom, s.npa, s.canton, s.commune
  FROM (
    SELECT DISTINCT ON (l.nom, l.canton)
      l.nom, l.npa, l.canton::text AS canton, l.commune,
      CASE
        WHEN l.nom_norm LIKE q.n || '%'                     THEN 0
        WHEN q.raw ~ '^[0-9]{2,4}$' AND l.npa::text LIKE q.raw || '%' THEN 1
        ELSE 2
      END AS rank
    FROM public.localites l, q
    WHERE length(q.n) >= 1
      AND (
        l.nom_norm LIKE q.n || '%'
        OR l.nom_norm LIKE '% ' || q.n || '%'
        OR (q.raw ~ '^[0-9]{2,4}$' AND l.npa::text LIKE q.raw || '%')
      )
    ORDER BY l.nom, l.canton, l.npa
  ) s
  ORDER BY s.rank, length(s.nom), s.nom
  LIMIT greatest(1, least(coalesce(p_limit, 8), 20));
$$;

GRANT EXECUTE ON FUNCTION public.search_localites(text, integer) TO anon, authenticated, service_role;


-- ============================================================================
-- E. Normalisation nationale des artisans + recherche côté DB
-- ============================================================================

-- Colonnes générées : toujours cohérentes avec metier / zones, sans trigger.
ALTER TABLE public.artisans
  ADD COLUMN IF NOT EXISTS metier_norm text
    GENERATED ALWAYS AS (public.norm_text(metier)) STORED,
  ADD COLUMN IF NOT EXISTS zones_norm text[]
    GENERATED ALWAYS AS (public.norm_text_array(zones)) STORED;

COMMENT ON COLUMN public.artisans.metier_norm IS 'Métier normalisé (norm_text) — filtre de recherche';
COMMENT ON COLUMN public.artisans.zones_norm  IS 'Zones normalisées (norm_text) — filtre de recherche';

-- Les colonnes sont sélectionnables par l'API (la table a un GRANT par colonne).
GRANT SELECT (metier_norm, zones_norm) ON public.artisans TO anon, authenticated;

-- Index de recherche (remplacent lower(metier) et zones bruts)
DROP INDEX IF EXISTS public.idx_artisans_metier;
DROP INDEX IF EXISTS public.idx_artisans_zones_gin;
CREATE INDEX IF NOT EXISTS idx_artisans_metier_norm    ON public.artisans (metier_norm);
CREATE INDEX IF NOT EXISTS idx_artisans_zones_norm_gin ON public.artisans USING gin (zones_norm);

-- Vue publique (0004) étendue des colonnes normalisées. Même ordre de colonnes
-- qu'avant + les nouvelles à la fin (contrainte de CREATE OR REPLACE VIEW).
CREATE OR REPLACE VIEW public.artisans_public
WITH (security_invoker = true) AS
  SELECT
    id, prenom, nom, entreprise, telephone, email, adresse, site,
    metier, specialites, zones, description, horaires,
    urgence, urgence_supplement, urgence_rayon, urgence_heure_debut,
    urgence_heure_fin, urgence_jours, contact_prefs, disponibilites,
    avatar_url, gallery_urls, ide_verified, ide_company_name,
    created_at, updated_at,
    metier_norm, zones_norm
  FROM public.artisans;

GRANT SELECT ON public.artisans_public TO anon, authenticated;

-- Recherche : filtres, agrégation des avis, tri et pagination côté DB.
-- SECURITY INVOKER : passe par la vue publique (pas de colonnes bancaires)
-- et par les policies SELECT publiques d'artisans / avis.
--
--   p_sort : 'pertinence' (vérifiés IDE, puis nb d'avis, puis récents)
--            'meilleure-note' | 'plus-avis'
--   Retour : une ligne par artisan { item jsonb, total_count } ;
--            item contient avg_note et nb_avis.
CREATE OR REPLACE FUNCTION public.search_artisans(
  p_metier    text    DEFAULT NULL,
  p_ville     text    DEFAULT NULL,
  p_canton    text    DEFAULT NULL,
  p_urgence   boolean DEFAULT false,
  p_note_min  numeric DEFAULT 0,
  p_sort      text    DEFAULT 'pertinence',
  p_page      integer DEFAULT 0,
  p_page_size integer DEFAULT 20
)
RETURNS TABLE (item jsonb, total_count bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH params AS (
    SELECT
      nullif(public.norm_text(coalesce(p_metier, '')), '') AS metier_n,
      nullif(public.norm_text(coalesce(p_ville,  '')), '') AS ville_n,
      nullif(upper(btrim(coalesce(p_canton, ''))), '')     AS canton_u,
      greatest(1, least(coalesce(p_page_size, 20), 100))   AS page_size,
      greatest(0, coalesce(p_page, 0))                     AS page
  ),
  base AS (
    SELECT
      a.*,
      round(coalesce(s.avg_note, 0)::numeric, 2) AS avg_note,
      coalesce(s.nb_avis, 0)::integer            AS nb_avis
    FROM public.artisans_public a
    CROSS JOIN params p
    LEFT JOIN LATERAL (
      SELECT avg(v.note) AS avg_note, count(*) AS nb_avis
      FROM public.avis v
      WHERE v.artisan_id = a.id
    ) s ON true
    WHERE (p.metier_n IS NULL OR a.metier_norm = p.metier_n)
      AND (p.ville_n  IS NULL OR a.zones_norm @> ARRAY[p.ville_n])
      AND (p.canton_u IS NULL OR EXISTS (
             SELECT 1 FROM public.localites l
             WHERE l.canton = p.canton_u AND l.nom_norm = ANY (a.zones_norm)))
      AND (NOT coalesce(p_urgence, false) OR a.urgence = true)
  ),
  filtered AS (
    SELECT * FROM base
    WHERE coalesce(p_note_min, 0) <= 0 OR avg_note >= p_note_min
  )
  SELECT
    (to_jsonb(f) - 'metier_norm' - 'zones_norm') AS item,
    count(*) OVER ()                            AS total_count
  FROM filtered f, params p
  ORDER BY
    CASE WHEN p_sort = 'meilleure-note' THEN f.avg_note END DESC NULLS LAST,
    CASE WHEN p_sort = 'plus-avis'      THEN f.nb_avis  END DESC NULLS LAST,
    CASE WHEN coalesce(p_sort, 'pertinence') NOT IN ('meilleure-note', 'plus-avis')
         THEN (f.ide_verified IS TRUE)::integer END DESC,
    f.nb_avis DESC,
    f.created_at DESC
  LIMIT  (SELECT page_size FROM params)
  OFFSET (SELECT page * page_size FROM params);
$$;

GRANT EXECUTE ON FUNCTION public.search_artisans(text, text, text, boolean, numeric, text, integer, integer)
  TO anon, authenticated, service_role;


-- ============================================================================
-- F. Rate limiting partagé (remplace le limiteur mémoire)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.rate_limits (
  key      text        PRIMARY KEY,
  count    integer     NOT NULL DEFAULT 0,
  reset_at timestamptz NOT NULL
);
COMMENT ON TABLE public.rate_limits IS
  'Compteurs de rate limiting des API routes. Accès service_role uniquement via check_rate_limit().';

ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rate_limits FROM PUBLIC, anon, authenticated;
-- Aucune policy : même le service_role passe par la fonction ci-dessous.

CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_key       text,
  p_window_ms integer,
  p_max       integer
)
RETURNS TABLE (allowed boolean, remaining integer, retry_after_sec integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now   timestamptz := clock_timestamp();
  v_win   interval    := make_interval(secs => greatest(p_window_ms, 1000) / 1000.0);
  v_count integer;
  v_reset timestamptz;
BEGIN
  INSERT INTO public.rate_limits AS r (key, count, reset_at)
  VALUES (p_key, 1, v_now + v_win)
  ON CONFLICT (key) DO UPDATE SET
    count    = CASE WHEN r.reset_at < v_now THEN 1 ELSE r.count + 1 END,
    reset_at = CASE WHEN r.reset_at < v_now THEN v_now + v_win ELSE r.reset_at END
  RETURNING r.count, r.reset_at INTO v_count, v_reset;

  -- Nettoyage opportuniste (~1 % des appels) des compteurs expirés.
  IF random() < 0.01 THEN
    DELETE FROM public.rate_limits WHERE reset_at < v_now - interval '1 hour';
  END IF;

  allowed         := v_count <= p_max;
  remaining       := greatest(0, p_max - v_count);
  retry_after_sec := CASE WHEN allowed THEN 0
                          ELSE greatest(1, ceil(extract(epoch FROM (v_reset - v_now)))::integer) END;
  RETURN NEXT;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.check_rate_limit(text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.check_rate_limit(text, integer, integer) TO service_role;


-- ============================================================================
-- ✅ Tests post-migration (SQL Editor)
-- ============================================================================
--
-- 1. Plus aucune policy historique :
--    SELECT count(*) FROM pg_policies WHERE schemaname='public' AND roles='{public}';
--    → 0
--
-- 2. Normalisation :
--    SELECT public.norm_text('Épalinges'), public.norm_text('Yverdon-les-Bains');
--    → 'epalinges' | 'yverdon les bains'
--
-- 3. Recherche (après 0015) :
--    SELECT item->>'entreprise', item->>'avg_note', total_count
--    FROM public.search_artisans('électricien', 'Lausanne');
--
-- 4. Rate limit (rôle service_role) :
--    SELECT * FROM public.check_rate_limit('test:1', 60000, 2);  -- ×3 → allowed=false
--
-- 5. Autocomplétion (après 0015) :
--    SELECT * FROM public.search_localites('yver');
-- ============================================================================
