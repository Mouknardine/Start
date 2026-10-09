'use client'

import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { signOut } from '@/lib/supabase/helpers'

/**
 * Bouton de navigation auth-aware :
 *  - Pas connecté → bouton « Connexion » orange (comme avant)
 *  - Connecté (artisan) → menu avec avatar, lien dashboard/profil, déconnexion
 *  - Connecté (client) → menu avec lien « Mes demandes », déconnexion
 *
 * Conserve le rendu serveur initial (bouton Connexion) puis remplace
 * côté client dès qu'on connaît la session, évitant un flash.
 */

type Variant = 'default' | 'dark'

type State =
  | { kind: 'loading' }
  | { kind: 'guest' }
  | { kind: 'artisan'; id: string; email: string; avatarUrl: string; displayName: string }
  | { kind: 'client'; email: string }

export default function AuthNavButton({ variant = 'default' }: { variant?: Variant }) {
  const router = useRouter()
  const [state, setState] = useState<State>({ kind: 'loading' })
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const supabase = createClient()

    async function check() {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) {
          setState({ kind: 'guest' })
          return
        }
        const userId = session.user.id
        const email = session.user.email || ''

        // Tente de charger le profil artisan. Si présent → artisan.
        const { data } = await supabase
          .from('artisans')
          .select('entreprise, prenom, nom, avatar_url')
          .eq('id', userId)
          .maybeSingle()

        if (data) {
          const displayName = data.entreprise || `${data.prenom || ''} ${data.nom || ''}`.trim() || email
          setState({
            kind: 'artisan',
            id: userId,
            email,
            avatarUrl: data.avatar_url || '',
            displayName,
          })
        } else {
          setState({ kind: 'client', email })
        }
      } catch {
        // En cas d'erreur DB, on bascule sur guest pour ne pas bloquer l'UI
        setState({ kind: 'guest' })
      }
    }
    check()

    // Re-check à chaque changement d'auth
    const { data: sub } = supabase.auth.onAuthStateChange(() => { check() })
    return () => { sub.subscription.unsubscribe() }
  }, [])

  // Fermer le menu au clic extérieur
  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  async function handleLogout() {
    const supabase = createClient()
    await signOut(supabase)
    setOpen(false)
    setState({ kind: 'guest' })
    router.push('/')
    router.refresh()
  }

  // Style commun du bouton Connexion
  const loginClass = variant === 'dark'
    ? 'bg-[var(--dark)] text-white px-5 py-2.5 rounded-full font-semibold text-sm no-underline transition-all hover:bg-[var(--orange)] hover:-translate-y-px max-[900px]:min-h-11 max-[900px]:flex max-[900px]:items-center max-[900px]:justify-center'
    : 'bg-[var(--orange)] text-white px-6 py-2.5 rounded-full font-semibold text-sm no-underline transition-all hover:bg-[var(--orange-dark)] hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(232,112,10,0.3)] max-[900px]:min-h-11 max-[900px]:flex max-[900px]:items-center max-[900px]:justify-center'

  if (state.kind === 'loading') {
    // Placeholder invisible pour ne pas faire bouger le layout
    return <div className="w-[110px] h-[44px] max-[900px]:w-[44px]" aria-hidden="true" />
  }

  if (state.kind === 'guest') {
    return (
      <Link href="/connexion" className={loginClass}>
        Connexion
      </Link>
    )
  }

  // Connecté — menu déroulant
  const isArtisanUser = state.kind === 'artisan'
  const initials = isArtisanUser
    ? state.displayName.split(/[\s&]+/).filter(w => w).slice(0, 2).map(w => w[0]?.toUpperCase()).join('')
    : (state.email[0] || '?').toUpperCase()

  return (
    <div ref={menuRef} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={isArtisanUser ? `Mon compte : ${state.displayName}` : 'Mon compte'}
        className="flex items-center gap-2 bg-white border border-[var(--gray-200)] rounded-full pl-1.5 pr-3 py-1.5 cursor-pointer hover:border-[var(--gray-300)] transition-colors max-[600px]:pr-2"
      >
        <span className="relative w-8 h-8 rounded-full overflow-hidden flex items-center justify-center text-white text-[11px] font-bold" style={{ background: (isArtisanUser && state.avatarUrl) ? undefined : 'linear-gradient(135deg, var(--dark), var(--dark-mid))' }}>
          {isArtisanUser && state.avatarUrl ? (
            <Image src={state.avatarUrl} alt="" fill sizes="32px" className="object-cover" />
          ) : initials}
        </span>
        <span className="text-[13px] font-semibold text-[var(--dark)] max-[600px]:hidden">
          {isArtisanUser ? state.displayName.slice(0, 24) : 'Mon espace'}
        </span>
        <svg className="w-3.5 h-3.5 text-[var(--gray-500)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute top-[calc(100%+8px)] right-0 bg-white border border-[var(--gray-200)] rounded-[var(--radius)] shadow-[0_12px_40px_rgba(0,0,0,0.12)] py-2 w-[260px] z-[150] max-[600px]:fixed max-[600px]:top-[64px] max-[600px]:left-3 max-[600px]:right-3 max-[600px]:w-auto"
        >
          <div className="px-4 pt-1 pb-3 mb-1 border-b border-[var(--gray-100)]">
            <div className="text-[15px] font-semibold text-[var(--dark)] truncate">{isArtisanUser ? state.displayName : state.email}</div>
            <div className="text-[13px] text-[var(--gray-500)]">{isArtisanUser ? 'Espace artisan' : 'Espace client'}</div>
          </div>
          {isArtisanUser ? (
            <>
              <MenuLink href="/dashboard" onClick={() => setOpen(false)} icon={<path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />}>Tableau de bord</MenuLink>
              <MenuLink href="/dashboard?tab=profil" onClick={() => setOpen(false)} icon={<><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" /></>}>Mon profil</MenuLink>
              <MenuLink href={`/artisan/${state.id}`} onClick={() => setOpen(false)} icon={<><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></>}>Ma page publique</MenuLink>
              <MenuLink href="/dashboard?tab=facturation" onClick={() => setOpen(false)} icon={<><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /></>}>Devis et factures</MenuLink>
            </>
          ) : (
            <MenuLink href="/client" onClick={() => setOpen(false)} icon={<><path d="M22 12h-6l-2 3h-4l-2-3H2" /><path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z" /></>}>Mes demandes</MenuLink>
          )}
          <div className="h-px bg-[var(--gray-100)] my-1" />
          <button
            role="menuitem"
            onClick={handleLogout}
            className="w-full text-left px-4 py-3 text-[15px] text-[var(--red)] bg-transparent border-none cursor-pointer hover:bg-[var(--red-light)] transition-colors flex items-center gap-3"
          >
            <svg aria-hidden="true" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            Se déconnecter
          </button>
        </div>
      )}
    </div>
  )
}

function MenuLink({ href, onClick, icon, children }: { href: string; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <Link href={href} role="menuitem" onClick={onClick} className="flex items-center gap-3 px-4 py-3 text-[15px] text-[var(--dark)] no-underline hover:bg-[var(--gray-100)] transition-colors">
      <svg aria-hidden="true" className="w-5 h-5 text-[var(--gray-500)] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{icon}</svg>
      {children}
    </Link>
  )
}
