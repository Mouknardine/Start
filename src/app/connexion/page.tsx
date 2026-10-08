'use client'

import { useState, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Logo from '@/components/Logo'
import { createClient } from '@/lib/supabase/client'
import { signIn, loadArtisanProfile, isArtisan } from '@/lib/supabase/helpers'
import { safeNextPath } from '@/lib/safe-redirect'

export default function ConnexionPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-[var(--gray-500)]">Chargement…</div>}>
      <ConnexionContent />
    </Suspense>
  )
}

function ConnexionContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  // URL de retour après connexion (ex: /demande?artisan=X)
  const nextUrl = searchParams.get('next')
  // Liste blanche : seules les redirections internes sont autorisées
  const safeNext = nextUrl ? safeNextPath(nextUrl, '') || null : null
  const [tab, setTab] = useState<'artisan' | 'client'>('artisan')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const emailRef = useRef<HTMLInputElement>(null)

  async function handleLogin(e?: React.FormEvent) {
    e?.preventDefault()
    setError('')
    setSuccess('')

    if (!email.trim()) {
      setError('Veuillez entrer votre adresse email.')
      return
    }
    if (!password) {
      setError('Veuillez entrer votre mot de passe.')
      return
    }

    setLoading(true)
    const supabase = createClient()

    try {
      const data = await signIn(supabase, email.trim(), password)

      // Si l'utilisateur venait d'une page qui exigeait l'auth, on l'y renvoie
      if (safeNext) {
        router.push(safeNext)
        return
      }

      if (tab === 'artisan' && data.user) {
        const profile = await loadArtisanProfile(supabase, data.user.id)
        if (profile) {
          router.push('/dashboard')
        } else {
          router.push('/client')
        }
      } else {
        router.push('/client')
      }
    } catch (err: unknown) {
      setLoading(false)
      const message = err instanceof Error ? err.message : 'Erreur de connexion.'
      if (message.includes('Invalid login credentials')) {
        setError('Email ou mot de passe incorrect.')
      } else if (message.includes('Email not confirmed')) {
        setError('Veuillez confirmer votre email avant de vous connecter.')
      } else {
        setError(message)
      }
    }
  }

  async function handleForgotPassword() {
    setError('')
    setSuccess('')

    if (!email.trim()) {
      setError('Entrez votre email ci-dessus, puis cliquez sur « Mot de passe oublié ».')
      emailRef.current?.focus()
      return
    }

    const supabase = createClient()
    try {
      // Le lien dans l'email passe par /auth/callback qui échange le code
      // contre une session, puis redirige vers /reset-password
      const redirectUrl = `${window.location.origin}/auth/callback?next=${encodeURIComponent('/reset-password')}`
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: redirectUrl })
      if (error) throw error
      setSuccess(`Un email de réinitialisation a été envoyé à ${email.trim()}.`)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erreur lors de l'envoi."
      setError(message)
    }
  }

  async function handleGoogleLogin() {
    const supabase = createClient()
    try {
      // Retour via /auth/callback, qui échange le code contre une session puis
      // redirige (revenir sur /connexion laissait l'utilisateur sur le formulaire).
      const next = safeNext || (tab === 'artisan' ? '/dashboard' : '/client')
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
      })
      if (error) throw error
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erreur avec Google.'
      setError(message)
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      <nav className="px-10 py-5 flex items-center justify-center max-[900px]:px-4 max-[900px]:py-3">
        <Logo />
      </nav>

      <div className="flex-1 flex items-center justify-center px-5 pb-[60px] max-[900px]:px-3 max-[900px]:pb-10">
        <div className="bg-white rounded-[20px] p-12 w-full max-w-[440px] border border-[var(--gray-200)] shadow-[0_4px_24px_rgba(0,0,0,0.04)] max-[900px]:p-6 max-[900px]:rounded-[16px] max-[900px]:max-w-full">
          <h1 className="font-sora text-[26px] font-extrabold text-center mb-2 max-[900px]:text-[22px]">Connexion</h1>
          <p className="text-center text-[15px] text-[var(--gray-500)] mb-8 leading-relaxed max-[900px]:text-sm max-[900px]:mb-6">
            Accédez à votre espace personnel
          </p>

          {/* Tabs */}
          <div className="grid grid-cols-2 mb-8 bg-[var(--gray-100)] rounded-[var(--radius-sm)] p-1 max-[900px]:mb-6">
            <button
              type="button"
              aria-pressed={tab === 'artisan'}
              onClick={() => { setTab('artisan'); setError(''); setSuccess('') }}
              className={`py-3 text-center font-sora text-sm font-bold rounded-lg cursor-pointer transition-all select-none max-[900px]:text-[13px] max-[900px]:min-h-11 max-[900px]:flex max-[900px]:items-center max-[900px]:justify-center ${tab === 'artisan' ? 'bg-white text-[var(--dark)] shadow-[0_2px_8px_rgba(0,0,0,0.06)]' : 'bg-transparent text-[var(--gray-500)]'}`}
            >
              Je suis artisan
            </button>
            <button
              type="button"
              aria-pressed={tab === 'client'}
              onClick={() => { setTab('client'); setError(''); setSuccess('') }}
              className={`py-3 text-center font-sora text-sm font-bold rounded-lg cursor-pointer transition-all select-none max-[900px]:text-[13px] max-[900px]:min-h-11 max-[900px]:flex max-[900px]:items-center max-[900px]:justify-center ${tab === 'client' ? 'bg-white text-[var(--dark)] shadow-[0_2px_8px_rgba(0,0,0,0.06)]' : 'bg-transparent text-[var(--gray-500)]'}`}
            >
              Je suis client
            </button>
          </div>

          {/* Form — un vrai <form> : Entrée partout, gestionnaires de mots de passe */}
          <form onSubmit={handleLogin} noValidate>
          <div className="mb-5">
            <label htmlFor="login-email" className="block text-sm font-semibold text-[var(--dark)] mb-1.5">Adresse email</label>
            <input
              ref={emailRef}
              id="login-email"
              type="email"
              autoComplete="email"
              inputMode="email"
              placeholder={tab === 'artisan' ? 'contact@mon-entreprise.ch' : 'jean.dupont@email.ch'}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full py-3.5 px-4 border-2 border-[var(--gray-200)] rounded-[var(--radius-sm)] text-[15px] text-[var(--dark)] bg-white transition-all outline-none focus:border-[var(--orange)] focus:shadow-[0_0_0_3px_rgba(232,112,10,0.1)] placeholder:text-[var(--gray-500)] max-[900px]:text-base max-[900px]:min-h-11"
            />
          </div>

          <div className="mb-5">
            <div className="flex justify-between items-center mb-1.5 max-[900px]:flex-wrap max-[900px]:gap-1">
              <label htmlFor="login-password" className="text-sm font-semibold text-[var(--dark)]">Mot de passe</label>
              <button
                type="button"
                onClick={handleForgotPassword}
                className="text-[13px] text-[var(--orange)] font-semibold bg-transparent border-none cursor-pointer hover:underline"
              >
                Mot de passe oublié ?
              </button>
            </div>
            <div className="relative">
            <input
              id="login-password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="Votre mot de passe"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full py-3.5 pl-4 pr-24 border-2 border-[var(--gray-200)] rounded-[var(--radius-sm)] text-[15px] text-[var(--dark)] bg-white transition-all outline-none focus:border-[var(--orange)] focus:shadow-[0_0_0_3px_rgba(232,112,10,0.1)] placeholder:text-[var(--gray-500)] max-[900px]:text-base max-[900px]:min-h-11"
            />
            {/* Afficher / masquer (modèle Square, Flodesk — via Mobbin) */}
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-pressed={showPassword}
              aria-controls="login-password"
              className="absolute right-2 top-1/2 -translate-y-1/2 py-1.5 px-3 rounded-lg text-[13px] font-semibold text-[var(--gray-700)] bg-transparent border-none cursor-pointer hover:bg-[var(--gray-100)]"
            >
              {showPassword ? 'Masquer' : 'Afficher'}
            </button>
            </div>
          </div>

          {/* Error / Success */}
          {error && (
            <div role="alert" className="text-[var(--red)] text-sm mb-3 font-semibold">{error}</div>
          )}
          {success && (
            <div role="status" className="text-[var(--green)] text-sm mb-3 font-semibold">{success}</div>
          )}

          {/* Login button */}
          <button
            type="submit"
            disabled={loading}
            className="bg-[var(--orange)] text-white py-4 rounded-full font-sora font-bold text-base border-none cursor-pointer transition-all w-full mt-2 hover:bg-[var(--orange-dark)] hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(232,112,10,0.3)] disabled:opacity-60 disabled:cursor-not-allowed disabled:transform-none max-[900px]:min-h-11 max-[900px]:text-[15px] max-[900px]:py-3.5"
          >
            {loading ? 'Connexion...' : 'Se connecter'}
          </button>
          </form>

          {/* Google login (artisan only) */}
          {tab === 'artisan' && (
            <>
              <div className="flex items-center gap-4 my-6 max-[900px]:my-5">
                <div className="flex-1 h-px bg-[var(--gray-200)]" />
                <span className="text-[13px] text-[var(--gray-500)]">ou</span>
                <div className="flex-1 h-px bg-[var(--gray-200)]" />
              </div>

              <button
                type="button"
                onClick={handleGoogleLogin}
                className="w-full py-3.5 border-2 border-[var(--gray-200)] rounded-full bg-white text-[15px] font-semibold text-[var(--dark)] cursor-pointer transition-all flex items-center justify-center gap-2.5 hover:border-[var(--gray-300)] hover:bg-[var(--gray-100)] max-[900px]:min-h-11 max-[900px]:text-sm"
              >
                <svg width="20" height="20" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" /><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" /><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 001 12c0 1.77.42 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" /><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" /></svg>
                Continuer avec Google
              </button>
            </>
          )}

          {/* Footer */}
          <div className="text-center mt-7 text-sm text-[var(--gray-500)] max-[900px]:text-[13px] max-[900px]:mt-6">
            {tab === 'artisan' ? (
              <>Pas encore inscrit ? <Link href="/inscription" className="text-[var(--orange)] font-semibold no-underline hover:underline">Créer mon profil artisan</Link></>
            ) : (
              <>Pas encore de compte ? <Link href="/inscription-client" className="text-[var(--orange)] font-semibold no-underline hover:underline">Créer mon compte client</Link></>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
