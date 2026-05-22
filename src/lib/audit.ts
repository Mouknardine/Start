import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/logger'

/**
 * Enregistre une action admin dans la table audit_logs.
 * Ne lance jamais d'erreur — un audit raté ne doit pas casser l'action métier.
 *
 * Passe par la fonction SECURITY DEFINER `record_audit_event` (migration 0011) :
 *   - actor_id et actor_email sont dérivés côté DB depuis auth.uid() / auth.users
 *     (donc non falsifiables depuis le client)
 *   - l'action doit appartenir à la whitelist déclarée dans la fonction
 *     (sinon : ERROR P0001 « Action audit non autorisée »)
 */
export async function logAuditAction(
  supabase: SupabaseClient,
  params: {
    action: string
    targetType: string
    targetId: string
    details?: Record<string, unknown>
  }
) {
  try {
    const { error } = await supabase.rpc('record_audit_event', {
      p_action: params.action,
      p_target_type: params.targetType,
      p_target_id: params.targetId,
      p_details: params.details ?? {},
    })
    if (error) {
      logger.warn('Audit log failed:', error)
    }
  } catch (e) {
    logger.warn('Audit log failed:', e)
  }
}

export type AuditLog = {
  id: string
  actor_id: string | null
  actor_email: string | null
  action: string
  target_type: string | null
  target_id: string | null
  details: Record<string, unknown> | null
  created_at: string
}
