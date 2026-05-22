import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-[var(--white)]">
      <div className="text-center max-w-md">
        <div className="font-sora text-[120px] font-extrabold text-[var(--gray-200)] leading-none mb-2 max-[900px]:text-[80px]">
          404
        </div>
        <h1 className="font-sora text-2xl font-extrabold text-[var(--dark)] mb-3">
          Page introuvable
        </h1>
        <p className="text-[var(--gray-500)] text-[15px] leading-relaxed mb-8">
          La page que tu cherches n&apos;existe pas ou a été déplacée.
        </p>
        <div className="flex gap-3 justify-center max-[900px]:flex-col">
          <Link
            href="/"
            className="bg-[var(--orange)] text-white px-8 py-3.5 rounded-full font-sora font-bold text-[15px] no-underline transition-all hover:bg-[var(--orange-dark)] hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(232,112,10,0.3)]"
          >
            Retour à l&apos;accueil
          </Link>
          <Link
            href="/recherche"
            className="bg-[var(--gray-100)] text-[var(--dark)] px-8 py-3.5 rounded-full font-sora font-bold text-[15px] no-underline transition-all hover:bg-[var(--gray-200)]"
          >
            Chercher un artisan
          </Link>
        </div>
      </div>
    </div>
  )
}
