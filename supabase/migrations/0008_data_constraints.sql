-- ============================================================================
-- 0008_data_constraints.sql
-- ============================================================================
-- Validation des données au niveau Postgres (défense en profondeur).
--
-- Couches de validation Artisano :
--  1. Zod côté client/API route → UX immédiate + sécurité serveur Next.js
--  2. RLS Postgres → contrôle d'accès aux lignes (qui peut voir/écrire)
--  3. CHECK constraints → cohérence des valeurs (cette migration)
--  4. Triggers/RPC → règles métier complexes
--
-- Cette migration ajoute la couche 3 + 4.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. CONTRAINTES SUR public.demandes
-- ----------------------------------------------------------------------------

-- Enum strict des statuts (au lieu d'accepter n'importe quelle string)
DO $$
BEGIN
  -- Drop la contrainte si elle existe déjà (idempotent)
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'demandes_statut_valid' AND conrelid = 'public.demandes'::regclass
  ) THEN
    ALTER TABLE public.demandes DROP CONSTRAINT demandes_statut_valid;
  END IF;
END $$;

ALTER TABLE public.demandes
  ADD CONSTRAINT demandes_statut_valid
  CHECK (statut IN ('nouvelle', 'acceptee', 'confirmee', 'refusee', 'terminee'));

-- Type strict : 'message' ou 'devis'
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'demandes_type_valid' AND conrelid = 'public.demandes'::regclass
  ) THEN
    ALTER TABLE public.demandes DROP CONSTRAINT demandes_type_valid;
  END IF;
END $$;

ALTER TABLE public.demandes
  ADD CONSTRAINT demandes_type_valid
  CHECK (type IN ('message', 'devis'));

-- Longueurs raisonnables
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'demandes_message_length' AND conrelid = 'public.demandes'::regclass
  ) THEN
    ALTER TABLE public.demandes DROP CONSTRAINT demandes_message_length;
  END IF;
END $$;

ALTER TABLE public.demandes
  ADD CONSTRAINT demandes_message_length
  CHECK (char_length(message) BETWEEN 1 AND 5000);


-- ----------------------------------------------------------------------------
-- 2. CONTRAINTES SUR public.avis
-- ----------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'avis_note_range' AND conrelid = 'public.avis'::regclass
  ) THEN
    ALTER TABLE public.avis DROP CONSTRAINT avis_note_range;
  END IF;
END $$;

ALTER TABLE public.avis
  ADD CONSTRAINT avis_note_range
  CHECK (note BETWEEN 1 AND 5);


-- ----------------------------------------------------------------------------
-- 3. CONTRAINTES SUR public.documents (devis / factures)
-- ----------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'documents_type_valid' AND conrelid = 'public.documents'::regclass
  ) THEN
    ALTER TABLE public.documents DROP CONSTRAINT documents_type_valid;
  END IF;
END $$;

ALTER TABLE public.documents
  ADD CONSTRAINT documents_type_valid
  CHECK (type IN ('devis', 'facture'));

-- Montants positifs ou zéro
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'documents_amounts_positive' AND conrelid = 'public.documents'::regclass
  ) THEN
    ALTER TABLE public.documents DROP CONSTRAINT documents_amounts_positive;
  END IF;
END $$;

ALTER TABLE public.documents
  ADD CONSTRAINT documents_amounts_positive
  CHECK (
    sous_total >= 0
    AND montant_tva >= 0
    AND total_ttc >= 0
    AND taux_tva >= 0 AND taux_tva <= 100
  );


-- ----------------------------------------------------------------------------
-- 4. CONTRAINTES SUR public.prestations
-- ----------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'prestations_prix_positive' AND conrelid = 'public.prestations'::regclass
  ) THEN
    ALTER TABLE public.prestations DROP CONSTRAINT prestations_prix_positive;
  END IF;
END $$;

ALTER TABLE public.prestations
  ADD CONSTRAINT prestations_prix_positive
  CHECK (prix >= 0);


-- ----------------------------------------------------------------------------
-- 5. CONTRAINTES SUR public.messages
-- ----------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'messages_sender_type_valid' AND conrelid = 'public.messages'::regclass
  ) THEN
    ALTER TABLE public.messages DROP CONSTRAINT messages_sender_type_valid;
  END IF;
END $$;

ALTER TABLE public.messages
  ADD CONSTRAINT messages_sender_type_valid
  CHECK (sender_type IN ('client', 'artisan'));

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'messages_content_length' AND conrelid = 'public.messages'::regclass
  ) THEN
    ALTER TABLE public.messages DROP CONSTRAINT messages_content_length;
  END IF;
END $$;

ALTER TABLE public.messages
  ADD CONSTRAINT messages_content_length
  CHECK (char_length(content) BETWEEN 1 AND 2000);


-- ----------------------------------------------------------------------------
-- 6. RPC sécurisée pour update_demande_status
-- ----------------------------------------------------------------------------
-- L'artisan ne peut changer le statut que de SES demandes.
-- L'enum est validé par la CHECK constraint ci-dessus.

CREATE OR REPLACE FUNCTION public.update_demande_status(
  p_demande_id UUID,
  p_new_status TEXT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_artisan_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;

  -- Validation explicite (en plus de la CHECK)
  IF p_new_status NOT IN ('nouvelle', 'acceptee', 'confirmee', 'refusee', 'terminee') THEN
    RAISE EXCEPTION 'Statut invalide : %', p_new_status;
  END IF;

  -- Vérifie que l'utilisateur est l'artisan de cette demande
  SELECT artisan_id INTO v_artisan_id
  FROM public.demandes
  WHERE id = p_demande_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Demande introuvable';
  END IF;

  IF v_artisan_id <> auth.uid() AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Accès refusé : vous n''êtes pas l''artisan de cette demande';
  END IF;

  UPDATE public.demandes
  SET statut = p_new_status
  WHERE id = p_demande_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_demande_status(UUID, TEXT) TO authenticated;


-- ============================================================================
-- Tests post-migration (à exécuter dans le SQL Editor)
-- ============================================================================
--
-- Test 1 : tenter d'insérer une demande avec statut invalide
--   INSERT INTO demandes (artisan_id, client_nom, client_telephone, type, message, statut)
--   VALUES (gen_random_uuid(), 'test', '0791234567', 'devis', 'hello', '🚀');
-- Attendu : ERROR: violates check constraint "demandes_statut_valid"
--
-- Test 2 : avis avec note hors bornes
--   INSERT INTO avis (artisan_id, client_nom, client_email, note)
--   VALUES (gen_random_uuid(), 'test', 'x@y.z', 99);
-- Attendu : ERROR: violates check constraint "avis_note_range"
-- ============================================================================
