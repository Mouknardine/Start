'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

/**
 * Sur la page publique d'un artisan : si c'est l'artisan lui-même qui la
 * regarde, un bandeau lui donne un accès direct à la modification.
 */
export default function OwnerBanner({ artisanId }: { artisanId: string }) {
  const [owner, setOwner] = useState(false)

  useEffect(() => {
    createClient().auth.getSession()
      .then(({ data: { session } }) => setOwner(session?.user.id === artisanId))
      .catch(() => {})
  }, [artisanId])

  if (!owner) return null
  return (
    <div className="flex items-center gap-3 flex-wrap mb-5 p-3.5 pl-4 rounded-2xl bg-[var(--dark)] text-white max-[500px]:mb-4">
      <p className="flex-1 min-w-[180px] text-[14px] m-0">C’est votre page, telle que vos clients la voient.</p>
      <div className="flex gap-2">
        <Link href="/mon-profil" className="inline-flex items-center h-10 px-4 rounded-full bg-[var(--orange)] text-white text-[14px] font-bold no-underline">Modifier</Link>
        <Link href="/dashboard?tab=profil" className="inline-flex items-center h-10 px-4 rounded-full bg-white/12 text-white text-[14px] font-semibold no-underline">Tableau de bord</Link>
      </div>
    </div>
  )
}
