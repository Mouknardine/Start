import { SupabaseClient } from '@supabase/supabase-js'
import {
  artisanProfileSchema,
  documentSchema,
  employeSchema,
  affectationSchema,
  prestationSchema,
  demandeStatusSchema,
  avisResponseSchema,
} from '@/lib/validation/schemas'

// ===== TYPES =====

export type Artisan = {
  id: string
  prenom: string
  nom: string
  entreprise: string
  telephone: string
  email: string
  adresse: string
  site: string
  metier: string
  specialites: string[]
  zones: string[]
  description: string
  horaires: Record<string, unknown>[]
  urgence: boolean
  urgence_supplement: string
  urgence_rayon: string
  urgence_heure_debut: string
  urgence_heure_fin: string
  urgence_jours: string[]
  contact_prefs: { complete: boolean; message: boolean; appel: boolean }
  disponibilites: Record<string, unknown> | null
  avatar_url: string
  gallery_urls: string[]
  bank_iban: string
  bank_titulaire: string
  bank_adresse: string
  bank_bic: string
  ide_number?: string
  ide_verified?: boolean
  ide_company_name?: string
  ide_status?: string
  ide_verified_at?: string
  created_at: string
  updated_at: string
}

export type Demande = {
  id: string
  artisan_id: string
  client_nom: string
  client_email: string
  client_telephone: string
  client_adresse: string
  type: string
  message: string
  date_souhaitee: string | null
  moment_journee: string | null
  creneau_date: string | null
  creneau_heure: string | null
  statut: string
  created_at: string
  artisans?: Pick<Artisan, 'entreprise' | 'prenom' | 'nom' | 'metier' | 'avatar_url'>
}

export type Avis = {
  id: string
  artisan_id: string
  client_nom: string
  client_email: string
  note: number
  commentaire: string
  reponse_artisan: string | null
  reponse_date: string | null
  created_at: string
  artisans?: Pick<Artisan, 'entreprise' | 'prenom' | 'nom'>
}

export type Message = {
  id: string
  demande_id: string
  sender_type: 'client' | 'artisan'
  sender_id: string
  content: string
  lu: boolean
  created_at: string
}

export type Document = {
  id: string
  artisan_id: string
  type: 'devis' | 'facture'
  numero: string
  client_nom: string
  client_email: string
  client_telephone: string
  client_adresse: string
  lignes: Record<string, unknown>[]
  sous_total: number
  taux_tva: number
  montant_tva: number
  remise_type: string | null
  remise_valeur: number | null
  montant_remise: number | null
  total_ttc: number
  date_emission: string
  date_echeance: string | null
  date_acceptation: string | null
  date_paiement: string | null
  statut: string
  notes: string
  devis_source_id: string | null
  created_at: string
}

export type Prestation = {
  id: string
  artisan_id: string
  nom: string
  description: string
  unite: string
  prix: number
  categorie: string
  ordre: number
}

export type Employe = {
  id: string
  artisan_id: string
  prenom: string
  nom: string
  telephone: string
  email: string
  couleur: string
  poste: string
  actif: boolean
  created_at: string
}

export type Affectation = {
  id: string
  artisan_id: string
  employe_id: string
  titre: string
  date_debut: string
  heure_debut: string
  heure_fin: string
  adresse: string
  notes: string
  demande_id: string | null
  created_at: string
  employes?: Pick<Employe, 'prenom' | 'nom' | 'couleur'>
}

// ===== XSS PROTECTION =====

export function escapeHtml(str: string | null | undefined): string {
  if (!str) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// ===== AUTH HELPERS =====

export async function getUser(supabase: SupabaseClient) {
  const { data } = await supabase.auth.getUser()
  return data.user
}

export async function getSession(supabase: SupabaseClient) {
  const { data } = await supabase.auth.getSession()
  return data.session
}

export async function signUp(
  supabase: SupabaseClient,
  email: string,
  password: string,
  redirectAfterConfirm: string = '/'
) {
  // Détermine l'origine pour construire l'URL de callback
  const origin = typeof window !== 'undefined'
    ? window.location.origin
    : (process.env.NEXT_PUBLIC_SITE_URL || '')

  const emailRedirectTo = origin
    ? `${origin}/auth/callback?next=${encodeURIComponent(redirectAfterConfirm)}`
    : undefined

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo },
  })
  if (error) throw error
  return data
}

export async function signIn(supabase: SupabaseClient, email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  return data
}

export async function signOut(supabase: SupabaseClient) {
  await supabase.auth.signOut()
}

/**
 * Supprime totalement le compte courant (artisan ou client) côté serveur :
 * données métier (transaction atomique côté DB) + compte auth Supabase
 * via service role.
 *
 * R5 (audit 22/05/2026) : le mot de passe est désormais re-demandé côté
 * API pour éviter qu'un XSS/CSRF puisse provoquer la suppression sans
 * action consciente de l'utilisateur.
 *
 * Lance une erreur si la requête échoue, sinon la session est déjà
 * déconnectée à la sortie.
 */
export async function deleteCurrentAccount(password: string) {
  if (!password) throw new Error('Mot de passe requis pour confirmer la suppression.')
  const res = await fetch('/api/account/delete', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || 'Suppression échouée')
  }
}

// Anciens helpers conservés pour compatibilité — préférer deleteCurrentAccount()
export async function deleteArtisanAccount(supabase: SupabaseClient, _userId: string, password: string) {
  await deleteCurrentAccount(password)
  await supabase.auth.signOut()
}

export async function deleteClientAccount(supabase: SupabaseClient, _email: string, password: string) {
  await deleteCurrentAccount(password)
  await supabase.auth.signOut()
}

// ===== ARTISAN PROFILE =====

// Colonnes non-bancaires de la table `artisans` (les colonnes bank_* sont
// révoquées au niveau Postgres pour anon/authenticated et accessibles
// uniquement via les fonctions get_my_bank_details / update_my_bank_details).
const ARTISAN_PUBLIC_COLUMNS = [
  'id', 'prenom', 'nom', 'entreprise', 'telephone', 'email', 'adresse', 'site',
  'metier', 'specialites', 'zones', 'description', 'horaires',
  'urgence', 'urgence_supplement', 'urgence_rayon',
  'urgence_heure_debut', 'urgence_heure_fin', 'urgence_jours',
  'contact_prefs', 'disponibilites', 'avatar_url', 'gallery_urls',
  // IDE : ide_number reste privé (pas dans le GRANT). Les flags vérification
  // OUI sont accessibles aux clients pour afficher le badge.
  'ide_verified', 'ide_company_name', 'ide_status',
  'created_at', 'updated_at',
].join(', ')

export async function saveArtisanProfile(supabase: SupabaseClient, userId: string, profileData: Partial<Artisan>) {
  // Retire les colonnes bancaires : elles passent par update_my_bank_details
  const {
    bank_iban: _bi, bank_bic: _bc, bank_titulaire: _bt, bank_adresse: _ba,
    ide_number: _in, ide_verified: _iv, ide_company_name: _icn,
    ide_status: _is, ide_verified_at: _iva,
    ...safeData
  } = profileData
  void _bi; void _bc; void _bt; void _ba
  void _in; void _iv; void _icn; void _is; void _iva

  // Validation Zod (anti-injection, longueurs, types)
  const parsed = artisanProfileSchema.safeParse(safeData)
  if (!parsed.success) {
    throw new Error('Données profil invalides : ' + parsed.error.issues[0]?.message)
  }

  const { data, error } = await supabase.from('artisans').upsert({
    id: userId,
    ...parsed.data,
  })
  if (error) throw error
  return data
}

export async function loadArtisanProfile(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase
    .from('artisans')
    .select(ARTISAN_PUBLIC_COLUMNS)
    .eq('id', userId)
    .maybeSingle()
  if (error && error.code !== 'PGRST116') throw error
  return data as Artisan | null
}

/**
 * Charge les coordonnées bancaires de l'artisan courant via la fonction
 * SECURITY DEFINER `get_my_bank_details()`. Retourne null si pas artisan.
 */
export async function loadMyBankDetails(supabase: SupabaseClient) {
  const { data, error } = await supabase.rpc('get_my_bank_details')
  if (error) throw error
  // RPC retourne un tableau de lignes ; on prend la première
  const row = Array.isArray(data) ? data[0] : data
  if (!row) return null
  return {
    bank_iban: row.bank_iban || '',
    bank_bic: row.bank_bic || '',
    bank_titulaire: row.bank_titulaire || '',
    bank_adresse: row.bank_adresse || '',
  }
}

/**
 * Met à jour les coordonnées bancaires de l'artisan courant.
 */
export async function saveMyBankDetails(
  supabase: SupabaseClient,
  details: { bank_iban: string; bank_bic: string; bank_titulaire: string; bank_adresse: string },
) {
  const { error } = await supabase.rpc('update_my_bank_details', {
    p_iban: details.bank_iban,
    p_bic: details.bank_bic,
    p_titulaire: details.bank_titulaire,
    p_adresse: details.bank_adresse,
  })
  if (error) throw error
}

// ===== STORAGE =====

export async function uploadToStorage(supabase: SupabaseClient, userId: string, filePath: string, file: File) {
  const { error } = await supabase.storage
    .from('artisan-media')
    .upload(`${userId}/${filePath}`, file, { cacheControl: '3600', upsert: true })
  if (error) throw error
  const { data: urlData } = supabase.storage
    .from('artisan-media')
    .getPublicUrl(`${userId}/${filePath}`)
  return urlData.publicUrl
}

export async function deleteFromStorage(supabase: SupabaseClient, userId: string, filePath: string) {
  const { error } = await supabase.storage
    .from('artisan-media')
    .remove([`${userId}/${filePath}`])
  if (error) throw error
}

export async function updateAvatarUrl(supabase: SupabaseClient, userId: string, url: string) {
  const { error } = await supabase.from('artisans').update({ avatar_url: url }).eq('id', userId)
  if (error) throw error
}

export async function updateGalleryUrls(supabase: SupabaseClient, userId: string, urls: string[]) {
  const { error } = await supabase.from('artisans').update({ gallery_urls: urls }).eq('id', userId)
  if (error) throw error
}

// ===== DOCUMENTS / FACTURATION =====

export async function loadDocuments(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase.from('documents').select('*').eq('artisan_id', userId).order('created_at', { ascending: false })
  if (error) throw error
  return (data || []) as Document[]
}

export async function saveDocument(supabase: SupabaseClient, doc: Partial<Document>) {
  // Validation Zod sauf si c'est juste un id (update partiel)
  if (!doc.id || Object.keys(doc).length > 1) {
    const parsed = documentSchema.safeParse(doc)
    if (!parsed.success) {
      throw new Error('Document invalide : ' + parsed.error.issues[0]?.message)
    }
  }
  const { data, error } = await supabase.from('documents').upsert(doc).select().single()
  if (error) throw error
  return data as Document
}

export async function deleteDocument(supabase: SupabaseClient, id: string) {
  const { error } = await supabase.from('documents').delete().eq('id', id)
  if (error) throw error
}

export async function loadPrestations(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase.from('prestations').select('*').eq('artisan_id', userId).order('ordre')
  if (error) throw error
  return (data || []) as Prestation[]
}

export async function savePrestation(supabase: SupabaseClient, prest: Partial<Prestation>) {
  // Validation Zod si payload complet
  if (!prest.id || Object.keys(prest).length > 1) {
    const parsed = prestationSchema.safeParse(prest)
    if (!parsed.success) {
      throw new Error('Prestation invalide : ' + parsed.error.issues[0]?.message)
    }
  }
  const { data, error } = await supabase.from('prestations').upsert(prest).select().single()
  if (error) throw error
  return data as Prestation
}

export async function deletePrestation(supabase: SupabaseClient, id: string) {
  const { error } = await supabase.from('prestations').delete().eq('id', id)
  if (error) throw error
}

export async function getNextDocNumber(supabase: SupabaseClient, userId: string, type: string) {
  const { data, error } = await supabase.rpc('next_document_number', { p_artisan_id: userId, p_type: type })
  if (error) throw error
  return data as string
}

// ===== DEMANDES =====

export async function loadDemandes(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase.from('demandes').select('*').eq('artisan_id', userId).order('created_at', { ascending: false })
  if (error) throw error
  return (data || []) as Demande[]
}

export async function updateDemandeStatus(supabase: SupabaseClient, demandeId: string, newStatus: string) {
  // Validation Zod du statut (enum strict)
  const parsed = demandeStatusSchema.safeParse(newStatus)
  if (!parsed.success) {
    throw new Error('Statut invalide : ' + newStatus)
  }
  // RPC sécurisée : vérifie côté serveur que l'utilisateur est bien l'artisan
  // de cette demande (auth.uid() = artisan_id) — couche supplémentaire en plus
  // de la RLS UPDATE policy.
  const { error } = await supabase.rpc('update_demande_status', {
    p_demande_id: demandeId,
    p_new_status: parsed.data,
  })
  if (error) throw error
  // Renvoie la demande mise à jour pour cohérence avec l'ancienne API
  const { data, error: selErr } = await supabase
    .from('demandes')
    .select('*')
    .eq('id', demandeId)
    .single()
  if (selErr) throw selErr
  return data as Demande
}

export async function deleteDemande(supabase: SupabaseClient, demandeId: string) {
  const { error } = await supabase.from('demandes').delete().eq('id', demandeId)
  if (error) throw error
}

// ===== AVIS =====

export async function loadAvisForArtisan(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase.from('avis').select('*').eq('artisan_id', userId).order('created_at', { ascending: false })
  if (error) throw error
  return (data || []) as Avis[]
}

export async function replyToAvis(supabase: SupabaseClient, avisId: string, reponse: string) {
  // R10 (audit 22/05/2026) : validation de la réponse artisan (5–2000 caractères)
  const parsed = avisResponseSchema.safeParse(reponse)
  if (!parsed.success) {
    throw new Error('Réponse invalide : ' + parsed.error.issues[0]?.message)
  }
  const { error } = await supabase
    .from('avis')
    .update({ reponse_artisan: parsed.data, reponse_date: new Date().toISOString() })
    .eq('id', avisId)
  if (error) throw error
}

// ===== EQUIPE =====

export async function getEmployes(supabase: SupabaseClient, artisanId: string) {
  const { data, error } = await supabase.from('employes').select('*').eq('artisan_id', artisanId).eq('actif', true).order('prenom')
  if (error) throw error
  return (data || []) as Employe[]
}

export async function addEmploye(supabase: SupabaseClient, employe: Partial<Employe>) {
  const parsed = employeSchema.safeParse(employe)
  if (!parsed.success) {
    throw new Error('Employé invalide : ' + parsed.error.issues[0]?.message)
  }
  const { data, error } = await supabase
    .from('employes')
    .insert({ ...parsed.data, artisan_id: employe.artisan_id })
    .select()
    .single()
  if (error) throw error
  return data as Employe
}

export async function updateEmploye(supabase: SupabaseClient, id: string, updates: Partial<Employe>) {
  // R10 (audit 22/05/2026) : validation Zod partielle — n'accepte que les
  // champs déclarés dans employeSchema (refuse artisan_id, id, etc. en update).
  const parsed = employeSchema.partial().safeParse(updates)
  if (!parsed.success) {
    throw new Error('Employé invalide : ' + parsed.error.issues[0]?.message)
  }
  const { error } = await supabase.from('employes').update(parsed.data).eq('id', id)
  if (error) throw error
}

export async function deleteEmploye(supabase: SupabaseClient, id: string) {
  const { error } = await supabase.from('employes').update({ actif: false }).eq('id', id)
  if (error) throw error
}

export async function getAffectations(supabase: SupabaseClient, artisanId: string, dateDebut: string, dateFin: string) {
  const { data, error } = await supabase.from('affectations').select('*, employes(prenom, nom, couleur)').eq('artisan_id', artisanId).gte('date_debut', dateDebut).lte('date_debut', dateFin).order('heure_debut')
  if (error) throw error
  return (data || []) as Affectation[]
}

export async function addAffectation(supabase: SupabaseClient, affectation: Partial<Affectation>) {
  const parsed = affectationSchema.safeParse(affectation)
  if (!parsed.success) {
    throw new Error('Affectation invalide : ' + parsed.error.issues[0]?.message)
  }
  const { data, error } = await supabase
    .from('affectations')
    .insert({ ...parsed.data, artisan_id: affectation.artisan_id })
    .select('*, employes(prenom, nom, couleur)')
    .single()
  if (error) throw error
  return data as Affectation
}

export async function updateAffectation(supabase: SupabaseClient, id: string, updates: Partial<Affectation>) {
  // R10 (audit 22/05/2026) : validation Zod partielle — n'accepte que les
  // champs déclarés dans affectationSchema.
  const parsed = affectationSchema.partial().safeParse(updates)
  if (!parsed.success) {
    throw new Error('Affectation invalide : ' + parsed.error.issues[0]?.message)
  }
  const { error } = await supabase.from('affectations').update(parsed.data).eq('id', id)
  if (error) throw error
}

export async function deleteAffectation(supabase: SupabaseClient, id: string) {
  const { error } = await supabase.from('affectations').delete().eq('id', id)
  if (error) throw error
}

// ===== MESSAGERIE =====

export async function loadMessages(supabase: SupabaseClient, demandeId: string) {
  const { data, error } = await supabase.from('messages').select('*').eq('demande_id', demandeId).order('created_at', { ascending: true })
  if (error) throw error
  return (data || []) as Message[]
}

/**
 * Envoie un message via /api/messages : le serveur déduit le sender_type,
 * applique le rate limit + la validation Zod, et déclenche la notification
 * email au destinataire (fiable même si l'onglet ferme ensuite).
 *
 * Les paramètres supabase/senderType/senderId sont conservés pour
 * compatibilité de signature mais ne sont plus utilisés : le serveur
 * dérive tout de la session.
 */
export async function sendMessage(_supabase: SupabaseClient, demandeId: string, _senderType: 'client' | 'artisan', _senderId: string, content: string) {
  void _supabase; void _senderType; void _senderId
  const res = await fetch('/api/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ demande_id: demandeId, content }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error || 'Envoi échoué')
  return body.message as Message
}

/**
 * Marque comme lus les messages reçus dans une demande, via la RPC
 * mark_messages_read (migration 0013). L'UPDATE direct sur messages est
 * désormais réservé aux admins (anti-falsification de contenu).
 * readerType est dérivé côté serveur — paramètre conservé pour compat.
 */
export async function markMessagesRead(supabase: SupabaseClient, demandeId: string, _readerType: 'client' | 'artisan') {
  void _readerType
  const { error } = await supabase.rpc('mark_messages_read', { p_demande_id: demandeId })
  if (error) throw error
}

// ===== CLIENT HELPERS =====

export async function loadClientDemandes(supabase: SupabaseClient, email: string) {
  const { data, error } = await supabase.from('demandes').select('*, artisans(entreprise, prenom, nom, metier, avatar_url)').eq('client_email', email).order('created_at', { ascending: false })
  if (error) throw error
  return (data || []) as Demande[]
}

export async function deleteClientDemande(supabase: SupabaseClient, demandeId: string, email: string) {
  const { error } = await supabase.from('demandes').delete().eq('id', demandeId).eq('client_email', email)
  if (error) throw error
}

export async function loadClientAvis(supabase: SupabaseClient, email: string) {
  const { data, error } = await supabase.from('avis').select('*, artisans(entreprise, prenom, nom)').eq('client_email', email).order('created_at', { ascending: false })
  if (error) throw error
  return (data || []) as Avis[]
}

// ===== UNREAD MESSAGES =====

/**
 * Récupère les compteurs de messages non lus pour TOUTES les demandes de
 * l'utilisateur courant, en une seule requête (RPC agrégée).
 * Évite le N+1 (avant : 1 query par demande).
 *
 * Retourne un Record<demande_id, count> uniquement pour les demandes
 * ayant au moins 1 message non lu.
 */
export async function loadAllUnreadCounts(
  supabase: SupabaseClient,
  readerType: 'artisan' | 'client',
): Promise<Record<string, number>> {
  const rpc = readerType === 'artisan'
    ? 'get_my_unread_counts_artisan'
    : 'get_my_unread_counts_client'
  const { data, error } = await supabase.rpc(rpc)
  if (error) return {}
  const out: Record<string, number> = {}
  ;(data || []).forEach((row: { demande_id: string; unread_count: number | string }) => {
    out[row.demande_id] = Number(row.unread_count)
  })
  return out
}

export async function countUnreadMessages(supabase: SupabaseClient, userId: string, readerType: 'artisan' | 'client' = 'artisan') {
  const senderType = readerType === 'artisan' ? 'client' : 'artisan'
  // Filtrer sur la demande pour ne compter que celles de l'utilisateur courant.
  // userId = id auth pour artisan, email pour client
  const demandeFilter = readerType === 'artisan'
    ? { 'demandes.artisan_id': userId }
    : { 'demandes.client_email': userId }

  let query = supabase
    .from('messages')
    .select('id, demandes!inner(id, artisan_id, client_email)', { count: 'exact', head: true })
    .eq('sender_type', senderType)
    .eq('lu', false)

  for (const [field, value] of Object.entries(demandeFilter)) {
    query = query.eq(field, value)
  }

  const { count, error } = await query
  if (error) return 0
  return count || 0
}

export async function countUnreadForDemande(supabase: SupabaseClient, demandeId: string, readerType: 'artisan' | 'client') {
  const senderType = readerType === 'artisan' ? 'client' : 'artisan'
  const { count, error } = await supabase
    .from('messages')
    .select('*', { count: 'exact', head: true })
    .eq('demande_id', demandeId)
    .eq('sender_type', senderType)
    .eq('lu', false)
  if (error) return 0
  return count || 0
}

// ===== USER TYPE DETECTION =====

export async function isArtisan(supabase: SupabaseClient, userId: string): Promise<boolean> {
  // maybeSingle ne jette pas si 0 rows — plus sûr que single()
  const { data } = await supabase.from('artisans').select('id').eq('id', userId).maybeSingle()
  return !!data
}

export async function redirectIfLoggedIn(supabase: SupabaseClient): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return null
  const artisan = await isArtisan(supabase, session.user.id)
  return artisan ? '/dashboard' : '/client'
}
