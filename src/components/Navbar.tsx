'use client'

import { useState } from 'react'
import Link from 'next/link'
import Logo from './Logo'
import AuthNavButton from './AuthNavButton'

export default function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <nav className="fixed top-0 left-0 right-0 z-[100] px-10 py-4 flex items-center justify-between bg-[rgba(250,250,250,0.85)] backdrop-blur-[20px] border-b border-black/5 animate-slide-down max-[900px]:px-5 max-[900px]:py-3.5">
      <Logo />

      {/* Hamburger */}
      <button
        className="hidden max-[900px]:block bg-transparent border-none cursor-pointer p-2 z-[101]"
        aria-label={menuOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
        aria-expanded={menuOpen}
        aria-controls="main-nav"
        onClick={() => setMenuOpen(!menuOpen)}
      >
        <span className={`block w-6 h-[2px] bg-[var(--dark)] rounded-sm mb-1.5 transition-all duration-300 ${menuOpen ? 'rotate-45 translate-y-2' : ''}`} />
        <span className={`block w-6 h-[2px] bg-[var(--dark)] rounded-sm mb-1.5 transition-all duration-300 ${menuOpen ? 'opacity-0' : ''}`} />
        <span className={`block w-6 h-[2px] bg-[var(--dark)] rounded-sm transition-all duration-300 ${menuOpen ? '-rotate-45 -translate-y-2' : ''}`} />
      </button>

      {/* Nav Links */}
      <ul id="main-nav" onClick={(e) => { if ((e.target as HTMLElement).closest('a')) setMenuOpen(false) }} className={`flex items-center gap-8 list-none max-[900px]:fixed max-[900px]:top-[60px] max-[900px]:left-0 max-[900px]:right-0 max-[900px]:bg-white max-[900px]:flex-col max-[900px]:p-6 max-[900px]:gap-4 max-[900px]:shadow-[0_8px_32px_rgba(0,0,0,0.1)] max-[900px]:border-b max-[900px]:border-[var(--gray-200)] ${menuOpen ? 'max-[900px]:flex' : 'max-[900px]:hidden'}`}>
        <li>
          <Link href="/recherche" className="no-underline text-[var(--gray-700)] font-medium text-[15px] hover:text-[var(--dark)] transition-colors">
            Rechercher
          </Link>
        </li>
        <li>
          <Link href="/#how-it-works" className="no-underline text-[var(--gray-700)] font-medium text-[15px] hover:text-[var(--dark)] transition-colors">
            Comment ça marche
          </Link>
        </li>
        <li>
          <Link href="/inscription" className="no-underline text-[var(--gray-700)] font-medium text-[15px] hover:text-[var(--dark)] transition-colors">
            Pour les artisans
          </Link>
        </li>
        <li>
          <AuthNavButton />
        </li>
      </ul>
    </nav>
  )
}
