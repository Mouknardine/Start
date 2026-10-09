'use client'

import { useEffect, useRef, type ReactNode } from 'react'

const FOCUSABLE = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

type Props = {
  onClose: () => void
  /** id du titre de la fenêtre (aria-labelledby) */
  labelledBy: string
  /** Classes du panneau (largeur, hauteur…) */
  className?: string
  /** « sheet » : feuille qui monte du bas sur mobile, fenêtre centrée dès 600px */
  variant?: 'center' | 'sheet'
  children: ReactNode
}

/**
 * Fenêtre modale accessible : rôle dialog, Échap pour fermer, clic sur le
 * fond pour fermer, focus gardé dans la fenêtre puis rendu à l'élément
 * d'origine, défilement de la page bloqué. À monter conditionnellement.
 */
export default function Dialog({ onClose, labelledBy, className = '', variant = 'center', children }: Props) {
  const panelRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  useEffect(() => { onCloseRef.current = onClose })

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const panel = panelRef.current
    panel?.focus()
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onCloseRef.current()
        return
      }
      if (e.key !== 'Tab' || !panel) return
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE))
      if (items.length === 0) { e.preventDefault(); return }
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && (document.activeElement === first || document.activeElement === panel)) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
      previous?.focus?.()
    }
  }, [])

  const sheet = variant === 'sheet'
  return (
    <div
      className={`fixed inset-0 z-[200] bg-black/50 flex justify-center ${sheet ? 'items-end min-[600px]:items-center min-[600px]:p-4' : 'items-center p-4'}`}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        className={sheet
          ? `dialog-sheet bg-white w-full outline-none rounded-t-[22px] min-[600px]:rounded-[var(--radius)] max-h-[92dvh] overflow-y-auto overscroll-contain pb-[env(safe-area-inset-bottom)] min-[600px]:pb-0 ${className}`
          : `bg-white rounded-[var(--radius)] w-full outline-none ${className}`}
        style={sheet ? undefined : { animation: 'fadeIn 0.2s ease-out both' }}
      >
        {sheet && <div aria-hidden="true" className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-[var(--gray-300)] min-[600px]:hidden" />}
        {children}
      </div>
    </div>
  )
}
