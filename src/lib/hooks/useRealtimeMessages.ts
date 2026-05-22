'use client'

import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Message } from '@/lib/supabase/helpers'

/**
 * Souscrit aux INSERT temps réel de la table `messages` pour une demande
 * donnée et passe chaque nouveau message au callback.
 *
 * Usage :
 *   useRealtimeMessages(demandeId, (msg) => {
 *     setMessages(prev => [...prev, msg])
 *   })
 *
 * La souscription est automatiquement nettoyée au démontage / changement
 * de demandeId. Si demandeId est falsy, aucune souscription n'est créée.
 */
export function useRealtimeMessages(
  demandeId: string | null | undefined,
  onNewMessage: (msg: Message) => void,
) {
  useEffect(() => {
    if (!demandeId) return

    const supabase = createClient()
    const channel = supabase
      .channel(`messages:${demandeId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `demande_id=eq.${demandeId}`,
        },
        (payload) => {
          onNewMessage(payload.new as Message)
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
    // onNewMessage est volontairement exclu pour éviter de re-souscrire
    // à chaque render — l'appelant doit utiliser un callback stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demandeId])
}

/**
 * Souscrit à TOUS les nouveaux messages destinés à cet utilisateur, peu
 * importe la demande. Filtre côté client par sender_type opposé pour ne
 * compter que les messages reçus (pas ceux envoyés par soi-même).
 */
export function useRealtimeIncomingMessages(
  demandeIds: string[],
  readerType: 'artisan' | 'client',
  onIncoming: (msg: Message) => void,
) {
  useEffect(() => {
    if (demandeIds.length === 0) return

    const supabase = createClient()
    const senderType = readerType === 'artisan' ? 'client' : 'artisan'
    const idSet = new Set(demandeIds)

    const channel = supabase
      .channel(`incoming-messages:${readerType}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          const msg = payload.new as Message
          if (msg.sender_type === senderType && idSet.has(msg.demande_id)) {
            onIncoming(msg)
          }
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demandeIds.join(','), readerType])
}
