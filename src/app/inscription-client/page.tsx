'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Logo from '@/components/Logo'
import { createClient } from '@/lib/supabase/client'
import { signUp, signIn } from '@/lib/supabase/helpers'
import { notify } from '@/lib/email/notify'
import PasswordStrength, { isPasswordValid } from '@/components/PasswordStrength'

export default function InscriptionClientPage() {
  const router = useRouter()
  const [prenom, setPrenom] = useState('')
  const [nom, setNom] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSignup() {
    setError('')
    setSuccess('')

    if (!prenom.trim() || !nom.trim()) {
      setError('Veuillez entrer votre prénom et nom.')
      return
    }
    if (!email.trim()) {
      setError('Veuillez entrer votre adresse email.')
      return
    }
    if (!password || !isPasswordValid(password)) {
      setError('Mot de passe trop faible : 8 caractères min, une majuscule, une minuscule, un chiffre.')
      return
    }
    if (password !== passwordConfirm) {
      setError('Les mots de passe ne correspondent pas.')
      return
    }

    setLoading(true)
    const supabase = createClient()

    try {
      const authData = await signUp(supabase, email.trim(), password, '/client')

      if (!authData.user) {
        throw new Error('Erreur lors de la création du compte.')
      }

      // Si Supabase a activé "Confirm email", il n'y a pas de session ici
      // → on redirige vers la page d'attente de confirmation
      if (!authData.session) {
        // On garde le nom en localStorage pour personnaliser la page client après confirmation
        localStorage.setItem('artisano-client', JSON.stringify({
          prenom: prenom.trim(),
          nom: nom.trim(),
          email: email.trim(),
        }))
        router.push(`/auth/confirmer-email?email=${encodeURIComponent(email.trim())}`)
        return
      }

      // Sinon (confirmation désactivée) : connexion directe
      localStorage.setItem('artisano-client', JSON.stringify({
        prenom: prenom.trim(),
        nom: nom.trim(),
        email: email.trim(),
      }))

      notify.welcomeClient()
      router.push('/client')
    } catch (err: unknown) {
      setLoading(false)
      const message = err instanceof Error ? err.message : 'Erreur lors de la création du compte.'
      if (message.includes('already registered') || message.includes('already been registered')) {
        setError('Un compte existe déjà avec cet email. Essayez de vous connecter.')
      } else {
        setError(message)
      }
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') handleSignup()
  }

  return (
    <div className="min-h-screen flex flex-col">
      <nav className="px-10 py-5 flex items-center justify-center max-[900px]:px-4 max-[900px]:py-3">
        <Logo />
      </nav>

      <div className="flex-1 flex items-center justify-center px-5 pb-[60px] max-[900px]:px-3 max-[900px]:pb-10">
        <div className="bg-white rounded-[20px] p-12 w-full max-w-[440px] border border-[var(--gray-200)] shadow-[0_4px_24px_rgba(0,0,0,0.04)] max-[900px]:p-6 max-[900px]:rounded-[16px] max-[900px]:max-w-full">
          <h1 className="font-sora text-[26px] font-extrabold text-center mb-2 max-[900px]:text-[22px]">Créer mon compte</h1>
          <p className="text-center text-[15px] text-[var(--gray-500)] mb-8 leading-relaxed">
            Suivez vos demandes et laissez des avis
          </p>

          {/* Name row */}
          <div className="grid grid-cols-2 gap-3 max-[900px]:grid-cols-1">
            <div className="mb-5">
              <label className="block text-sm font-semibold text-[var(--dark)] mb-1.5">Prénom</label>
              <input
                type="text"
                placeholder="Jean"
                value={prenom}
                onChange={(e) => setPrenom(e.target.value)}
                className="w-full py-3.5 px-4 border-2 border-[var(--gray-200)] rounded-[var(--radius-sm)] text-[15px] text-[var(--dark)] bg-white transition-all outline-none focus:border-[var(--orange)] focus:shadow-[0_0_0_3px_rgba(232,112,10,0.1)] placeholder:text-[var(--gray-500)] max-[900px]:text-base max-[900px]:min-h-11"
              />
            </div>
            <div className="mb-5">
              <label className="block text-sm font-semibold text-[var(--dark)] mb-1.5">Nom</label>
              <input
                type="text"
                placeholder="Dupont"
                value={nom}
                onChange={(e) => setNom(e.target.value)}
                className="w-full py-3.5 px-4 border-2 border-[var(--gray-200)] rounded-[var(--radius-sm)] text-[15px] text-[var(--dark)] bg-white transition-all outline-none focus:border-[var(--orange)] focus:shadow-[0_0_0_3px_rgba(232,112,10,0.1)] placeholder:text-[var(--gray-500)] max-[900px]:text-base max-[900px]:min-h-11"
              />
            </div>
          </div>

          <div className="mb-5">
            <label className="block text-sm font-semibold text-[var(--dark)] mb-1.5">Adresse email</label>
            <input
              type="email"
              placeholder="jean.dupont@email.ch"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full py-3.5 px-4 border-2 border-[var(--gray-200)] rounded-[var(--radius-sm)] text-[15px] text-[var(--dark)] bg-white transition-all outline-none focus:border-[var(--orange)] focus:shadow-[0_0_0_3px_rgba(232,112,10,0.1)] placeholder:text-[var(--gray-500)] max-[900px]:text-base max-[900px]:min-h-11"
            />
          </div>

          <div className="mb-5">
            <label className="block text-sm font-semibold text-[var(--dark)] mb-1.5">Mot de passe</label>
            <input
              type="password"
              placeholder="8 caractères, une majuscule, un chiffre"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full py-3.5 px-4 border-2 border-[var(--gray-200)] rounded-[var(--radius-sm)] text-[15px] text-[var(--dark)] bg-white transition-all outline-none focus:border-[var(--orange)] focus:shadow-[0_0_0_3px_rgba(232,112,10,0.1)] placeholder:text-[var(--gray-500)] max-[900px]:text-base max-[900px]:min-h-11"
            />
            <PasswordStrength password={password} />
          </div>

          <div className="mb-5">
            <label className="block text-sm font-semibold text-[var(--dark)] mb-1.5">Confirmer le mot de passe</label>
            <input
              type="password"
              placeholder="Retapez votre mot de passe"
              value={passwordConfirm}
              onChange={(e) => setPasswordConfirm(e.target.value)}
              onKeyDown={handleKeyDown}
              className="w-full py-3.5 px-4 border-2 border-[var(--gray-200)] rounded-[var(--radius-sm)] text-[15px] text-[var(--dark)] bg-white transition-all outline-none focus:border-[var(--orange)] focus:shadow-[0_0_0_3px_rgba(232,112,10,0.1)] placeholder:text-[var(--gray-500)] max-[900px]:text-base max-[900px]:min-h-11"
            />
          </div>

          {error && <div className="text-[var(--red)] text-sm mb-3">{error}</div>}
          {success && <div className="text-[var(--green)] text-sm mb-3">{success}</div>}

          <button
            onClick={handleSignup}
            disabled={loading}
            className="bg-[var(--orange)] text-white py-4 rounded-full font-sora font-bold text-base border-none cursor-pointer transition-all w-full mt-2 hover:bg-[var(--orange-dark)] hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(232,112,10,0.3)] disabled:opacity-60 disabled:cursor-not-allowed disabled:transform-none max-[900px]:min-h-11 max-[900px]:text-[15px]"
          >
            {loading ? 'Création en cours...' : 'Créer mon compte'}
          </button>

          <div className="text-center mt-7 text-sm text-[var(--gray-500)]">
            Déjà un compte ? <Link href="/connexion" className="text-[var(--orange)] font-semibold no-underline hover:underline">Se connecter</Link>
          </div>
        </div>
      </div>
    </div>
  )
}
