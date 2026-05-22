-- ============================================================================
-- 0010_performance_indexes.sql
-- ============================================================================
-- Indexes pour accélérer les requêtes fréquentes.
--
-- Audit de l'audit Lighthouse + analyse des helpers les plus appelés.
-- Tous les indexes sont CREATE INDEX IF NOT EXISTS (idempotent).
--
-- ⚠️ Création d'indexes sur une table avec données peut prendre du temps.
-- En production sur une table > 100k lignes, utiliser CREATE INDEX
-- CONCURRENTLY (mais incompatible avec la transaction implicite de
-- Supabase SQL Editor — donc on attendra le déploiement).
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. ARTISANS
-- ----------------------------------------------------------------------------
-- Recherche fréquente par métier (recherche /recherche)
CREATE INDEX IF NOT EXISTS idx_artisans_metier
  ON public.artisans (LOWER(metier));

-- Recherche par zone (tableau de strings) — index GIN pour les opérateurs && et @>
CREATE INDEX IF NOT EXISTS idx_artisans_zones_gin
  ON public.artisans USING GIN (zones);

-- Filtre urgence (souvent combiné avec metier)
CREATE INDEX IF NOT EXISTS idx_artisans_urgence
  ON public.artisans (urgence)
  WHERE urgence = true;

-- Tri par création (recherche par défaut)
CREATE INDEX IF NOT EXISTS idx_artisans_created_at
  ON public.artisans (created_at DESC);


-- ----------------------------------------------------------------------------
-- 2. DEMANDES
-- ----------------------------------------------------------------------------
-- Note : idx_demandes_artisan_id et idx_demandes_client_email
-- sont déjà créés dans 0009.

-- Demandes par statut (dashboard artisan filtre par "nouvelle", "acceptee", etc.)
CREATE INDEX IF NOT EXISTS idx_demandes_artisan_statut
  ON public.demandes (artisan_id, statut);

-- Tri demandes par date
CREATE INDEX IF NOT EXISTS idx_demandes_created_at
  ON public.demandes (created_at DESC);


-- ----------------------------------------------------------------------------
-- 3. AVIS
-- ----------------------------------------------------------------------------
-- Tous les calculs de note moyenne et compteurs partent de artisan_id
CREATE INDEX IF NOT EXISTS idx_avis_artisan_id
  ON public.avis (artisan_id);

-- Avis d'un client (pour /client onglet "Mes avis")
CREATE INDEX IF NOT EXISTS idx_avis_client_email
  ON public.avis (client_email);


-- ----------------------------------------------------------------------------
-- 4. MESSAGES
-- ----------------------------------------------------------------------------
-- Note : idx_messages_unread_lookup déjà créé dans 0009.

-- Lister les messages d'une demande (loadMessages)
CREATE INDEX IF NOT EXISTS idx_messages_demande_created
  ON public.messages (demande_id, created_at);


-- ----------------------------------------------------------------------------
-- 5. EMPLOYES + AFFECTATIONS
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_employes_artisan
  ON public.employes (artisan_id)
  WHERE actif = true;

CREATE INDEX IF NOT EXISTS idx_affectations_artisan_date
  ON public.affectations (artisan_id, date_debut);

CREATE INDEX IF NOT EXISTS idx_affectations_employe
  ON public.affectations (employe_id);


-- ----------------------------------------------------------------------------
-- 6. DOCUMENTS (factures/devis)
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_documents_artisan_type_date
  ON public.documents (artisan_id, type, date_emission DESC);


-- ----------------------------------------------------------------------------
-- 7. PRESTATIONS
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_prestations_artisan_ordre
  ON public.prestations (artisan_id, ordre);


-- ----------------------------------------------------------------------------
-- 8. SIGNALEMENTS
-- ----------------------------------------------------------------------------
-- Liste admin des signalements non traités
CREATE INDEX IF NOT EXISTS idx_signalements_statut_created
  ON public.signalements (statut, created_at DESC)
  WHERE statut = 'nouveau';


-- ============================================================================
-- ANALYZE pour mettre à jour les statistiques du planner
-- ============================================================================
ANALYZE public.artisans;
ANALYZE public.demandes;
ANALYZE public.avis;
ANALYZE public.messages;
ANALYZE public.employes;
ANALYZE public.affectations;
ANALYZE public.documents;
ANALYZE public.prestations;
ANALYZE public.signalements;
