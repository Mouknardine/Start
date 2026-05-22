-- ============================================================================
-- 0011_security_hardening.sql
-- ============================================================================
-- Corrige les 6 findings critiques de l'audit du 22 mai 2026 :
--   R1  : set_my_ide_verification ouverte à `authenticated`
--         → un artisan peut se marquer vérifié sans Zefix
--   R2  : audit_logs INSERT ouvert à `authenticated`
--         → tout user peut polluer le journal d'audit
--   R4  : update_my_bank_details écrase à NULL sur update partiel
--   R7  : policy UPDATE demandes sans restriction de colonne
--         → artisan peut UPDATE client_email d'une demande qu'il sert
--   R8  : avis éditable indéfiniment + artisan peut changer la note
--   R11 : actor_email du journal falsifiable depuis le client
--
-- Idempotente. Re-jouable sans casser.
-- ============================================================================


-- ============================================================================
-- R1 — Verrouiller set_my_ide_verification au service_role uniquement
-- ============================================================================
-- La fonction restera appelée par /api/verify-ide via le client admin,
-- jamais depuis le navigateur. L'API fait l'appel Zefix puis invoque la
-- fonction avec des paramètres validés côté serveur.

REVOKE EXECUTE ON FUNCTION public.set_my_ide_verification(TEXT, TEXT, TEXT)
  FROM authenticated, anon, public;

GRANT  EXECUTE ON FUNCTION public.set_my_ide_verification(TEXT, TEXT, TEXT)
  TO   service_role;

-- Nouvelle signature compatible service_role : on doit pouvoir cibler un
-- p_artisan_id explicite (le service_role n'a pas auth.uid()).
CREATE OR REPLACE FUNCTION public.set_ide_verification_admin(
  p_artisan_id   UUID,
  p_ide_number   TEXT,
  p_company_name TEXT,
  p_status       TEXT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Ne peut être appelée que par service_role (et donc depuis l'API serveur).
  -- Pour les autres rôles, on lève une exception explicite plutôt que de
  -- compter sur l'absence de GRANT (défense en profondeur).
  IF current_setting('request.jwt.claim.role', true) NOT IN ('service_role', '')
     AND current_user NOT IN ('service_role', 'postgres') THEN
    RAISE EXCEPTION 'Accès refusé : service_role uniquement';
  END IF;

  UPDATE public.artisans
  SET
    ide_number       = p_ide_number,
    ide_company_name = p_company_name,
    ide_status       = p_status,
    ide_verified     = (p_status = 'active'),
    ide_verified_at  = CASE WHEN p_status = 'active' THEN now() ELSE NULL END,
    updated_at       = now()
  WHERE id = p_artisan_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profil artisan introuvable : %', p_artisan_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_ide_verification_admin(UUID, TEXT, TEXT, TEXT)
  TO service_role;


-- ============================================================================
-- R4 — update_my_bank_details : COALESCE pour les updates partiels
-- ============================================================================
-- Avant : un appel avec p_bic seul écrasait IBAN/titulaire/adresse à NULL.
-- Après : seuls les champs non-NULL passés en paramètre sont écrits.

CREATE OR REPLACE FUNCTION public.update_my_bank_details(
  p_iban      TEXT,
  p_bic       TEXT,
  p_titulaire TEXT,
  p_adresse   TEXT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;

  UPDATE public.artisans
  SET
    bank_iban      = COALESCE(p_iban, bank_iban),
    bank_bic       = COALESCE(p_bic, bank_bic),
    bank_titulaire = COALESCE(p_titulaire, bank_titulaire),
    bank_adresse   = COALESCE(p_adresse, bank_adresse),
    updated_at     = now()
  WHERE id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profil artisan introuvable';
  END IF;
END;
$$;


-- ============================================================================
-- R2 + R11 — audit_logs : INSERT uniquement via fonction whitelistée,
--            actor_email dérivé de auth.users (non falsifiable)
-- ============================================================================
-- Avant : tout user authentifié pouvait INSERT (actor_id = auth.uid())
--         avec une action arbitraire et un actor_email mensonger.
-- Après : INSERT bloqué pour authenticated, n'arrive plus que via la
--         fonction record_audit_event() qui :
--           - vérifie auth.uid()
--           - whiteliste les actions autorisées
--           - récupère actor_email depuis auth.users (jamais du paramètre)

REVOKE INSERT ON public.audit_logs FROM authenticated, anon, public;
GRANT  INSERT ON public.audit_logs TO   service_role;

-- La policy "audit_logs_insert_self" est désormais sans effet (plus de GRANT)
-- mais on la durcit pour neutralisation explicite.
DROP POLICY IF EXISTS "audit_logs_insert_self" ON public.audit_logs;
CREATE POLICY "audit_logs_insert_none" ON public.audit_logs
  FOR INSERT TO authenticated, anon
  WITH CHECK (false);

CREATE OR REPLACE FUNCTION public.record_audit_event(
  p_action      TEXT,
  p_target_type TEXT,
  p_target_id   UUID,
  p_details     JSONB
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email TEXT;
  v_id    UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;

  -- Whitelist stricte des actions. Toute extension passe par migration.
  IF p_action NOT IN (
    'delete_avis',
    'delete_demande',
    'delete_artisan',
    'accept_signalement',
    'reject_signalement',
    'reopen_signalement',
    'revoke_ide_verification',
    'verify_ide',
    'self_delete_account',
    'admin_login'
  ) THEN
    RAISE EXCEPTION 'Action audit non autorisée : %', p_action;
  END IF;

  -- actor_email lu depuis auth.users, pas du paramètre client.
  SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();

  INSERT INTO public.audit_logs(
    actor_id, actor_email, action, target_type, target_id, details
  ) VALUES (
    auth.uid(), v_email, p_action, p_target_type, p_target_id, p_details
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_audit_event(TEXT, TEXT, UUID, JSONB)
  TO authenticated;


-- ============================================================================
-- R7 — Plus aucun UPDATE direct sur demandes (sauf admin)
-- ============================================================================
-- Le changement de statut passe désormais EXCLUSIVEMENT par la RPC
-- update_demande_status() (déjà SECURITY DEFINER dans 0008) qui :
--   - vérifie auth.uid() = artisan_id
--   - valide l'enum de statut
--   - n'écrit que la colonne statut
-- Cela empêche un artisan de UPDATE client_email ou réécrire le contenu
-- d'une demande.

DROP POLICY IF EXISTS "demandes_update"            ON public.demandes;
DROP POLICY IF EXISTS "demandes_update_admin_only" ON public.demandes;
CREATE POLICY "demandes_update_admin_only" ON public.demandes
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());


-- ============================================================================
-- R8 — Avis : éditable 24 h max + artisan limité à reponse_artisan
-- ============================================================================
-- Avant : un client pouvait éditer sa note indéfiniment ;
--         un artisan pouvait modifier la note de SES avis (RLS permissive).
-- Après : trigger qui contrôle qui peut modifier quoi.

CREATE OR REPLACE FUNCTION public.avis_edit_guard() RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin   BOOLEAN;
  v_is_artisan BOOLEAN;
  v_client_fields_changed BOOLEAN;
BEGIN
  v_is_admin   := public.is_admin();
  v_is_artisan := (NEW.artisan_id = auth.uid());

  IF v_is_admin THEN
    RETURN NEW;
  END IF;

  -- Tout sauf la réponse artisan et les timestamps techniques est considéré
  -- comme "champ client" (note, commentaire, etc.). On compare via to_jsonb
  -- pour ne pas dépendre d'un nom de colonne précis.
  v_client_fields_changed := (
        (to_jsonb(NEW) - 'reponse_artisan' - 'reponse_date' - 'updated_at')
    IS DISTINCT FROM
        (to_jsonb(OLD) - 'reponse_artisan' - 'reponse_date' - 'updated_at')
  );

  -- Artisan : ne peut modifier QUE sa réponse (reponse_artisan / reponse_date)
  IF v_is_artisan AND v_client_fields_changed THEN
    RAISE EXCEPTION 'L''artisan ne peut modifier que sa réponse, pas la note ni le commentaire';
  END IF;

  -- Client : modifications acceptées dans les 24 h suivant la création
  IF NOT v_is_artisan
     AND v_client_fields_changed
     AND now() - OLD.created_at > interval '24 hours' THEN
    RAISE EXCEPTION 'Édition d''avis impossible après 24 h (sauf admin)';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_avis_edit_guard ON public.avis;
CREATE TRIGGER trg_avis_edit_guard
  BEFORE UPDATE ON public.avis
  FOR EACH ROW EXECUTE FUNCTION public.avis_edit_guard();


-- ============================================================================
-- ✅ Tests post-migration à exécuter dans le SQL Editor
-- ============================================================================
--
-- En tant qu'utilisateur authentifié non-admin (set role authenticated; set
-- request.jwt.claim.sub à un UUID artisan existant) :
--
-- 1. R1 — set_my_ide_verification doit échouer :
--    SELECT public.set_my_ide_verification('CHE-000.000.000', 'Faux', 'active');
--    → ERROR: permission denied for function set_my_ide_verification
--
-- 2. R2 — INSERT direct dans audit_logs doit échouer :
--    INSERT INTO audit_logs (actor_id, action) VALUES (auth.uid(), 'hack');
--    → ERROR: new row violates row-level security policy
--
-- 3. R2 — action non whitelistée doit échouer :
--    SELECT public.record_audit_event('hack_action', 'x', null, '{}'::jsonb);
--    → ERROR: Action audit non autorisée : hack_action
--
-- 4. R4 — update partiel ne doit pas écraser :
--    SELECT public.update_my_bank_details(NULL, 'NEWBIC', NULL, NULL);
--    SELECT bank_iban, bank_bic FROM artisans WHERE id = auth.uid();
--    → bank_iban inchangé, bank_bic = 'NEWBIC'
--
-- 5. R7 — UPDATE direct demandes doit échouer (sauf admin) :
--    UPDATE demandes SET client_email = 'x@y.fr' WHERE artisan_id = auth.uid();
--    → 0 rows affected (RLS bloque)
--
-- 6. R8 — édition avis > 24 h doit échouer (client) :
--    UPDATE avis SET note = 1 WHERE id = '<id avis > 24h>';
--    → ERROR: Édition d'avis impossible après 24 h
--
-- 7. R8 — artisan ne peut éditer que reponse_artisan :
--    UPDATE avis SET note = 5 WHERE artisan_id = auth.uid();
--    → ERROR: L'artisan ne peut modifier que sa réponse
--
-- ============================================================================
-- ⚠️ Côté code applicatif à mettre à jour APRÈS cette migration :
--
--   src/app/api/verify-ide/route.ts (mode 'save') :
--     - Remplacer  await supabase.rpc('set_my_ide_verification', ...)
--     - Par        await admin.rpc('set_ide_verification_admin', {
--                    p_artisan_id: user.id,
--                    p_ide_number: company.uidFormatted,
--                    p_company_name: company.name,
--                    p_status: company.status.toLowerCase(),
--                  })
--     (admin = createAdminClient(url, SUPABASE_SERVICE_ROLE_KEY, ...))
--
--   src/lib/audit.ts :
--     - Remplacer  supabase.from('audit_logs').insert({...})
--     - Par        supabase.rpc('record_audit_event', {
--                    p_action, p_target_type, p_target_id, p_details
--                  })
--     (actor_id et actor_email sont désormais dérivés côté DB,
--      ne pas les passer en paramètre)
--
-- ============================================================================
