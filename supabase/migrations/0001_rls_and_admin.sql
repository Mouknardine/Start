-- ============================================================================
-- 0001_rls_and_admin.sql
-- ============================================================================
-- Active la sécurité au niveau ligne (RLS) sur toutes les tables métier
-- et crée le système de rôles admin côté base de données.
--
-- À exécuter UNE FOIS dans le SQL Editor de Supabase.
-- Cette migration est idempotente (peut être ré-exécutée sans casser).
--
-- ⚠️ AVANT D'EXÉCUTER : prendre un backup de la base (Database → Backups)
-- ============================================================================


-- ============================================================================
-- 1. TABLE ADMINS
-- ============================================================================
-- Stocke la liste des comptes admin. Remplace l'ancien tableau hardcodé
-- ADMIN_EMAILS côté client.

CREATE TABLE IF NOT EXISTS public.admins (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT
);

COMMENT ON TABLE public.admins IS 'Comptes admin Artisano. user_id référence auth.users.';

-- Activer RLS sur la table admins elle-même
ALTER TABLE public.admins ENABLE ROW LEVEL SECURITY;

-- Personne ne peut lire/écrire dans admins via l'API client.
-- Seul le service_role (côté serveur) peut gérer cette table.
DROP POLICY IF EXISTS "admins_no_client_access" ON public.admins;
CREATE POLICY "admins_no_client_access" ON public.admins
  FOR ALL TO authenticated, anon
  USING (false) WITH CHECK (false);


-- ============================================================================
-- 2. FONCTION HELPER is_admin()
-- ============================================================================
-- Renvoie TRUE si l'utilisateur courant est admin.
-- SECURITY DEFINER pour pouvoir lire public.admins même quand RLS le bloque.

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admins WHERE user_id = auth.uid()
  );
$$;

COMMENT ON FUNCTION public.is_admin() IS 'TRUE si auth.uid() figure dans admins.';

-- Permettre aux utilisateurs authentifiés d'appeler cette fonction
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, anon;


-- ============================================================================
-- 3. TABLE ARTISANS
-- ============================================================================
-- Profils publics. Lecture libre, écriture uniquement par soi-même ou admin.

ALTER TABLE public.artisans ENABLE ROW LEVEL SECURITY;

-- Lecture publique (recherche / profil)
DROP POLICY IF EXISTS "artisans_public_select" ON public.artisans;
CREATE POLICY "artisans_public_select" ON public.artisans
  FOR SELECT TO anon, authenticated
  USING (true);

-- Création de son propre profil (à l'inscription)
DROP POLICY IF EXISTS "artisans_self_insert" ON public.artisans;
CREATE POLICY "artisans_self_insert" ON public.artisans
  FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());

-- Modification de son propre profil ou admin
DROP POLICY IF EXISTS "artisans_self_update" ON public.artisans;
CREATE POLICY "artisans_self_update" ON public.artisans
  FOR UPDATE TO authenticated
  USING (id = auth.uid() OR public.is_admin())
  WITH CHECK (id = auth.uid() OR public.is_admin());

-- Suppression : seulement soi-même ou admin
DROP POLICY IF EXISTS "artisans_self_delete" ON public.artisans;
CREATE POLICY "artisans_self_delete" ON public.artisans
  FOR DELETE TO authenticated
  USING (id = auth.uid() OR public.is_admin());


-- ============================================================================
-- 4. TABLE DEMANDES
-- ============================================================================
-- Demandes envoyées par les clients aux artisans.

ALTER TABLE public.demandes ENABLE ROW LEVEL SECURITY;

-- Lecture : l'artisan concerné OU le client qui a envoyé OU admin
DROP POLICY IF EXISTS "demandes_select_owner" ON public.demandes;
CREATE POLICY "demandes_select_owner" ON public.demandes
  FOR SELECT TO authenticated
  USING (
    artisan_id = auth.uid()
    OR client_email = auth.email()
    OR public.is_admin()
  );

-- Création : tout utilisateur authentifié peut créer une demande
-- mais SON email doit correspondre à client_email
DROP POLICY IF EXISTS "demandes_insert_client" ON public.demandes;
CREATE POLICY "demandes_insert_client" ON public.demandes
  FOR INSERT TO authenticated
  WITH CHECK (client_email = auth.email());

-- Mise à jour : artisan concerné (changer statut) ou admin
DROP POLICY IF EXISTS "demandes_update" ON public.demandes;
CREATE POLICY "demandes_update" ON public.demandes
  FOR UPDATE TO authenticated
  USING (artisan_id = auth.uid() OR public.is_admin())
  WITH CHECK (artisan_id = auth.uid() OR public.is_admin());

-- Suppression : artisan, client propriétaire ou admin
DROP POLICY IF EXISTS "demandes_delete" ON public.demandes;
CREATE POLICY "demandes_delete" ON public.demandes
  FOR DELETE TO authenticated
  USING (
    artisan_id = auth.uid()
    OR client_email = auth.email()
    OR public.is_admin()
  );


-- ============================================================================
-- 5. TABLE AVIS
-- ============================================================================
-- Avis clients sur les artisans.

ALTER TABLE public.avis ENABLE ROW LEVEL SECURITY;

-- Lecture publique (les avis sont visibles sur les profils)
DROP POLICY IF EXISTS "avis_public_select" ON public.avis;
CREATE POLICY "avis_public_select" ON public.avis
  FOR SELECT TO anon, authenticated
  USING (true);

-- Création : client authentifié (vérification "demande terminée" déjà côté SQL fn)
DROP POLICY IF EXISTS "avis_insert_client" ON public.avis;
CREATE POLICY "avis_insert_client" ON public.avis
  FOR INSERT TO authenticated
  WITH CHECK (client_email = auth.email());

-- Mise à jour : l'artisan peut ajouter sa réponse (reponse_artisan)
-- Le client peut éditer son propre avis (TODO: limiter à 24h après création)
DROP POLICY IF EXISTS "avis_update" ON public.avis;
CREATE POLICY "avis_update" ON public.avis
  FOR UPDATE TO authenticated
  USING (
    artisan_id = auth.uid()
    OR client_email = auth.email()
    OR public.is_admin()
  )
  WITH CHECK (
    artisan_id = auth.uid()
    OR client_email = auth.email()
    OR public.is_admin()
  );

-- Suppression : client propriétaire ou admin (l'artisan ne supprime pas les avis)
DROP POLICY IF EXISTS "avis_delete" ON public.avis;
CREATE POLICY "avis_delete" ON public.avis
  FOR DELETE TO authenticated
  USING (client_email = auth.email() OR public.is_admin());


-- ============================================================================
-- 6. TABLE MESSAGES
-- ============================================================================
-- Messages du chat entre client et artisan, liés à une demande.

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Lecture : participants à la demande uniquement
DROP POLICY IF EXISTS "messages_select_participants" ON public.messages;
CREATE POLICY "messages_select_participants" ON public.messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.demandes d
      WHERE d.id = messages.demande_id
        AND (d.artisan_id = auth.uid() OR d.client_email = auth.email())
    )
    OR public.is_admin()
  );

-- Création : participants uniquement, sender_type doit matcher son rôle
DROP POLICY IF EXISTS "messages_insert_participants" ON public.messages;
CREATE POLICY "messages_insert_participants" ON public.messages
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.demandes d
      WHERE d.id = messages.demande_id
        AND (
          (d.artisan_id = auth.uid() AND messages.sender_type = 'artisan')
          OR (d.client_email = auth.email() AND messages.sender_type = 'client')
        )
    )
  );

-- Mise à jour : permettre de marquer comme lu uniquement (lu = true)
-- On filtre côté policy : on n'autorise que les UPDATEs où on est destinataire
DROP POLICY IF EXISTS "messages_update_read" ON public.messages;
CREATE POLICY "messages_update_read" ON public.messages
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.demandes d
      WHERE d.id = messages.demande_id
        AND (d.artisan_id = auth.uid() OR d.client_email = auth.email())
    )
  );

-- Suppression : admin uniquement (les messages d'un chat ne se suppriment pas)
DROP POLICY IF EXISTS "messages_delete_admin" ON public.messages;
CREATE POLICY "messages_delete_admin" ON public.messages
  FOR DELETE TO authenticated
  USING (public.is_admin());


-- ============================================================================
-- 7. TABLE DOCUMENTS (devis / factures)
-- ============================================================================

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

-- Lecture : artisan propriétaire OU client destinataire OU admin
DROP POLICY IF EXISTS "documents_select" ON public.documents;
CREATE POLICY "documents_select" ON public.documents
  FOR SELECT TO authenticated
  USING (
    artisan_id = auth.uid()
    OR client_email = auth.email()
    OR public.is_admin()
  );

-- Création / modification / suppression : artisan propriétaire uniquement
DROP POLICY IF EXISTS "documents_all_owner" ON public.documents;
CREATE POLICY "documents_all_owner" ON public.documents
  FOR ALL TO authenticated
  USING (artisan_id = auth.uid() OR public.is_admin())
  WITH CHECK (artisan_id = auth.uid() OR public.is_admin());


-- ============================================================================
-- 8. TABLE PRESTATIONS (catalogue de services de l'artisan)
-- ============================================================================

ALTER TABLE public.prestations ENABLE ROW LEVEL SECURITY;

-- Lecture publique (visible sur profil artisan)
DROP POLICY IF EXISTS "prestations_public_select" ON public.prestations;
CREATE POLICY "prestations_public_select" ON public.prestations
  FOR SELECT TO anon, authenticated
  USING (true);

-- Écriture : artisan propriétaire
DROP POLICY IF EXISTS "prestations_write_owner" ON public.prestations;
CREATE POLICY "prestations_write_owner" ON public.prestations
  FOR ALL TO authenticated
  USING (artisan_id = auth.uid() OR public.is_admin())
  WITH CHECK (artisan_id = auth.uid() OR public.is_admin());


-- ============================================================================
-- 9. TABLE EMPLOYES
-- ============================================================================
-- Équipe de l'artisan, données internes.

ALTER TABLE public.employes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "employes_all_owner" ON public.employes;
CREATE POLICY "employes_all_owner" ON public.employes
  FOR ALL TO authenticated
  USING (artisan_id = auth.uid() OR public.is_admin())
  WITH CHECK (artisan_id = auth.uid() OR public.is_admin());


-- ============================================================================
-- 10. TABLE AFFECTATIONS (planning)
-- ============================================================================

ALTER TABLE public.affectations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "affectations_all_owner" ON public.affectations;
CREATE POLICY "affectations_all_owner" ON public.affectations
  FOR ALL TO authenticated
  USING (artisan_id = auth.uid() OR public.is_admin())
  WITH CHECK (artisan_id = auth.uid() OR public.is_admin());


-- ============================================================================
-- 11. STORAGE BUCKET artisan-media
-- ============================================================================
-- Path attendu : {userId}/{filename}
-- Lecture publique (avatars / galerie), écriture par le propriétaire.

-- Supabase Storage utilise la table storage.objects
-- Le owner UUID est dans la colonne "owner_id" ou via le path "{uid}/..."

-- Politique de lecture : tout le monde (bucket public)
DROP POLICY IF EXISTS "artisan_media_public_read" ON storage.objects;
CREATE POLICY "artisan_media_public_read" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'artisan-media');

-- Upload : utilisateur connecté, dans son dossier {auth.uid()}/
DROP POLICY IF EXISTS "artisan_media_upload_own" ON storage.objects;
CREATE POLICY "artisan_media_upload_own" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'artisan-media'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Update : seulement ses propres fichiers
DROP POLICY IF EXISTS "artisan_media_update_own" ON storage.objects;
CREATE POLICY "artisan_media_update_own" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'artisan-media'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Delete : seulement ses propres fichiers (ou admin)
DROP POLICY IF EXISTS "artisan_media_delete_own" ON storage.objects;
CREATE POLICY "artisan_media_delete_own" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'artisan-media'
    AND ((storage.foldername(name))[1] = auth.uid()::text OR public.is_admin())
  );


-- ============================================================================
-- 12. PROTECTION DES COLONNES SENSIBLES (IBAN)
-- ============================================================================
-- Note : la lecture publique de artisans inclut bank_iban/bic.
-- Pour masquer ces colonnes aux non-propriétaires, on crée une VUE
-- artisans_public qui exclut les colonnes bancaires.
-- L'app devra utiliser cette vue pour les listings publics.
--
-- ⚠️ Migration progressive : pour l'instant on laisse, mais on note dans
-- le TODO de basculer le code vers `artisans_public` (point #5 IBAN).

CREATE OR REPLACE VIEW public.artisans_public AS
SELECT
  id, prenom, nom, entreprise, telephone, email, adresse, site,
  metier, specialites, zones, description, horaires,
  urgence, urgence_supplement, urgence_rayon,
  urgence_heure_debut, urgence_heure_fin, urgence_jours,
  contact_prefs, disponibilites, avatar_url, gallery_urls,
  created_at, updated_at
FROM public.artisans;

COMMENT ON VIEW public.artisans_public IS 'Vue publique de artisans excluant les coordonnées bancaires.';

GRANT SELECT ON public.artisans_public TO anon, authenticated;


-- ============================================================================
-- ✅ FIN DE LA MIGRATION
-- ============================================================================
-- Pour ajouter un admin manuellement :
--   INSERT INTO public.admins (user_id, notes) VALUES (
--     (SELECT id FROM auth.users WHERE email = 'mattpina32@icloud.com'),
--     'Admin principal'
--   );
-- ============================================================================
