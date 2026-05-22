import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { parsePayload } from '@/lib/validation/schemas'
import { createLimiter, getClientKey } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'
import { normalizeIde, isValidIdeChecksum, searchByUid } from '@/lib/zefix'

// Rate limit : max 20 vérifications/h/IP (suffisant pour un signup légitime)
const verifyIdeLimiter = createLimiter({
  name: 'verify-ide',
  windowMs: 60 * 60 * 1000,
  max: 20,
})

const bodySchema = z.object({
  ide: z.string().trim().min(8).max(20),
  // mode = "check" : juste valide et renvoie les infos Zefix, sans persister
  // mode = "save"  : persiste sur le compte artisan courant (auth requise)
  mode: z.enum(['check', 'save']).default('check'),
})

/**
 * POST /api/verify-ide
 * Body : { ide: "CHE-123.456.789", mode: "check" | "save" }
 *
 * - "check" : valide le format + interroge Zefix, retourne les infos.
 *   Pas d'auth nécessaire (utile pour validation live pendant l'inscription).
 *
 * - "save"  : nécessite auth. Persiste le résultat sur le profil artisan
 *   via la fonction RPC set_my_ide_verification (SECURITY DEFINER).
 */
export async function POST(request: Request) {
  // Rate limit
  const { allowed, retryAfterSec } = verifyIdeLimiter.check(getClientKey(request))
  if (!allowed) {
    return NextResponse.json(
      { error: `Trop de tentatives. Réessayez dans ${retryAfterSec}s.` },
      { status: 429, headers: { 'Retry-After': String(retryAfterSec) } },
    )
  }

  // Parse + validation Zod
  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON invalide' }, { status: 400 })
  }

  const parsed = parsePayload(bodySchema, payload)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error }, { status: 400 })
  }

  // Normalisation + validation du checksum
  const normalized = normalizeIde(parsed.data.ide)
  if (!normalized) {
    return NextResponse.json(
      { error: 'Format IDE invalide. Attendu : CHE-XXX.XXX.XXX', valid: false },
      { status: 400 },
    )
  }

  if (!isValidIdeChecksum(normalized)) {
    return NextResponse.json(
      { error: 'Numéro IDE invalide (checksum incorrect)', valid: false },
      { status: 400 },
    )
  }

  // Appel Zefix
  let company
  try {
    company = await searchByUid(normalized)
  } catch (e) {
    logger.error('Zefix API down:', e)
    return NextResponse.json(
      { error: 'Service de vérification temporairement indisponible. Réessayez dans quelques minutes.' },
      { status: 503 },
    )
  }

  if (!company) {
    return NextResponse.json(
      {
        valid: false,
        ide: normalized,
        error: "Numéro IDE introuvable dans le registre du commerce. Si votre entreprise vient d'être créée, attendez 1-2 jours et réessayez.",
      },
      { status: 404 },
    )
  }

  // Si mode "save" : persiste sur le profil artisan
  if (parsed.data.mode === 'save') {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    // Migration 0011 : `set_my_ide_verification` est désormais réservée au
    // service_role pour éviter qu'un artisan puisse se marquer "vérifié"
    // sans passer par Zefix (cette API). On utilise donc le client admin
    // avec la nouvelle fonction `set_ide_verification_admin`.
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    if (!serviceRoleKey || !supabaseUrl) {
      logger.error('SUPABASE_SERVICE_ROLE_KEY ou NEXT_PUBLIC_SUPABASE_URL absente')
      return NextResponse.json(
        { error: 'Configuration serveur incomplète' },
        { status: 500 },
      )
    }
    const admin = createAdminClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const { error: rpcErr } = await admin.rpc('set_ide_verification_admin', {
      p_artisan_id: user.id,
      p_ide_number: company.uidFormatted,
      p_company_name: company.name,
      p_status: company.status.toLowerCase(),
    })
    if (rpcErr) {
      logger.error('set_ide_verification_admin RPC error:', rpcErr)
      return NextResponse.json({ error: 'Enregistrement échoué' }, { status: 500 })
    }
  }

  return NextResponse.json({
    valid: true,
    ide: company.uidFormatted,
    name: company.name,
    legalSeat: company.legalSeat,
    legalForm: company.legalForm,
    status: company.status,
    statusLabel: statusLabelFr(company.status),
    cantonalExcerptWeb: company.cantonalExcerptWeb,
    verified: company.status === 'ACTIVE',
  })
}

function statusLabelFr(s: string): string {
  switch (s) {
    case 'ACTIVE': return 'Actif au registre du commerce'
    case 'CANCELLED': return 'Radié du registre'
    case 'IN_LIQUIDATION': return 'En liquidation'
    default: return 'Statut inconnu'
  }
}
