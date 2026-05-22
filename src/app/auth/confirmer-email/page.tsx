import type { Metadata } from 'next'
import Link from 'next/link'
import Logo from '@/components/Logo'

export const metadata: Metadata = {
  title: 'Vérifiez votre email',
  robots: { index: false, follow: false },
}

/**
 * Page d'attente affichée après une inscription, le temps que l'utilisateur
 * clique sur le lien de confirmation envoyé dans son email.
 */
export default function ConfirmerEmailPage({
  searchParams,
}: {
  searchParams?: Promise<{ email?: string }>
}) {
  return (
    <ConfirmerEmailContent searchParamsPromise={searchParams} />
  )
}

async function ConfirmerEmailContent({
  searchParamsPromise,
}: {
  searchParamsPromise?: Promise<{ email?: string }>
}) {
  const params = (await searchParamsPromise) || {}
  const email = params.email

  return (
    <>
      <nav className="fixed top-0 left-0 right-0 z-[100] px-10 py-4 flex items-center justify-center bg-[rgba(250,250,250,0.9)] backdrop-blur-[20px] border-b border-black/5 max-[900px]:px-4 max-[900px]:py-3">
        <Logo />
      </nav>

      <div className="min-h-screen flex items-center justify-center px-6 pt-20">
        <div className="max-w-[480px] text-center">
          <div className="text-6xl mb-6" aria-hidden="true">📬</div>
          <h1 className="font-sora text-[28px] font-extrabold text-[var(--dark)] mb-3 max-[600px]:text-2xl">
            Vérifiez votre email
          </h1>
          <p className="text-[15px] text-[var(--gray-700)] leading-relaxed mb-2">
            Nous venons d&apos;envoyer un lien de confirmation
            {email ? <> à <strong>{email}</strong></> : ' à votre adresse email'}.
          </p>
          <p className="text-[14px] text-[var(--gray-500)] leading-relaxed mb-8">
            Cliquez sur le lien dans l&apos;email pour activer votre compte. Pensez à vérifier vos spams.
          </p>

          <div className="bg-[var(--gray-100)] rounded-[var(--radius-sm)] p-4 mb-6 text-left">
            <p className="text-[13px] font-semibold text-[var(--dark)] mb-1">Vous n&apos;avez rien reçu ?</p>
            <ul className="text-[12px] text-[var(--gray-700)] leading-relaxed list-disc pl-4 space-y-1">
              <li>Patientez 1 à 2 minutes — l&apos;envoi peut prendre un peu de temps</li>
              <li>Vérifiez votre dossier spam / courrier indésirable</li>
              <li>Vérifiez que l&apos;adresse email saisie est correcte</li>
            </ul>
          </div>

          <Link
            href="/connexion"
            className="inline-block bg-[var(--dark)] text-white py-3 px-7 rounded-full font-sora font-bold text-sm no-underline transition-all hover:bg-[var(--orange)] hover:-translate-y-px"
          >
            Revenir à la connexion
          </Link>
        </div>
      </div>
    </>
  )
}
