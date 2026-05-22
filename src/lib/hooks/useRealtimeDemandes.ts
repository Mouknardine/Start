'use client'

import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Demande } from '@/lib/supabase/helpers'
import { logger } from '@/lib/logger'

/**
 * Écoute les UPDATE sur la table `demandes` pour les demandes de ce client
 * (filtrées par client_email côté Postgres) et déclenche un callback à chaque
 * changement de statut.
 *
 * Côté artisan, écoute les INSERT/UPDATE pour son artisan_id (changement
 * de statut côté DB, suppressions, nouvelles demandes).
 *
 * Pré-requis : la table `demandes` doit être dans la publication
 * supabase_realtime. Sinon : ALTER PUBLICATION supabase_realtime ADD TABLE demandes;
 */
export function useRealtimeClientDemandes(
  clientEmail: string | null | undefined,
  onUpdate: (updated: Demande) => void,
) {
  useEffect(() => {
    if (!clientEmail) return

    const supabase = createClient()
    // On n'utilise PAS de filter ici : RLS bloque déjà côté serveur les
    // lignes qui ne nous appartiennent pas. Filtre côté JS aussi par sécurité.
    const channel = supabase
      .channel(`client-demandes:${clientEmail}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'demandes',
        },
        (payload) => {
          const updated = payload.new as Demande
          if (updated && updated.client_email === clientEmail) {
            logger.info('[realtime] demande updated:', updated.id, updated.statut)
            onUpdate(updated)
          }
        },
      )
      .subscribe((status) => {
        logger.info('[realtime] client-demandes status:', status)
      })

    return () => {
      supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientEmail])
}

/**
 * Côté artisan : écoute INSERT (nouvelle demande) et UPDATE (changements)
 * sur les demandes de cet artisan.
 */
export function useRealtimeArtisanDemandes(
  artisanId: string | null | undefined,
  callbacks: {
    onInsert?: (created: Demande) => void
    onUpdate?: (updated: Demande) => void
    onDelete?: (id: string) => void
  },
) {
  useEffect(() => {
    if (!artisanId) return

    const supabase = createClient()
    const channel = supabase
      .channel(`artisan-demandes:${artisanId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'demandes',
        },
        (payload) => {
          const row = (payload.new || payload.old) as { artisan_id?: string }
          if (row?.artisan_id !== artisanId) return
          if (payload.eventType === 'INSERT' && callbacks.onInsert) {
            callbacks.onInsert(payload.new as Demande)
          } else if (payload.eventType === 'UPDATE' && callbacks.onUpdate) {
            callbacks.onUpdate(payload.new as Demande)
          } else if (payload.eventType === 'DELETE' && callbacks.onDelete) {
            const old = payload.old as { id?: string }
            if (old?.id) callbacks.onDelete(old.id)
          }
        },
      )
      .subscribe((status) => {
        logger.info('[realtime] artisan-demandes status:', status)
      })

    return () => {
      supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artisanId])
}
