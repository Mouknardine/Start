import Link from 'next/link'
import Logo from './Logo'

export default function Footer() {
  return (
    <footer className="px-10 py-12 max-w-[1200px] mx-auto flex justify-between items-center border-t border-[var(--gray-200)] max-[900px]:flex-col max-[900px]:gap-5 max-[900px]:text-center max-[900px]:px-5 max-[900px]:py-8">
      <div className="flex items-center gap-6 max-[900px]:flex-col">
        <Logo size="small" />
        <div className="flex gap-6 max-[900px]:flex-wrap max-[900px]:justify-center max-[900px]:gap-4">
          <Link href="/" className="text-[var(--gray-500)] no-underline text-sm hover:text-[var(--dark)] transition-colors">
            À propos
          </Link>
          <Link href="/recherche" className="text-[var(--gray-500)] no-underline text-sm hover:text-[var(--dark)] transition-colors">
            Trouver un artisan
          </Link>
          <Link href="/cgu" className="text-[var(--gray-500)] no-underline text-sm hover:text-[var(--dark)] transition-colors">
            CGU
          </Link>
          <Link href="/confidentialite" className="text-[var(--gray-500)] no-underline text-sm hover:text-[var(--dark)] transition-colors">
            Confidentialité
          </Link>
          <Link href="/mentions-legales" className="text-[var(--gray-500)] no-underline text-sm hover:text-[var(--dark)] transition-colors">
            Mentions légales
          </Link>
        </div>
      </div>
      <div className="text-[13px] text-[var(--gray-500)]">
        Fait avec <span className="text-[var(--orange)]">♥</span> en Suisse
      </div>
    </footer>
  )
}
