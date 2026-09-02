import { z } from 'zod'

/**
 * Schémas Zod pour valider toutes les écritures sensibles côté serveur.
 *
 * Chaque schéma exporte :
 *  - le type inféré (pour TS côté client)
 *  - un helper `parse()` qui valide ou jette une 400 propre
 */

// Réutilisables
const emailSchema = z.string().email('Email invalide').max(254)
const phoneSchema = z.string().trim().min(5).max(25)
const nonEmptyText = (min = 1, max = 5000) =>
  z.string().trim().min(min, `Min ${min} caractères`).max(max, `Max ${max} caractères`)

// ============================================================================
// DEMANDE
// ============================================================================

export const demandeSchema = z.object({
  artisan_id: z.string().uuid(),
  client_nom: nonEmptyText(2, 100),
  client_email: emailSchema.optional().nullable(),
  client_telephone: phoneSchema,
  client_adresse: z.string().trim().max(500).optional().nullable(),
  type: z.enum(['message', 'devis']),
  message: nonEmptyText(5, 5000),
  date_souhaitee: z.string().max(50).optional().nullable(),
  moment_journee: z.string().max(50).optional().nullable(),
  creneau_date: z.string().max(50).optional().nullable(),
  creneau_heure: z.string().max(50).optional().nullable(),
})
export type DemandeInput = z.infer<typeof demandeSchema>

// ============================================================================
// AVIS
// ============================================================================

export const avisSchema = z.object({
  artisan_id: z.string().uuid(),
  client_nom: nonEmptyText(2, 100),
  client_email: emailSchema,
  note: z.number().int().min(1, 'Note min 1').max(5, 'Note max 5'),
  commentaire: z.string().trim().max(2000).optional().default(''),
})
export type AvisInput = z.infer<typeof avisSchema>

/** Réponse de l'artisan à un avis (champ reponse_artisan). */
export const avisResponseSchema = z
  .string()
  .trim()
  .min(5, 'Réponse trop courte (min 5 caractères)')
  .max(2000, 'Réponse trop longue (max 2000 caractères)')

// ============================================================================
// MESSAGE
// ============================================================================

export const messageSchema = z.object({
  demande_id: z.string().uuid(),
  content: nonEmptyText(1, 2000),
})
export type MessageInput = z.infer<typeof messageSchema>

// ============================================================================
// INSCRIPTION ARTISAN (étape compte)
// ============================================================================

export const signupArtisanSchema = z.object({
  email: emailSchema,
  password: z.string()
    .min(8, 'Min 8 caractères')
    .max(72, 'Max 72 caractères')
    .regex(/[A-Z]/, 'Au moins une majuscule')
    .regex(/[a-z]/, 'Au moins une minuscule')
    .regex(/[0-9]/, 'Au moins un chiffre'),
  prenom: nonEmptyText(2, 50),
  nom: nonEmptyText(2, 50),
})
export type SignupArtisanInput = z.infer<typeof signupArtisanSchema>

// ============================================================================
// INSCRIPTION CLIENT
// ============================================================================

export const signupClientSchema = z.object({
  email: emailSchema,
  password: z.string().min(8, 'Min 8 caractères').max(72),
  prenom: nonEmptyText(2, 50),
  nom: nonEmptyText(2, 50),
})
export type SignupClientInput = z.infer<typeof signupClientSchema>

// ============================================================================
// PROFIL ARTISAN (saveArtisanProfile)
// ============================================================================

const horaireSchema = z.object({
  jour: z.string().max(20),
  ouvert: z.boolean().optional(),
  debut: z.string().max(10).optional(),
  fin: z.string().max(10).optional(),
}).passthrough() // accepte les champs supplémentaires (slots, etc.)

const contactPrefsSchema = z.object({
  complete: z.boolean().optional().default(true),
  message: z.boolean().optional().default(false),
  appel: z.boolean().optional().default(false),
})

export const artisanProfileSchema = z.object({
  prenom: z.string().trim().max(50).optional(),
  nom: z.string().trim().max(50).optional(),
  entreprise: z.string().trim().max(150).optional(),
  telephone: z.string().trim().max(25).optional(),
  email: z.string().max(254).optional(),
  adresse: z.string().trim().max(500).optional(),
  site: z.string().trim().max(500).optional(),
  metier: z.string().trim().max(50).optional(),
  specialites: z.array(z.string().trim().max(100)).max(50).optional(),
  zones: z.array(z.string().trim().max(100)).max(100).optional(),
  description: z.string().trim().max(2000).optional(),
  horaires: z.array(horaireSchema).max(7).optional(),
  urgence: z.boolean().optional(),
  urgence_supplement: z.string().trim().max(100).optional(),
  urgence_rayon: z.string().trim().max(50).optional(),
  urgence_heure_debut: z.string().trim().max(10).optional(),
  urgence_heure_fin: z.string().trim().max(10).optional(),
  urgence_jours: z.array(z.string().max(10)).max(7).optional(),
  contact_prefs: contactPrefsSchema.optional(),
  avatar_url: z.string().trim().max(500).optional(),
  gallery_urls: z.array(z.string().max(500)).max(10).optional(),
  disponibilites: z.unknown().optional(), // JSONB libre
}).strict() // refuse les champs non listés (anti-injection bank_*)

export type ArtisanProfileInput = z.infer<typeof artisanProfileSchema>

// ============================================================================
// DOCUMENT (devis / facture)
// ============================================================================

const ligneSchema = z.object({
  description: z.string().trim().max(500),
  quantite: z.number().min(0),
  prix_unitaire: z.number().min(0),
  total: z.number().min(0).optional(),
}).passthrough()

export const documentSchema = z.object({
  type: z.enum(['devis', 'facture']),
  numero: z.string().trim().max(50).optional(),
  client_nom: z.string().trim().max(150),
  client_email: z.string().email().max(254).optional().nullable(),
  client_telephone: z.string().trim().max(25).optional().nullable(),
  client_adresse: z.string().trim().max(500).optional().nullable(),
  lignes: z.array(ligneSchema).max(200),
  sous_total: z.number().min(0),
  taux_tva: z.number().min(0).max(100),
  montant_tva: z.number().min(0),
  remise_type: z.enum(['pourcentage', 'montant']).optional().nullable(),
  remise_valeur: z.number().optional().nullable(),
  montant_remise: z.number().optional().nullable(),
  total_ttc: z.number().min(0),
  date_emission: z.string().max(50),
  date_echeance: z.string().max(50).optional().nullable(),
  date_acceptation: z.string().max(50).optional().nullable(),
  date_paiement: z.string().max(50).optional().nullable(),
  statut: z.string().max(30).optional(),
  notes: z.string().trim().max(2000).optional(),
  devis_source_id: z.string().uuid().optional().nullable(),
}).passthrough()

export type DocumentInput = z.infer<typeof documentSchema>

// ============================================================================
// EMPLOYÉ
// ============================================================================

export const employeSchema = z.object({
  prenom: nonEmptyText(1, 50),
  nom: nonEmptyText(1, 50),
  telephone: z.string().trim().max(25).optional().default(''),
  email: z.string().email().max(254).optional().or(z.literal('')),
  couleur: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional().default('#2E7D32'),
  poste: z.string().trim().max(100).optional().default(''),
  actif: z.boolean().optional().default(true),
})

export type EmployeInput = z.infer<typeof employeSchema>

// ============================================================================
// AFFECTATION (planning)
// ============================================================================

export const affectationSchema = z.object({
  employe_id: z.string().uuid(),
  titre: nonEmptyText(1, 200),
  date_debut: z.string().max(50),
  heure_debut: z.string().max(10),
  heure_fin: z.string().max(10),
  adresse: z.string().trim().max(500).optional().default(''),
  notes: z.string().trim().max(2000).optional().default(''),
  demande_id: z.string().uuid().optional().nullable(),
})

export type AffectationInput = z.infer<typeof affectationSchema>

// ============================================================================
// PRESTATION (catalogue)
// ============================================================================

export const prestationSchema = z.object({
  nom: nonEmptyText(1, 150),
  description: z.string().trim().max(1000).optional().default(''),
  unite: z.string().trim().max(20).optional().default('forfait'),
  prix: z.number().min(0).max(1_000_000),
  categorie: z.string().trim().max(50).optional().default(''),
  ordre: z.number().int().min(0).optional().default(0),
})

export type PrestationInput = z.infer<typeof prestationSchema>

// ============================================================================
// DEMANDE STATUS (énum strict)
// ============================================================================

export const demandeStatusSchema = z.enum([
  'nouvelle',
  'acceptee',
  'confirmee',
  'refusee',
  'terminee',
])

export type DemandeStatus = z.infer<typeof demandeStatusSchema>

// ============================================================================
// HELPER pour API routes
// ============================================================================

/**
 * Parse un payload via un schéma Zod. Retourne soit { data }, soit { error }
 * avec un message clair à renvoyer au client.
 */
export type ParseResult<T> =
  | { success: true; data: T; error: null }
  | { success: false; data: null; error: string }

export function parsePayload<T extends z.ZodTypeAny>(
  schema: T,
  payload: unknown
): ParseResult<z.infer<T>> {
  const result = schema.safeParse(payload)
  if (!result.success) {
    const firstIssue = result.error.issues[0]
    const path = firstIssue?.path.join('.')
    const message = firstIssue?.message || 'Données invalides'
    return { success: false, data: null, error: path ? `${path}: ${message}` : message }
  }
  return { success: true, data: result.data, error: null }
}
