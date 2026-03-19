-- =============================================
-- ARTISANO - Schema Supabase
-- À exécuter dans Supabase > SQL Editor
-- =============================================

-- ===== TABLE ARTISANS =====
CREATE TABLE artisans (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  prenom TEXT,
  nom TEXT,
  entreprise TEXT,
  telephone TEXT,
  email TEXT,
  adresse TEXT,
  site TEXT,
  metier TEXT,
  specialites TEXT[] DEFAULT '{}',
  zones TEXT[] DEFAULT '{}',
  description TEXT,
  horaires JSONB DEFAULT '[]',
  urgence BOOLEAN DEFAULT FALSE,
  urgence_supplement TEXT,
  urgence_rayon TEXT,
  urgence_heure_debut TEXT,
  urgence_heure_fin TEXT,
  urgence_jours TEXT[] DEFAULT '{}',
  contact_prefs JSONB DEFAULT '{"complete": true, "message": true, "appel": true}',
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===== TABLE DEMANDES =====
CREATE TABLE demandes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  artisan_id UUID REFERENCES artisans(id) ON DELETE CASCADE,
  client_nom TEXT,
  client_email TEXT,
  client_telephone TEXT,
  type TEXT DEFAULT 'devis',
  message TEXT,
  date_souhaitee TEXT,
  moment_journee TEXT,
  statut TEXT DEFAULT 'nouvelle',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===== TABLE AVIS =====
CREATE TABLE avis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  artisan_id UUID REFERENCES artisans(id) ON DELETE CASCADE,
  client_nom TEXT,
  client_email TEXT,
  note INTEGER CHECK (note >= 1 AND note <= 5),
  commentaire TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- ROW LEVEL SECURITY (RLS)
-- =============================================

-- Activer RLS sur toutes les tables
ALTER TABLE artisans ENABLE ROW LEVEL SECURITY;
ALTER TABLE demandes ENABLE ROW LEVEL SECURITY;
ALTER TABLE avis ENABLE ROW LEVEL SECURITY;

-- ===== POLICIES ARTISANS =====

-- Tout le monde peut voir les profils artisans (page recherche + profil public)
CREATE POLICY "Profils artisans visibles par tous"
  ON artisans FOR SELECT
  USING (true);

-- Un artisan peut créer son propre profil
CREATE POLICY "Artisan peut créer son profil"
  ON artisans FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Un artisan peut modifier son propre profil
CREATE POLICY "Artisan peut modifier son profil"
  ON artisans FOR UPDATE
  USING (auth.uid() = id);

-- Un artisan peut supprimer son propre profil
CREATE POLICY "Artisan peut supprimer son profil"
  ON artisans FOR DELETE
  USING (auth.uid() = id);

-- ===== POLICIES DEMANDES =====

-- N'importe qui peut envoyer une demande (clients non connectés aussi)
CREATE POLICY "Tout le monde peut envoyer une demande"
  ON demandes FOR INSERT
  WITH CHECK (true);

-- Un artisan peut voir ses propres demandes
CREATE POLICY "Artisan voit ses demandes"
  ON demandes FOR SELECT
  USING (auth.uid() = artisan_id);

-- Un artisan peut mettre à jour le statut de ses demandes
CREATE POLICY "Artisan peut modifier ses demandes"
  ON demandes FOR UPDATE
  USING (auth.uid() = artisan_id);

-- ===== POLICIES AVIS =====

-- Tout le monde peut voir les avis (page profil public)
CREATE POLICY "Avis visibles par tous"
  ON avis FOR SELECT
  USING (true);

-- N'importe qui peut laisser un avis
CREATE POLICY "Tout le monde peut laisser un avis"
  ON avis FOR INSERT
  WITH CHECK (true);

-- ===== FONCTION AUTO-UPDATE updated_at =====
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER artisans_updated_at
  BEFORE UPDATE ON artisans
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- =============================================
-- MODULE FACTURATION
-- =============================================

-- ===== TABLE DOCUMENTS (Devis + Factures) =====
CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  artisan_id UUID REFERENCES artisans(id) ON DELETE CASCADE NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('devis', 'facture')),
  numero TEXT NOT NULL,
  statut TEXT NOT NULL DEFAULT 'brouillon',
  client_nom TEXT,
  client_email TEXT,
  client_telephone TEXT,
  client_adresse TEXT,
  lignes JSONB DEFAULT '[]',
  sous_total NUMERIC(10,2) DEFAULT 0,
  taux_tva NUMERIC(4,2) DEFAULT 8.1,
  montant_tva NUMERIC(10,2) DEFAULT 0,
  remise_type TEXT DEFAULT 'aucune',
  remise_valeur NUMERIC(10,2) DEFAULT 0,
  montant_remise NUMERIC(10,2) DEFAULT 0,
  total_ttc NUMERIC(10,2) DEFAULT 0,
  notes TEXT,
  conditions TEXT,
  date_emission DATE DEFAULT CURRENT_DATE,
  date_echeance DATE,
  date_acceptation DATE,
  date_paiement DATE,
  devis_source_id UUID REFERENCES documents(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===== TABLE PRESTATIONS (Catalogue) =====
CREATE TABLE prestations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  artisan_id UUID REFERENCES artisans(id) ON DELETE CASCADE NOT NULL,
  nom TEXT NOT NULL,
  description TEXT,
  unite TEXT DEFAULT 'heure',
  prix NUMERIC(10,2) NOT NULL,
  categorie TEXT,
  ordre INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-update triggers
CREATE TRIGGER documents_updated_at
  BEFORE UPDATE ON documents
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- RLS
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE prestations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Artisan voit ses documents"
  ON documents FOR SELECT USING (auth.uid() = artisan_id);
CREATE POLICY "Artisan peut creer des documents"
  ON documents FOR INSERT WITH CHECK (auth.uid() = artisan_id);
CREATE POLICY "Artisan peut modifier ses documents"
  ON documents FOR UPDATE USING (auth.uid() = artisan_id);
CREATE POLICY "Artisan peut supprimer ses documents"
  ON documents FOR DELETE USING (auth.uid() = artisan_id);

CREATE POLICY "Artisan voit ses prestations"
  ON prestations FOR SELECT USING (auth.uid() = artisan_id);
CREATE POLICY "Artisan peut creer des prestations"
  ON prestations FOR INSERT WITH CHECK (auth.uid() = artisan_id);
CREATE POLICY "Artisan peut modifier ses prestations"
  ON prestations FOR UPDATE USING (auth.uid() = artisan_id);
CREATE POLICY "Artisan peut supprimer ses prestations"
  ON prestations FOR DELETE USING (auth.uid() = artisan_id);

-- Fonction auto-numérotation
CREATE OR REPLACE FUNCTION next_document_number(p_artisan_id UUID, p_type TEXT)
RETURNS TEXT AS $$
DECLARE
  prefix TEXT;
  year_str TEXT;
  next_num INTEGER;
BEGIN
  prefix := CASE p_type WHEN 'devis' THEN 'DEV' ELSE 'FAC' END;
  year_str := TO_CHAR(NOW(), 'YYYY');
  SELECT COALESCE(MAX(CAST(SPLIT_PART(numero, '-', 3) AS INTEGER)), 0) + 1
  INTO next_num
  FROM documents
  WHERE artisan_id = p_artisan_id AND type = p_type
    AND numero LIKE prefix || '-' || year_str || '-%';
  RETURN prefix || '-' || year_str || '-' || LPAD(next_num::TEXT, 3, '0');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
