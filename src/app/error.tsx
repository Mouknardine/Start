'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { logger } from '@/lib/logger'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    logger.error(error)
  }, [error])

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-[var(--white)]">
      <div className="text-center max-w-md">
        <div className="w-20 h-20 bg-[var(--red-light)] rounded-full flex items-center justify-center mx-auto mb-6">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--red)" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
          </svg>
        </div>
        <h1 className="font-sora text-2xl font-extrabold text-[var(--dark)] mb-3">
          Oups, une erreur est survenue
        </h1>
        <p className="text-[var(--gray-500)] text-[15px] leading-relaxed mb-8">
          Quelque chose s&apos;est mal passé. Réessaie ou retourne à l&apos;accueil.
        </p>
        <div className="flex gap-3 justify-center max-[900px]:flex-col">
          <button
            onClick={reset}
            className="bg-[var(--orange)] text-white px-8 py-3.5 rounded-full font-sora font-bold text-[15px] border-none cursor-pointer transition-all hover:bg-[var(--orange-dark)] hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(232,112,10,0.3)]"
          >
            Réessayer
          </button>
          <Link
            href="/"
            className="bg-[var(--gray-100)] text-[var(--dark)] px-8 py-3.5 rounded-full font-sora font-bold text-[15px] no-underline transition-all hover:bg-[var(--gray-200)]"
          >
            Accueil
          </Link>
        </div>
      </div>
    </div>
  )
}
