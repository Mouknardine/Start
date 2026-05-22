'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import PasswordStrength, { isPasswordValid } from '@/components/PasswordStrength'

export default function ResetPasswordPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)
  const [checkingSession, setCheckingSession] = useState(true)
  const [hasSession, setHasSession] = useState(false)

  // Vérifie qu'on arrive bien depuis le flow de récupération
  // (session active créée par /auth/callback après échange du code email)
  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getSession().then(({ data: { session } }) => {
      setHasSession(!!session)
      setCheckingSession(false)
    })
  }, [])

  async function handleReset() {
    setError('')
    setSuccess('')

    if (!password || !isPasswordValid(password)) {
      setError('Mot de passe trop faible : 8 caractères min, une majuscule, une minuscule, un chiffre.')
      return
    }

    if (password !== confirmPassword) {
      setError('Les mots de passe ne correspondent pas.')
      return
    }

    setLoading(true)
    const supabase = createClient()

    try {
      const { error } = await supabase.auth.updateUser({ password })
      if (error) throw error

      setSuccess('Mot de passe modifié avec succès ! Vous allez être redirigé...')
      setTimeout(() => router.push('/connexion'), 2500)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erreur lors de la modification.'
      setError(message)
      setLoading(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') handleReset()
  }

  // Loading
  if (checkingSession) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--gray-50)]">
        <div className="text-[var(--gray-500)] text-sm">Vérification du lien…</div>
      </div>
    )
  }

  // Pas de session = lien expiré ou invalide
  if (!hasSession && !success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--gray-50)] p-5">
        <div className="bg-white rounded-[var(--radius)] border border-[var(--gray-200)] p-10 w-full max-w-[420px] shadow-[0_4px_24px_rgba(0,0,0,0.06)] text-center max-[500px]:p-5">
          <div className="text-4xl mb-4" aria-hidden="true">⏰</div>
          <div className="font-sora text-xl font-extrabold text-[var(--dark)] mb-2">Lien expiré ou invalide</div>
          <div className="text-sm text-[var(--gray-500)] leading-relaxed mb-6">
            Le lien de réinitialisation est invalide ou a expiré (durée de validité : 1 heure). Demande un nouveau lien depuis la page de connexion.
          </div>
          <Link
            href="/connexion"
            className="inline-block bg-[var(--orange)] text-white py-3 px-7 rounded-full font-sora font-bold text-sm no-underline transition-all hover:bg-[var(--orange-dark)]"
          >
            Retour à la connexion
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--gray-50)] p-5 max-[500px]:p-3">
      <div className="bg-white rounded-[var(--radius)] border border-[var(--gray-200)] p-10 w-full max-w-[420px] shadow-[0_4px_24px_rgba(0,0,0,0.06)] max-[900px]:p-7 max-[500px]:p-5 max-[500px]:rounded-2xl max-[900px]:max-w-full">
        <div className="text-center mb-6">
          <Link href="/" className="font-sora text-2xl font-extrabold text-[var(--dark)] no-underline">
            artisano<span className="inline-block w-1.5 h-1.5 bg-[var(--orange)] rounded-full ml-0.5 align-super" />
          </Link>
        </div>

        <div className="font-sora text-xl font-extrabold text-[var(--dark)] text-center mb-2">Nouveau mot de passe</div>
        <div className="text-sm text-[var(--gray-500)] text-center mb-7 leading-relaxed">
          Choisissez un nouveau mot de passe pour votre compte.
        </div>

        {error && (
          <div className="bg-[var(--red-light)] text-[var(--red)] py-2.5 px-3.5 rounded-[10px] text-[13px] mb-4">{error}</div>
        )}
        {success && (
          <div className="bg-[var(--green-light)] text-[var(--green)] py-2.5 px-3.5 rounded-[10px] text-[13px] mb-4 text-center leading-relaxed">{success}</div>
        )}

        {!success && (
          <>
            <div className="mb-4">
              <label className="block text-[13px] font-semibold text-[var(--dark)] mb-1.5">Nouveau mot de passe</label>
              <input
                type="password"
                placeholder="8 caractères, une majuscule, un chiffre"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                className="w-full py-3 px-3.5 border border-[var(--gray-200)] rounded-xl text-sm bg-white transition-all outline-none focus:border-[var(--orange)] focus:shadow-[0_0_0_3px_rgba(232,112,10,0.1)] max-[900px]:text-base max-[900px]:min-h-11 max-[900px]:py-3.5"
              />
              <PasswordStrength password={password} />
            </div>
            <div className="mb-4">
              <label className="block text-[13px] font-semibold text-[var(--dark)] mb-1.5">Confirmer le mot de passe</label>
              <input
                type="password"
                placeholder="Retapez votre mot de passe"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                onKeyDown={handleKeyDown}
                autoComplete="new-password"
                className="w-full py-3 px-3.5 border border-[var(--gray-200)] rounded-xl text-sm bg-white transition-all outline-none focus:border-[var(--orange)] focus:shadow-[0_0_0_3px_rgba(232,112,10,0.1)] max-[900px]:text-base max-[900px]:min-h-11 max-[900px]:py-3.5"
              />
            </div>
            <button
              onClick={handleReset}
              disabled={loading}
              className="w-full py-3.5 bg-[var(--orange)] text-white border-none rounded-full font-sora text-sm font-bold cursor-pointer transition-all mt-2 hover:bg-[var(--orange-dark)] hover:-translate-y-0.5 disabled:opacity-60 disabled:cursor-not-allowed disabled:transform-none max-[900px]:min-h-11 max-[900px]:text-[15px]"
            >
              {loading ? 'Modification en cours...' : 'Changer mon mot de passe'}
            </button>
          </>
        )}

        <Link href="/connexion" className="block text-center mt-5 text-[13px] text-[var(--gray-500)] no-underline hover:text-[var(--orange)]">
          ← Retour à la connexion
        </Link>
      </div>
    </div>
  )
}
