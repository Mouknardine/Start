import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/logger'

/**
 * Persistance générique de l'agenda dans la table `agenda_data` (key/value JSONB).
 *
 * Cache localStorage en parallèle pour UX immédiate + résilience offline.
 * La DB est la source de vérité ; localStorage est secondaire (lecture
 * instantanée au mount, écrasement dès que la DB répond).
 */

const LS_PREFIX = 'artisano-agenda-'

function lsKey(userId: string, key: string) {
  return `${LS_PREFIX}${userId}-${key}`
}

/**
 * Charge une clé d'agenda depuis Supabase. Si erreur réseau ou ligne absente,
 * retourne fallback (souvent {} ou []).
 *
 * On utilise un cache localStorage pour afficher quelque chose tout de suite,
 * puis on remplace dès que la DB répond (passé en callback `onRemoteFetched`).
 */
export async function loadAgendaKey<T = unknown>(
  supabase: SupabaseClient,
  userId: string,
  key: string,
  fallback: T,
): Promise<T> {
  try {
    const { data, error } = await supabase
      .from('agenda_data')
      .select('data')
      .eq('artisan_id', userId)
      .eq('key', key)
      .maybeSingle<{ data: T }>()

    if (error) throw error

    if (data) {
      // Met à jour le cache localStorage en arrière-plan
      try { localStorage.setItem(lsKey(userId, key), JSON.stringify(data.data)) } catch { /* ignore */ }
      return data.data
    }
    return fallback
  } catch (e) {
    logger.warn(`loadAgendaKey(${key}) failed, fallback to localStorage:`, e)
    try {
      const cached = localStorage.getItem(lsKey(userId, key))
      if (cached) return JSON.parse(cached) as T
    } catch { /* ignore */ }
    return fallback
  }
}

/**
 * Lecture immédiate depuis localStorage (synchrone, sans round-trip réseau).
 * À utiliser pour l'affichage initial avant que loadAgendaKey() ne réponde.
 */
export function loadAgendaKeyCached<T = unknown>(
  userId: string,
  key: string,
  fallback: T,
): T {
  try {
    const cached = localStorage.getItem(lsKey(userId, key))
    if (cached) return JSON.parse(cached) as T
  } catch { /* ignore */ }
  return fallback
}

/**
 * Sauvegarde une clé d'agenda. Upsert sur (artisan_id, key).
 * Sauve aussi en localStorage (cache).
 */
export async function saveAgendaKey<T = unknown>(
  supabase: SupabaseClient,
  userId: string,
  key: string,
  data: T,
): Promise<void> {
  // Mise à jour locale immédiate
  try { localStorage.setItem(lsKey(userId, key), JSON.stringify(data)) } catch { /* ignore */ }

  const { error } = await supabase
    .from('agenda_data')
    .upsert(
      { artisan_id: userId, key, data: data as unknown as Record<string, unknown>, updated_at: new Date().toISOString() },
      { onConflict: 'artisan_id,key' },
    )
  if (error) {
    logger.warn(`saveAgendaKey(${key}) failed:`, error)
    throw error
  }
}

/**
 * Debounce utilitaire : retourne une version "à délai" de la fonction.
 * Utile pour ne pas spam la DB à chaque clic sur une cellule.
 */
export function debounce<Args extends unknown[]>(
  fn: (...args: Args) => void,
  delayMs: number,
): (...args: Args) => void {
  let timer: ReturnType<typeof setTimeout> | null = null
  return (...args: Args) => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => { fn(...args) }, delayMs)
  }
}
