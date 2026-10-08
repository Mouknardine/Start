'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Logo from '@/components/Logo'
import { createClient } from '@/lib/supabase/client'
import { signUp, signIn, saveArtisanProfile, uploadToStorage } from '@/lib/supabase/helpers'
import { notify } from '@/lib/email/notify'
import PasswordStrength, { isPasswordValid } from '@/components/PasswordStrength'
import { compressImage } from '@/lib/image'
import IdeVerification from '@/components/IdeVerification'
import { METIERS } from '@/lib/metiers'

// ===== TYPES =====
type HoraireSlot = { debut: string; fin: string }
type HoraireDay = { jour: string; ouvert: boolean; slots: HoraireSlot[] }
type ContactPrefs = { complete: boolean; message: boolean; appel: boolean }
type FieldErrors = Record<string, string>

const SPECIALITE_SUGGESTIONS = ['Dépannage urgent', 'Installation', 'Rénovation', 'Entretien', 'Salle de bain', 'Chauffage']
const JOURS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche']
const URGENCE_JOURS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']

const DEFAULT_HORAIRES: HoraireDay[] = JOURS.map((jour, i) => ({
  jour,
  ouvert: i < 5,
  slots: [{ debut: i < 5 ? '07:30' : (i === 5 ? '08:00' : ''), fin: i < 5 ? '18:00' : (i === 5 ? '12:00' : '') }],
}))

export default function InscriptionPage() {
  const router = useRouter()
  const [step, setStep] = useState(1)

  // Step 1 — Vérification IDE-CHE (Zefix) — OBLIGATOIRE
  const [ideNumber, setIdeNumber] = useState('')
  const [ideVerified, setIdeVerified] = useState(false)
  const [ideCompanyName, setIdeCompanyName] = useState('')

  // Step 1 — Infos perso
  const [prenom, setPrenom] = useState('')
  const [nom, setNom] = useState('')
  const [entreprise, setEntreprise] = useState('')
  const [email, setEmail] = useState('')
  const [telephone, setTelephone] = useState('')
  const [adresse, setAdresse] = useState('')
  const [site, setSite] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')

  // Step 2
  const [metier, setMetier] = useState('')
  const [metierCustom, setMetierCustom] = useState('')
  const [specialites, setSpecialites] = useState<string[]>([])
  const [specInput, setSpecInput] = useState('')
  const [communes, setCommunes] = useState<string[]>([])
  const [communeInput, setCommuneInput] = useState('')
  const [description, setDescription] = useState('')
  const [contactPrefs, setContactPrefs] = useState<ContactPrefs>({ complete: true, message: false, appel: false })
  const [urgence, setUrgence] = useState(false)
  const [urgenceSupplement, setUrgenceSupplement] = useState('')
  const [urgenceRayon, setUrgenceRayon] = useState('')
  const [urgenceHeureDebut, setUrgenceHeureDebut] = useState('07:00')
  const [urgenceHeureFin, setUrgenceHeureFin] = useState('22:00')
  const [urgenceJours, setUrgenceJours] = useState<string[]>(['Lun', 'Mar', 'Mer', 'Jeu', 'Ven'])
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Step 3
  const [horaires, setHoraires] = useState<HoraireDay[]>(DEFAULT_HORAIRES)

  // Step 4
  const [plan, setPlan] = useState<'annuel' | 'mensuel'>('annuel')
  const [cguAccepted, setCguAccepted] = useState(false)

  // Global
  const [errors, setErrors] = useState<FieldErrors>({})
  const [signupError, setSignupError] = useState('')
  const [loading, setLoading] = useState(false)

  // ===== VALIDATION =====
  function isValidEmail(e: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)
  }

  function validateStep1(): boolean {
    const errs: FieldErrors = {}
    if (!ideVerified) errs.ide = 'La vérification de votre entreprise au registre du commerce est obligatoire'
    if (!prenom.trim()) errs.prenom = 'Le prénom est obligatoire'
    if (!nom.trim()) errs.nom = 'Le nom est obligatoire'
    if (!email.trim()) errs.email = "L'adresse email est obligatoire"
    else if (!isValidEmail(email.trim())) errs.email = "L'adresse email n'est pas valide"
    if (!telephone.trim()) errs.telephone = 'Le numéro de téléphone est obligatoire'
    if (!password) errs.password = 'Le mot de passe est obligatoire'
    else if (!isPasswordValid(password)) errs.password = 'Mot de passe trop faible : 8 caractères min, une majuscule, une minuscule, un chiffre'
    if (password && !passwordConfirm) errs.passwordConfirm = 'Veuillez confirmer votre mot de passe'
    else if (password && passwordConfirm && password !== passwordConfirm) errs.passwordConfirm = 'Les mots de passe ne correspondent pas'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  function goToStep(target: number) {
    if (target === 2 && step === 1) {
      if (!validateStep1()) return
    }
    setStep(target)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // ===== TAG INPUT =====
  function addTag(list: string[], setList: (v: string[]) => void, value: string) {
    const trimmed = value.trim()
    if (!trimmed) return
    if (list.some(t => t.toLowerCase() === trimmed.toLowerCase())) return
    setList([...list, trimmed])
  }

  function removeTag(list: string[], setList: (v: string[]) => void, index: number) {
    setList(list.filter((_, i) => i !== index))
  }

  // ===== HORAIRES =====
  function toggleDay(dayIndex: number) {
    setHoraires(prev => prev.map((h, i) => i === dayIndex ? { ...h, ouvert: !h.ouvert } : h))
  }

  function updateSlot(dayIndex: number, slotIndex: number, field: 'debut' | 'fin', value: string) {
    setHoraires(prev => prev.map((h, di) =>
      di === dayIndex ? { ...h, slots: h.slots.map((s, si) => si === slotIndex ? { ...s, [field]: value } : s) } : h
    ))
  }

  function addSlot(dayIndex: number) {
    setHoraires(prev => prev.map((h, i) =>
      i === dayIndex ? { ...h, slots: [...h.slots, { debut: '', fin: '' }] } : h
    ))
  }

  function removeSlot(dayIndex: number, slotIndex: number) {
    setHoraires(prev => prev.map((h, i) =>
      i === dayIndex && h.slots.length > 1 ? { ...h, slots: h.slots.filter((_, si) => si !== slotIndex) } : h
    ))
  }

  // ===== FILE UPLOAD =====
  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    // Validation magic bytes + extension + taille
    const { validateImageFile } = await import('@/lib/upload-security')
    const v = await validateImageFile(file)
    if (!v.valid) {
      setErrors(prev => ({ ...prev, avatar: v.error }))
      e.target.value = ''
      return
    }
    setAvatarFile(file)
    setAvatarPreview(URL.createObjectURL(file))
    setErrors(prev => { const { avatar: _, ...rest } = prev; void _; return rest })
  }

  // ===== SIGNUP =====
  async function handleSignup() {
    setSignupError('')
    if (!cguAccepted) {
      setSignupError("Veuillez accepter les conditions générales d'utilisation.")
      return
    }
    if (!email.trim() || !isPasswordValid(password) || password !== passwordConfirm) {
      setSignupError('Veuillez vérifier vos informations (email, mot de passe).')
      return
    }

    setLoading(true)
    const supabase = createClient()

    try {
      const authData = await signUp(supabase, email.trim(), password, '/dashboard')
      const user = authData.user
      if (!user) throw new Error('Erreur lors de la création du compte.')

      // Collect profile (sans avatar pour l'instant — upload après confirmation)
      const metierValue = metier === 'autre' ? metierCustom.trim() : metier
      const profileData = {
        prenom: prenom.trim(),
        nom: nom.trim(),
        entreprise: entreprise.trim(),
        telephone: telephone.trim(),
        email: email.trim(),
        adresse: adresse.trim(),
        site: site.trim(),
        metier: metierValue,
        specialites,
        zones: communes,
        description: description.trim(),
        horaires: horaires.map(h => ({ jour: h.jour, ouvert: h.ouvert, debut: h.slots[0]?.debut || '', fin: h.slots[0]?.fin || '' })),
        urgence,
        urgence_supplement: urgenceSupplement,
        urgence_rayon: urgenceRayon,
        urgence_heure_debut: urgenceHeureDebut,
        urgence_heure_fin: urgenceHeureFin,
        urgence_jours: urgenceJours,
        contact_prefs: contactPrefs,
        avatar_url: '',
        gallery_urls: [] as string[],
      }

      // Si Supabase exige la confirmation d'email : pas de session disponible
      // → on stocke le profil en attente, l'utilisateur le finalise après confirmation
      if (!authData.session) {
        localStorage.setItem('artisano-pending-profile', JSON.stringify(profileData))
        // Stocker aussi l'IDE pour persistance après confirmation
        if (ideNumber && ideVerified) {
          localStorage.setItem('artisano-pending-ide', ideNumber)
        }
        if (avatarFile) {
          // Le fichier ne peut pas être stocké en localStorage. On le perd.
          // L'utilisateur pourra l'uploader depuis /mon-profil après confirmation.
        }
        router.push(`/auth/confirmer-email?email=${encodeURIComponent(email.trim())}`)
        return
      }

      // Confirmation désactivée : on a déjà une session, on enchaîne
      // Upload avatar (compressé côté navigateur)
      if (avatarFile) {
        try {
          const compressed = await compressImage(avatarFile, 'avatar')
          const ext = compressed.name.split('.').pop()
          profileData.avatar_url = await uploadToStorage(supabase, user.id, `avatar.${ext}`, compressed)
        } catch (e) {
          console.warn('Avatar upload failed:', e)
        }
      }

      try {
        await saveArtisanProfile(supabase, user.id, profileData)
      } catch (dbErr) {
        console.warn('Profil DB non sauvé:', dbErr)
      }

      // Persiste la vérification IDE (déjà validée en mode "check" à l'étape 1).
      // On rappelle l'API en mode "save" pour stocker via la RPC SECURITY DEFINER.
      if (ideNumber && ideVerified) {
        try {
          await fetch('/api/verify-ide', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ide: ideNumber, mode: 'save' }),
          })
        } catch (e) {
          console.warn('Persistance IDE échouée:', e)
        }
      }

      localStorage.setItem('artisano-profil', JSON.stringify(profileData))
      notify.welcomeArtisan()
      router.push('/dashboard')
    } catch (err: unknown) {
      setLoading(false)
      const msg = err instanceof Error ? err.message : 'Une erreur est survenue.'
      if (msg.includes('already registered') || msg.includes('already been registered')) {
        setSignupError('Cette adresse email est déjà utilisée. Essayez de vous connecter.')
      } else {
        setSignupError(msg)
      }
    }
  }

  // ===== STEPPER =====
  const renderStepper = () => {
    const steps = ['Votre entreprise', 'Votre activité', 'Disponibilités', 'Abonnement']
    return (
      <>
      <div role="list" aria-label="Étapes de l’inscription" className="flex items-center gap-0 mb-10 overflow-x-auto max-[900px]:mb-2" style={{ scrollbarWidth: 'none' }}>
        {steps.map((label, i) => {
          const num = i + 1
          const isActive = num === step
          const isCompleted = num < step
          return (
            <div key={num} className="contents">
              {i > 0 && (
                <div className={`flex-1 h-0.5 mx-4 min-w-4 max-[900px]:mx-2 max-[500px]:mx-1 max-[500px]:min-w-2 ${isCompleted ? 'bg-[var(--orange)]' : 'bg-[var(--gray-200)]'}`} />
              )}
              <div role="listitem" aria-current={isActive ? 'step' : undefined} className="flex items-center gap-2.5 max-[900px]:gap-1.5">
                <div className={`w-9 h-9 min-w-9 rounded-full flex items-center justify-center font-sora font-bold text-sm transition-all max-[900px]:w-7 max-[900px]:h-7 max-[900px]:min-w-7 max-[900px]:text-xs max-[500px]:w-6 max-[500px]:h-6 max-[500px]:min-w-6 max-[500px]:text-[11px] ${
                  isActive ? 'bg-[var(--orange)] text-white shadow-[0_0_0_4px_rgba(232,112,10,0.15)]' :
                  isCompleted ? 'bg-[var(--orange)] text-white' :
                  'bg-white text-[var(--gray-500)] border-2 border-[var(--gray-300)]'
                }`}>
                  {isCompleted ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                  ) : num}
                </div>
                <span className={`text-[13px] font-semibold whitespace-nowrap max-[900px]:sr-only ${isActive ? 'text-[var(--dark)]' : 'text-[var(--gray-500)]'}`}>{label}</span>
              </div>
            </div>
          )
        })}
      </div>
      {/* Sur mobile les libellés sont masqués : on rappelle l'étape en cours */}
      <p aria-hidden="true" className="hidden max-[900px]:block text-[13px] font-semibold text-[var(--gray-500)] mb-6">
        Étape {step} sur {steps.length} · <span className="text-[var(--dark)]">{steps[step - 1]}</span>
      </p>
      </>
    )
  }

  // ===== ERROR DISPLAY =====
  const fieldError = (field: string) =>
    errors[field] ? (
      <div className="flex items-center gap-1.5 text-[var(--red)] text-[13px] mt-1.5">
        <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        <span>{errors[field]}</span>
      </div>
    ) : null

  const inputClass = (field?: string) =>
    `w-full py-3.5 px-4 border-2 rounded-[var(--radius-sm)] text-[15px] text-[var(--dark)] bg-white transition-all outline-none focus:border-[var(--orange)] focus:shadow-[0_0_0_3px_rgba(232,112,10,0.1)] placeholder:text-[var(--gray-500)] max-[900px]:text-base max-[900px]:min-h-11 max-[900px]:py-3 max-[900px]:px-3.5 ${
      field && errors[field] ? 'border-[var(--red)] shadow-[0_0_0_3px_rgba(211,47,47,0.1)]' : 'border-[var(--gray-200)]'
    }`

  // ===== TAG COMPONENT =====
  const renderTagInput = ({ tags, setTags, input, setInput, placeholder, suggestions }: {
    tags: string[]; setTags: (v: string[]) => void; input: string; setInput: (v: string) => void; placeholder: string; suggestions?: string[]
  }) => {
    return (
      <div>
        <div className="border-2 border-[var(--gray-200)] rounded-[var(--radius-sm)] p-2.5 flex flex-wrap gap-2 items-center bg-white cursor-text min-h-[50px] transition-all focus-within:border-[var(--orange)] focus-within:shadow-[0_0_0_3px_rgba(232,112,10,0.1)] max-[900px]:min-h-11 max-[900px]:p-2">
          {tags.map((tag, i) => (
            <div key={i} className="flex items-center gap-1.5 bg-[rgba(232,112,10,0.08)] border border-[rgba(232,112,10,0.2)] text-[var(--dark)] py-1.5 px-3 rounded-full text-[13px] font-semibold animate-[tagIn_0.2s_ease-out]">
              <span>{tag}</span>
              <button type="button" onClick={() => removeTag(tags, setTags, i)} className="text-[var(--gray-500)] hover:text-[var(--red)] transition-colors">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
          ))}
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addTag(tags, setTags, input)
                setInput('')
              }
            }}
            placeholder={tags.length === 0 ? placeholder : ''}
            className="border-none outline-none shadow-none py-1 flex-1 min-w-[180px] bg-transparent text-[15px] max-[900px]:min-w-[120px] max-[900px]:text-base"
          />
        </div>
        {suggestions && suggestions.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3 max-[900px]:gap-1.5">
            {suggestions.map(s => {
              const used = tags.some(t => t.toLowerCase() === s.toLowerCase())
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => { if (!used) { addTag(tags, setTags, s) } }}
                  className={`bg-[var(--gray-100)] border border-[var(--gray-200)] py-1.5 px-3.5 rounded-full text-[13px] font-medium transition-all max-[900px]:text-xs max-[900px]:py-1 max-[900px]:px-3 ${
                    used ? 'opacity-40 pointer-events-none line-through text-[var(--gray-500)]' : 'text-[var(--gray-700)] cursor-pointer hover:bg-[var(--gray-200)] hover:border-[var(--gray-300)]'
                  }`}
                >
                  {s}
                </button>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* NAV */}
      <nav className="fixed top-0 left-0 right-0 z-50 px-10 py-4 flex items-center justify-between bg-[rgba(250,250,248,0.9)] backdrop-blur-[20px] border-b border-black/5 max-[900px]:px-4 max-[900px]:py-3 max-[500px]:px-3 max-[500px]:py-2.5">
        <Logo />
        <div className="text-sm text-[var(--gray-500)] max-[900px]:hidden">
          Vous avez déjà un compte ? <Link href="/connexion" className="text-[var(--orange)] font-semibold no-underline hover:underline">Se connecter</Link>
        </div>
      </nav>

      <div className="grid grid-cols-[420px_1fr] min-h-screen pt-[65px] max-[960px]:grid-cols-1 max-[900px]:grid-cols-1">

        {/* LEFT PANEL */}
        <div className="bg-[var(--dark)] py-12 px-10 flex flex-col justify-between sticky top-[65px] h-[calc(100vh-65px)] overflow-hidden relative max-[960px]:static max-[960px]:h-auto max-[960px]:py-8 max-[960px]:px-6 max-[900px]:hidden">
          {/* Decorative circles */}
          <div className="absolute -top-[100px] -right-[100px] w-[350px] h-[350px] rounded-full pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(232,112,10,0.12) 0%, transparent 70%)' }} />
          <div className="absolute -bottom-[80px] -left-[80px] w-[250px] h-[250px] rounded-full pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(240,180,41,0.08) 0%, transparent 70%)' }} />

          <div className="relative z-10">
            <h1 className="font-sora text-[32px] font-extrabold text-white leading-tight mb-4">
              Recevez des <span className="text-[var(--orange-light)]">demandes locales</span> qualifiées
            </h1>
            <p className="text-white/60 text-base leading-relaxed mb-10">
              Créez votre profil professionnel en quelques minutes et commencez à recevoir des demandes de clients dans votre zone.
            </p>

            <div className="flex flex-col gap-5">
              {[
                { icon: <><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></>, title: 'Visibilité locale', desc: 'Apparaissez quand un client cherche un artisan dans votre zone' },
                { icon: <><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></>, title: 'Avis vérifiés', desc: 'Construisez votre réputation avec des avis que seuls les vrais clients peuvent laisser' },
                { icon: <><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></>, title: 'Gestion simple', desc: 'Un tableau de bord clair pour vos demandes, rendez-vous et disponibilités' },
                { icon: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></>, title: 'Sans engagement', desc: 'Résiliez à tout moment, sans frais cachés' },
              ].map((av, i) => (
                <div key={i} className="flex gap-4 items-start">
                  <div className="w-11 h-11 bg-white/[0.08] rounded-xl flex items-center justify-center shrink-0">
                    <svg className="w-[22px] h-[22px] text-[var(--orange-light)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">{av.icon}</svg>
                  </div>
                  <div>
                    <h3 className="font-sora text-[15px] font-bold text-white mb-1">{av.title}</h3>
                    <p className="text-[13px] text-white/50 leading-snug">{av.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Pricing teaser */}
          <div className="relative z-10 bg-white/[0.06] border border-white/10 rounded-[var(--radius)] p-6 mt-10">
            <div className="font-sora text-4xl font-extrabold text-white">25 CHF <span className="text-base font-medium text-white/50">/ mois</span></div>
            <div className="text-[13px] text-white/40 mt-1.5">ou 30 CHF par mois sans engagement annuel</div>
            <div className="inline-flex items-center gap-1.5 bg-[rgba(240,180,41,0.15)] text-[var(--yellow-light)] py-1.5 px-3.5 rounded-full text-xs font-extrabold font-sora uppercase tracking-wider mt-3">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
              Offre de lancement
            </div>
          </div>
        </div>

        {/* RIGHT PANEL - FORM */}
        <div className="py-12 px-[60px] max-w-[720px] max-[960px]:py-8 max-[960px]:px-6 max-[900px]:pt-20 max-[900px]:px-4 max-[900px]:pb-10 max-[900px]:max-w-full max-[500px]:px-3 max-[500px]:pt-[72px] max-[500px]:pb-8">
          {renderStepper()}

          {/* ===== STEP 1 ===== */}
          {step === 1 && (
            <div className="animate-[fadeIn_0.4s_ease-out]">
              <h2 className="font-sora text-[26px] font-extrabold mb-2 max-[900px]:text-xl max-[500px]:text-lg">Votre entreprise</h2>
              <p className="text-[15px] text-[var(--gray-500)] mb-8 leading-relaxed max-[900px]:text-sm max-[900px]:mb-6">
                Ces informations seront visibles sur votre profil public. Remplissez-les avec soin.
              </p>

              {/* ÉTAPE 1.A — Vérification IDE-CHE OBLIGATOIRE */}
              <div className="mb-8 p-5 border-2 border-[var(--orange)] rounded-[var(--radius)] bg-[rgba(232,112,10,0.03)] max-[900px]:p-4">
                <div className="flex items-start gap-2.5 mb-3">
                  <svg className="w-5 h-5 shrink-0 mt-0.5 text-[var(--orange)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M9 12l2 2 4-4" />
                    <path d="M21 12c0 4.97-4.03 9-9 9s-9-4.03-9-9 4.03-9 9-9c2.21 0 4.21.81 5.75 2.15" />
                  </svg>
                  <div>
                    <div className="font-sora font-bold text-[15px] text-[var(--dark)] mb-1">
                      Vérification d&apos;entreprise <span className="text-[var(--red)]">*</span>
                    </div>
                    <p className="text-[13px] text-[var(--gray-700)] leading-relaxed">
                      Artisano nécessite une entreprise inscrite au registre du commerce suisse.
                      Renseignez votre numéro IDE pour vérification automatique.
                    </p>
                  </div>
                </div>
                <IdeVerification
                  initialIde={ideNumber}
                  alreadyVerified={ideVerified}
                  alreadyCompanyName={ideCompanyName}
                  mode="check"
                  onVerified={(r) => {
                    if (r.verified && r.ide) {
                      setIdeNumber(r.ide)
                      setIdeVerified(true)
                      if (r.name) {
                        setIdeCompanyName(r.name)
                        // Pré-remplit le champ "Nom de l'entreprise" si vide
                        if (!entreprise.trim()) setEntreprise(r.name)
                      }
                      // Pré-remplit l'adresse si vide
                      if (!adresse.trim() && r.legalSeat) setAdresse(r.legalSeat)
                      // Efface l'erreur ide
                      setErrors(prev => { const { ide: _, ...rest } = prev; void _; return rest })
                    }
                  }}
                />
                {fieldError('ide')}
                <p className="text-[12px] text-[var(--gray-500)] mt-3 leading-relaxed">
                  Vous êtes en raison individuelle non inscrite au RC ?{' '}
                  <a href="mailto:contact@artisano.ch" className="text-[var(--orange)] underline">
                    Contactez-nous
                  </a>
                  {' '}pour une inscription manuelle.
                </p>
              </div>

              {/* Le reste de l'étape 1 est grisé tant que l'IDE n'est pas vérifié */}
              <div className={ideVerified ? '' : 'opacity-50 pointer-events-none select-none'}>

              {/* Prénom / Nom */}
              <div className="grid grid-cols-2 gap-4 mb-6 max-[900px]:grid-cols-1 max-[900px]:gap-3">
                <div>
                  <label className="block text-sm font-semibold text-[var(--dark)] mb-2">Prénom <span className="text-[var(--red)]">*</span></label>
                  <input type="text" placeholder="Jean" value={prenom} onChange={e => { setPrenom(e.target.value); if (e.target.value.trim()) setErrors(prev => { const { prenom, ...r } = prev; return r }) }} className={inputClass('prenom')} />
                  {fieldError("prenom")}
                </div>
                <div>
                  <label className="block text-sm font-semibold text-[var(--dark)] mb-2">Nom <span className="text-[var(--red)]">*</span></label>
                  <input type="text" placeholder="Müller" value={nom} onChange={e => { setNom(e.target.value); if (e.target.value.trim()) setErrors(prev => { const { nom, ...r } = prev; return r }) }} className={inputClass('nom')} />
                  {fieldError("nom")}
                </div>
              </div>

              {/* Entreprise */}
              <div className="mb-6">
                <label className="block text-sm font-semibold text-[var(--dark)] mb-2">Nom de l&apos;entreprise</label>
                <input type="text" placeholder="Müller & Fils Sàrl" value={entreprise} onChange={e => setEntreprise(e.target.value)} className={inputClass()} />
                <div className="text-[13px] text-[var(--gray-500)] mt-1.5">C&apos;est le nom qui apparaîtra sur votre profil</div>
              </div>

              {/* Email */}
              <div className="mb-6">
                <label className="block text-sm font-semibold text-[var(--dark)] mb-2">Adresse email professionnelle <span className="text-[var(--red)]">*</span></label>
                <input
                  type="email"
                  placeholder="contact@muller-fils.ch"
                  value={email}
                  onChange={e => {
                    setEmail(e.target.value)
                    if (e.target.value.trim() && isValidEmail(e.target.value.trim())) setErrors(prev => { const { email, ...r } = prev; return r })
                  }}
                  onBlur={() => {
                    if (email.trim() && !isValidEmail(email.trim())) setErrors(prev => ({ ...prev, email: "L'adresse email n'est pas valide" }))
                  }}
                  className={inputClass('email')}
                />
                {fieldError("email")}
              </div>

              {/* Téléphone */}
              <div className="mb-6">
                <label className="block text-sm font-semibold text-[var(--dark)] mb-2">Numéro de téléphone <span className="text-[var(--red)]">*</span></label>
                <input type="tel" placeholder="021 123 45 67" value={telephone} onChange={e => { setTelephone(e.target.value); if (e.target.value.trim()) setErrors(prev => { const { telephone, ...r } = prev; return r }) }} className={inputClass('telephone')} />
                {fieldError("telephone")}
              </div>

              {/* Adresse */}
              <div className="mb-6">
                <label className="block text-sm font-semibold text-[var(--dark)] mb-2">Adresse de l&apos;entreprise</label>
                <input type="text" placeholder="Rue du Lac 15, 1003 Lausanne" value={adresse} onChange={e => setAdresse(e.target.value)} className={inputClass()} />
              </div>

              {/* Site */}
              <div className="mb-6">
                <label className="block text-sm font-semibold text-[var(--dark)] mb-2">Site internet <span className="text-[var(--gray-500)] font-normal">(facultatif)</span></label>
                <input type="url" placeholder="https://www.muller-fils.ch" value={site} onChange={e => setSite(e.target.value)} className={inputClass()} />
              </div>

              <hr className="border-t border-[var(--gray-200)] my-8 max-[900px]:my-6" />

              {/* Password */}
              <div className="mb-6">
                <label className="block text-sm font-semibold text-[var(--dark)] mb-2">Mot de passe <span className="text-[var(--red)]">*</span></label>
                <input
                  type="password"
                  placeholder="8 caractères, une majuscule, un chiffre"
                  value={password}
                  onChange={e => {
                    setPassword(e.target.value)
                    if (isPasswordValid(e.target.value)) setErrors(prev => { const { password, ...r } = prev; return r })
                    if (passwordConfirm && e.target.value !== passwordConfirm) setErrors(prev => ({ ...prev, passwordConfirm: 'Les mots de passe ne correspondent pas' }))
                    else setErrors(prev => { const { passwordConfirm, ...r } = prev; return r })
                  }}
                  className={inputClass('password')}
                />
                <PasswordStrength password={password} />
                {fieldError("password")}
              </div>

              <div className="mb-6">
                <label className="block text-sm font-semibold text-[var(--dark)] mb-2">Confirmez le mot de passe <span className="text-[var(--red)]">*</span></label>
                <input
                  type="password"
                  placeholder="Retapez votre mot de passe"
                  value={passwordConfirm}
                  onChange={e => {
                    setPasswordConfirm(e.target.value)
                    if (e.target.value && e.target.value !== password) setErrors(prev => ({ ...prev, passwordConfirm: 'Les mots de passe ne correspondent pas' }))
                    else setErrors(prev => { const { passwordConfirm, ...r } = prev; return r })
                  }}
                  className={inputClass('passwordConfirm')}
                />
                {fieldError("passwordConfirm")}
              </div>

              </div>{/* /grisé tant que !ideVerified */}

              {/* Actions */}
              <div className="flex justify-end items-center mt-10 pt-6 border-t border-[var(--gray-200)] max-[900px]:flex-col-reverse max-[900px]:gap-3 max-[900px]:mt-8 max-[900px]:pt-5">
                <button
                  onClick={() => goToStep(2)}
                  disabled={!ideVerified}
                  className="bg-[var(--orange)] text-white py-3.5 px-9 rounded-full font-sora font-bold text-[15px] flex items-center gap-2 transition-all hover:bg-[var(--orange-dark)] hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(232,112,10,0.3)] max-[900px]:w-full max-[900px]:justify-center max-[900px]:min-h-12 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none"
                  title={!ideVerified ? 'Vérifiez d\'abord votre numéro IDE' : ''}
                >
                  Continuer
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                </button>
              </div>
            </div>
          )}

          {/* ===== STEP 2 ===== */}
          {step === 2 && (
            <div className="animate-[fadeIn_0.4s_ease-out]">
              <h2 className="font-sora text-[26px] font-extrabold mb-2 max-[900px]:text-xl max-[500px]:text-lg">Votre activité</h2>
              <p className="text-[15px] text-[var(--gray-500)] mb-8 leading-relaxed max-[900px]:text-sm max-[900px]:mb-6">
                Décrivez ce que vous faites et où vous intervenez. Plus votre profil est complet, plus les clients vous font confiance.
              </p>

              {/* Métier */}
              <div className="mb-6">
                <label className="block text-sm font-semibold text-[var(--dark)] mb-2">Métier principal</label>
                <select
                  value={metier}
                  onChange={e => setMetier(e.target.value)}
                  className={`${inputClass()} appearance-none bg-no-repeat bg-[right_16px_center] pr-11`}
                  style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg width='12' height='8' viewBox='0 0 12 8' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1.5L6 6.5L11 1.5' stroke='%238A8680' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")` }}
                >
                  <option value="">Sélectionnez votre métier</option>
                  {METIERS.map(m => <option key={m} value={m}>{m}</option>)}
                  <option value="autre">Autre (précisez)</option>
                </select>
                {metier === 'autre' && (
                  <input type="text" placeholder="Tapez votre métier, par exemple : carreleur, peintre, menuisier..." value={metierCustom} onChange={e => setMetierCustom(e.target.value)} className={`${inputClass()} mt-2.5`} />
                )}
                <div className="text-[13px] text-[var(--gray-500)] mt-1.5">Si votre métier n&apos;est pas dans la liste, choisissez &quot;Autre&quot; et écrivez-le</div>
              </div>

              {/* Spécialités */}
              <div className="mb-6">
                <div className="font-sora text-base font-bold text-[var(--dark)] mb-5 flex items-center gap-2.5 max-[900px]:text-[15px]">
                  <svg className="w-5 h-5 text-[var(--orange)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
                  Spécialités <span className="text-[var(--gray-500)] font-normal text-sm">(facultatif)</span>
                </div>
                {renderTagInput({ tags: specialites, setTags: setSpecialites, input: specInput, setInput: setSpecInput, placeholder: "Tapez une spécialité et appuyez sur Entrée", suggestions: SPECIALITE_SUGGESTIONS })}
                <div className="text-[13px] text-[var(--gray-500)] mt-1.5 leading-relaxed">Ajoutez vos spécialités une par une.</div>
              </div>

              <hr className="border-t border-[var(--gray-200)] my-8 max-[900px]:my-6" />

              {/* Communes */}
              <div className="mb-6">
                <div className="font-sora text-base font-bold text-[var(--dark)] mb-5 flex items-center gap-2.5 max-[900px]:text-[15px]">
                  <svg className="w-5 h-5 text-[var(--orange)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
                  Communes desservies
                </div>
                {renderTagInput({ tags: communes, setTags: setCommunes, input: communeInput, setInput: setCommuneInput, placeholder: "Tapez le nom d'une commune et appuyez sur Entrée" })}
                <div className="text-[13px] text-[var(--gray-500)] mt-1.5 leading-relaxed">Ajoutez toutes les communes où vous vous déplacez.</div>
              </div>

              <hr className="border-t border-[var(--gray-200)] my-8 max-[900px]:my-6" />

              {/* Description */}
              <div className="mb-6">
                <label className="block text-sm font-semibold text-[var(--dark)] mb-2">Description de votre activité <span className="text-[var(--gray-500)] font-normal">(facultatif)</span></label>
                <textarea
                  placeholder="Décrivez votre entreprise, votre expérience et ce qui vous distingue..."
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  className={`${inputClass()} resize-y min-h-[100px]`}
                />
                <div className="text-[13px] text-[var(--gray-500)] mt-1.5">Cette description sera visible sur votre profil.</div>
              </div>

              <hr className="border-t border-[var(--gray-200)] my-8 max-[900px]:my-6" />

              {/* Contact prefs */}
              <div className="mb-6">
                <div className="font-sora text-base font-bold text-[var(--dark)] mb-5 flex items-center gap-2.5 max-[900px]:text-[15px]">
                  <svg className="w-5 h-5 text-[var(--orange)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6A19.79 19.79 0 013.12 4.18 2 2 0 015.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>
                  Comment les clients peuvent vous contacter
                </div>
                <div className="text-[13px] text-[var(--gray-500)] -mt-3 mb-3.5 leading-relaxed">Choisissez les modes de contact que vous souhaitez activer.</div>

                <div className="flex flex-col gap-2.5">
                  {/* Complete (always on) */}
                  <button type="button" onClick={() => setContactPrefs(p => ({ ...p, complete: true }))} className={`flex items-center gap-2.5 p-3 border-2 rounded-[var(--radius-sm)] cursor-pointer transition-all select-none text-left max-[900px]:p-2.5 ${contactPrefs.complete ? 'border-[var(--orange)] bg-[rgba(232,112,10,0.04)]' : 'border-[var(--gray-200)]'}`}>
                    <div className={`w-[22px] h-[22px] rounded-md border-2 flex items-center justify-center shrink-0 transition-all ${contactPrefs.complete ? 'bg-[var(--orange)] border-[var(--orange)]' : 'border-[var(--gray-300)]'}`}>
                      {contactPrefs.complete && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>}
                    </div>
                    <div>
                      <span className="text-sm font-medium text-[var(--dark)]">Demande complète (rendez-vous ou devis)</span>
                      <span className="block text-xs text-[var(--gray-500)] mt-0.5">Le client remplit un formulaire avec ses coordonnées et le créneau souhaité. Toujours activé.</span>
                    </div>
                  </button>

                  <button type="button" onClick={() => setContactPrefs(p => ({ ...p, message: !p.message }))} className={`flex items-center gap-2.5 p-3 border-2 rounded-[var(--radius-sm)] cursor-pointer transition-all select-none text-left max-[900px]:p-2.5 ${contactPrefs.message ? 'border-[var(--orange)] bg-[rgba(232,112,10,0.04)]' : 'border-[var(--gray-200)]'}`}>
                    <div className={`w-[22px] h-[22px] rounded-md border-2 flex items-center justify-center shrink-0 transition-all ${contactPrefs.message ? 'bg-[var(--orange)] border-[var(--orange)]' : 'border-[var(--gray-300)]'}`}>
                      {contactPrefs.message && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>}
                    </div>
                    <div>
                      <span className="text-sm font-medium text-[var(--dark)]">Message rapide</span>
                      <span className="block text-xs text-[var(--gray-500)] mt-0.5">Le client envoie un court message avec son numéro. Vous le recontactez.</span>
                    </div>
                  </button>

                  <button type="button" onClick={() => setContactPrefs(p => ({ ...p, appel: !p.appel }))} className={`flex items-center gap-2.5 p-3 border-2 rounded-[var(--radius-sm)] cursor-pointer transition-all select-none text-left max-[900px]:p-2.5 ${contactPrefs.appel ? 'border-[var(--orange)] bg-[rgba(232,112,10,0.04)]' : 'border-[var(--gray-200)]'}`}>
                    <div className={`w-[22px] h-[22px] rounded-md border-2 flex items-center justify-center shrink-0 transition-all ${contactPrefs.appel ? 'bg-[var(--orange)] border-[var(--orange)]' : 'border-[var(--gray-300)]'}`}>
                      {contactPrefs.appel && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>}
                    </div>
                    <div>
                      <span className="text-sm font-medium text-[var(--dark)]">Appel téléphonique direct</span>
                      <span className="block text-xs text-[var(--gray-500)] mt-0.5">Votre numéro sera visible et les clients pourront vous appeler directement.</span>
                    </div>
                  </button>
                </div>
              </div>

              <hr className="border-t border-[var(--gray-200)] my-8 max-[900px]:my-6" />

              {/* Urgences */}
              <div className="mb-6">
                <div className="font-sora text-base font-bold text-[var(--dark)] mb-5 flex items-center gap-2.5 max-[900px]:text-[15px]">
                  <svg className="w-5 h-5 text-[var(--orange)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                  Disponibilité urgences <span className="text-[var(--gray-500)] font-normal text-sm">(optionnel)</span>
                </div>
                <div className="text-[13px] text-[var(--gray-500)] -mt-3 mb-3.5 leading-relaxed">Activez cette option si vous acceptez les demandes de dépannage urgent.</div>

                <button
                  type="button"
                  onClick={() => setUrgence(!urgence)}
                  className={`flex items-center gap-2.5 p-3 border-2 rounded-[var(--radius-sm)] cursor-pointer transition-all select-none text-left w-full max-[900px]:p-2.5 ${urgence ? 'border-[#D32F2F] bg-[rgba(211,47,47,0.04)]' : 'border-[var(--gray-200)]'}`}
                >
                  <div className={`w-[22px] h-[22px] rounded-md border-2 flex items-center justify-center shrink-0 transition-all ${urgence ? 'bg-[#D32F2F] border-[#D32F2F]' : 'border-[var(--gray-300)]'}`}>
                    {urgence && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>}
                  </div>
                  <div>
                    <span className="text-sm font-medium text-[var(--dark)]">J&apos;accepte les demandes urgentes (dépannage sous 2h)</span>
                    <span className="block text-xs text-[var(--gray-500)] mt-0.5">Vous serez notifié en priorité. Vous pouvez désactiver à tout moment.</span>
                  </div>
                </button>

                {/* Urgence fields */}
                <div className={`overflow-hidden transition-all duration-400 ${urgence ? 'max-h-[500px] opacity-100 mt-3' : 'max-h-0 opacity-0'}`}>
                  <div className="p-5 bg-[rgba(232,112,10,0.03)] border border-[rgba(232,112,10,0.15)] rounded-[var(--radius-sm)]">
                    <div className="grid grid-cols-2 gap-4 max-[900px]:grid-cols-1">
                      <div>
                        <label className="block text-sm font-semibold text-[var(--dark)] mb-2">Supplément urgence <span className="text-[var(--gray-500)] font-normal">(facultatif)</span></label>
                        <div className="relative">
                          <input type="number" placeholder="Ex: 50" min={0} value={urgenceSupplement} onChange={e => setUrgenceSupplement(e.target.value)} className={`${inputClass()} pr-[50px]`} />
                          <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-sm font-semibold text-[var(--gray-500)] pointer-events-none">CHF</span>
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-[var(--dark)] mb-2">Rayon d&apos;intervention urgence</label>
                        <div className="relative">
                          <input type="number" placeholder="Ex: 15" min={1} value={urgenceRayon} onChange={e => setUrgenceRayon(e.target.value)} className={`${inputClass()} pr-11`} />
                          <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-sm font-semibold text-[var(--gray-500)] pointer-events-none">km</span>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 mt-4 max-[900px]:grid-cols-1">
                      <div>
                        <label className="block text-sm font-semibold text-[var(--dark)] mb-2">Disponible pour urgences de</label>
                        <input type="time" value={urgenceHeureDebut} onChange={e => setUrgenceHeureDebut(e.target.value)} className={inputClass()} />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-[var(--dark)] mb-2">à</label>
                        <input type="time" value={urgenceHeureFin} onChange={e => setUrgenceHeureFin(e.target.value)} className={inputClass()} />
                      </div>
                    </div>

                    <div className="mt-4">
                      <label className="block text-sm font-semibold text-[var(--dark)] mb-2">Jours de disponibilité urgence</label>
                      <div className="flex gap-1.5 flex-wrap">
                        {URGENCE_JOURS.map(j => (
                          <button
                            key={j}
                            type="button"
                            onClick={() => setUrgenceJours(prev => prev.includes(j) ? prev.filter(d => d !== j) : [...prev, j])}
                            className={`w-11 h-11 rounded-full border-2 text-xs font-semibold flex items-center justify-center transition-all ${
                              urgenceJours.includes(j) ? 'bg-[var(--orange)] border-[var(--orange)] text-white' : 'bg-white border-[var(--gray-200)] text-[var(--gray-500)] hover:border-[var(--orange)] hover:text-[var(--orange)]'
                            }`}
                          >
                            {j}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <hr className="border-t border-[var(--gray-200)] my-8 max-[900px]:my-6" />

              {/* Photo upload */}
              <div className="mb-6">
                <label className="block text-sm font-semibold text-[var(--dark)] mb-2">Photo de profil ou logo <span className="text-[var(--gray-500)] font-normal">(facultatif)</span></label>
                <input ref={fileInputRef} type="file" accept="image/jpeg,image/png" onChange={handleFileSelect} className="hidden" />
                {avatarPreview ? (
                  <div className="flex items-center gap-4">
                    {/* eslint-disable-next-line @next/next/no-img-element -- preview local (data URL) avant upload */}
                    <img src={avatarPreview} alt="Aperçu" className="w-20 h-20 rounded-2xl object-cover border-2 border-[var(--gray-200)]" />
                    <button type="button" onClick={() => { setAvatarFile(null); setAvatarPreview(''); if (fileInputRef.current) fileInputRef.current.value = '' }} className="text-sm text-[var(--red)] font-semibold hover:underline">Supprimer</button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full border-2 border-dashed border-[var(--gray-300)] rounded-[var(--radius)] py-10 text-center cursor-pointer transition-all hover:border-[var(--orange)] hover:bg-[rgba(232,112,10,0.02)] max-[900px]:py-6"
                  >
                    <svg className="w-10 h-10 text-[var(--gray-500)] mx-auto mb-3 max-[900px]:w-8 max-[900px]:h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                    <p className="text-[15px] text-[var(--gray-700)] font-medium mb-1 max-[900px]:text-sm">Cliquez ou glissez un fichier ici</p>
                    <span className="text-[13px] text-[var(--gray-500)]">Format accepté : JPG ou PNG, maximum 5 Mo</span>
                  </button>
                )}
                {fieldError("avatar")}
              </div>

              {/* Actions */}
              <div className="flex justify-between items-center mt-10 pt-6 border-t border-[var(--gray-200)] max-[900px]:flex-col-reverse max-[900px]:gap-3 max-[900px]:mt-8 max-[900px]:pt-5">
                <button onClick={() => goToStep(1)} className="flex items-center gap-2 text-[var(--gray-500)] font-semibold text-[15px] py-3 transition-colors hover:text-[var(--dark)] max-[900px]:text-sm">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
                  Retour
                </button>
                <button onClick={() => goToStep(3)} className="bg-[var(--orange)] text-white py-3.5 px-9 rounded-full font-sora font-bold text-[15px] flex items-center gap-2 transition-all hover:bg-[var(--orange-dark)] hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(232,112,10,0.3)] max-[900px]:w-full max-[900px]:justify-center max-[900px]:min-h-12">
                  Continuer
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                </button>
              </div>
            </div>
          )}

          {/* ===== STEP 3 ===== */}
          {step === 3 && (
            <div className="animate-[fadeIn_0.4s_ease-out]">
              <h2 className="font-sora text-[26px] font-extrabold mb-2 max-[900px]:text-xl max-[500px]:text-lg">
                Horaires d&apos;ouverture <span className="text-[var(--gray-500)] font-normal text-base">(facultatif)</span>
              </h2>
              <p className="text-[15px] text-[var(--gray-500)] mb-8 leading-relaxed max-[900px]:text-sm max-[900px]:mb-6">
                Indiquez les jours et heures où votre entreprise est joignable.
              </p>

              {/* Info box */}
              <div className="bg-[rgba(232,112,10,0.05)] border border-[rgba(232,112,10,0.15)] rounded-[var(--radius-sm)] p-4 flex gap-3 items-start mb-6 max-[900px]:p-3 max-[900px]:gap-2.5">
                <svg className="w-5 h-5 text-[var(--orange)] shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                <p className="text-[13px] leading-relaxed text-[var(--gray-700)] max-[900px]:text-xs">
                  Vos disponibilités précises pour les rendez-vous se gèrent depuis votre agenda dans le tableau de bord, une fois inscrit.
                </p>
              </div>

              {/* Horaires list */}
              <div className="flex flex-col gap-2.5">
                {horaires.map((h, dayIndex) => (
                  <div key={h.jour} className={`border rounded-[var(--radius-sm)] p-4 transition-all max-[900px]:p-3 ${h.ouvert ? 'border-[var(--orange)] bg-[rgba(232,112,10,0.02)]' : 'border-[var(--gray-200)] bg-white'}`}>
                    {/* Day header */}
                    <div className="flex items-center justify-between max-[900px]:flex-wrap max-[900px]:gap-2">
                      <span className="font-semibold text-sm min-w-[100px] text-[var(--dark)] max-[900px]:min-w-20 max-[900px]:text-[13px]">{h.jour}</span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => toggleDay(dayIndex)}
                          className={`w-11 h-6 rounded-xl relative cursor-pointer transition-colors ${h.ouvert ? 'bg-[var(--green)]' : 'bg-[var(--gray-300)]'}`}
                        >
                          <span className={`absolute top-[3px] left-[3px] w-[18px] h-[18px] bg-white rounded-full shadow-sm transition-transform ${h.ouvert ? 'translate-x-5' : ''}`} />
                        </button>
                        <span className="text-[13px] text-[var(--gray-500)] font-medium min-w-[55px]">{h.ouvert ? 'Ouvert' : 'Fermé'}</span>
                      </div>
                    </div>

                    {/* Slots */}
                    {h.ouvert && (
                      <div className="mt-3.5 pt-3.5 border-t border-[var(--gray-200)] flex flex-col gap-2.5">
                        {h.slots.map((slot, slotIndex) => (
                          <div key={slotIndex} className="flex items-center gap-2.5 max-[900px]:gap-2">
                            <div className="flex items-center gap-2 flex-1 max-[900px]:flex-wrap max-[900px]:gap-1.5">
                              <input
                                type="text"
                                value={slot.debut}
                                onChange={e => updateSlot(dayIndex, slotIndex, 'debut', e.target.value)}
                                placeholder="07:30"
                                className="w-[100px] py-2.5 px-3 border-2 border-[var(--gray-200)] rounded-[var(--radius-sm)] text-sm text-center outline-none focus:border-[var(--orange)] focus:shadow-[0_0_0_3px_rgba(232,112,10,0.1)] max-[900px]:w-20 max-[900px]:py-2 max-[900px]:px-2.5 max-[900px]:text-sm max-[500px]:w-[70px] max-[500px]:px-1.5 max-[500px]:text-[13px]"
                              />
                              <span className="text-sm text-[var(--gray-500)] font-medium">à</span>
                              <input
                                type="text"
                                value={slot.fin}
                                onChange={e => updateSlot(dayIndex, slotIndex, 'fin', e.target.value)}
                                placeholder="18:00"
                                className="w-[100px] py-2.5 px-3 border-2 border-[var(--gray-200)] rounded-[var(--radius-sm)] text-sm text-center outline-none focus:border-[var(--orange)] focus:shadow-[0_0_0_3px_rgba(232,112,10,0.1)] max-[900px]:w-20 max-[900px]:py-2 max-[900px]:px-2.5 max-[900px]:text-sm max-[500px]:w-[70px] max-[500px]:px-1.5 max-[500px]:text-[13px]"
                              />
                            </div>
                            {h.slots.length > 1 && (
                              <button type="button" onClick={() => removeSlot(dayIndex, slotIndex)} className="p-1.5 rounded-md text-[var(--gray-500)] hover:text-[var(--red)] hover:bg-[var(--red-light)] transition-all" title="Supprimer ce créneau">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                              </button>
                            )}
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={() => addSlot(dayIndex)}
                          className="border border-dashed border-[var(--gray-300)] text-[var(--gray-500)] py-2.5 px-4 rounded-[var(--radius-sm)] text-[13px] font-semibold cursor-pointer flex items-center gap-2 justify-center w-full mt-2.5 transition-all hover:border-[var(--orange)] hover:text-[var(--orange)] hover:bg-[rgba(232,112,10,0.02)]"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                          Ajouter un créneau
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Actions */}
              <div className="flex justify-between items-center mt-10 pt-6 border-t border-[var(--gray-200)] max-[900px]:flex-col-reverse max-[900px]:gap-3 max-[900px]:mt-8 max-[900px]:pt-5">
                <button onClick={() => goToStep(2)} className="flex items-center gap-2 text-[var(--gray-500)] font-semibold text-[15px] py-3 transition-colors hover:text-[var(--dark)] max-[900px]:text-sm max-[900px]:self-center">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
                  Retour
                </button>
                <div className="flex gap-3 items-center max-[900px]:flex-col max-[900px]:w-full">
                  <button onClick={() => goToStep(4)} className="text-[var(--gray-500)] text-sm font-semibold underline underline-offset-2 py-3.5 px-5 transition-colors hover:text-[var(--dark)] max-[900px]:text-[13px]">
                    Passer cette étape
                  </button>
                  <button onClick={() => goToStep(4)} className="bg-[var(--orange)] text-white py-3.5 px-9 rounded-full font-sora font-bold text-[15px] flex items-center gap-2 transition-all hover:bg-[var(--orange-dark)] hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(232,112,10,0.3)] max-[900px]:w-full max-[900px]:justify-center max-[900px]:min-h-12">
                    Continuer
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ===== STEP 4 ===== */}
          {step === 4 && (
            <div className="animate-[fadeIn_0.4s_ease-out]">
              <h2 className="font-sora text-[26px] font-extrabold mb-2 max-[900px]:text-xl max-[500px]:text-lg">Choisissez votre abonnement</h2>
              <p className="text-[15px] text-[var(--gray-500)] mb-8 leading-relaxed max-[900px]:text-sm max-[900px]:mb-6">
                Les deux formules donnent accès à toutes les fonctionnalités. La seule différence, c&apos;est le prix.
              </p>

              {/* Plan cards */}
              <div className="grid grid-cols-2 gap-4 mb-6 max-[900px]:grid-cols-1 max-[900px]:gap-3">
                {/* Monthly */}
                <button
                  type="button"
                  onClick={() => setPlan('mensuel')}
                  className={`text-left border-2 rounded-[var(--radius)] p-7 cursor-pointer transition-all relative bg-white max-[900px]:p-5 max-[500px]:p-4 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(0,0,0,0.06)] ${
                    plan === 'mensuel' ? 'border-[var(--orange)] shadow-[0_0_0_3px_rgba(232,112,10,0.1)]' : 'border-[var(--gray-200)] hover:border-[var(--gray-300)]'
                  }`}
                >
                  <div className="font-sora text-[32px] font-extrabold text-[var(--dark)] mb-0.5 max-[900px]:text-[26px] max-[500px]:text-[22px]">30 CHF <span className="text-sm font-medium text-[var(--gray-500)]">/ mois</span></div>
                  <div className="text-sm text-[var(--gray-500)] mb-4">Facturation mensuelle</div>
                  <ul className="flex flex-col gap-2">
                    {['Profil professionnel complet', 'Réception de demandes illimitées', 'Avis vérifiés', 'Sans engagement, résiliable à tout moment'].map(f => (
                      <li key={f} className="text-[13px] text-[var(--gray-700)] flex items-center gap-2">
                        <svg className="w-4 h-4 text-[var(--green)] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
                        {f}
                      </li>
                    ))}
                  </ul>
                </button>

                {/* Annual */}
                <button
                  type="button"
                  onClick={() => setPlan('annuel')}
                  className={`text-left border-2 rounded-[var(--radius)] p-7 cursor-pointer transition-all relative bg-white max-[900px]:p-5 max-[500px]:p-4 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(0,0,0,0.06)] ${
                    plan === 'annuel' ? 'border-[var(--orange)] shadow-[0_0_0_3px_rgba(232,112,10,0.1)]' : 'border-[var(--gray-200)] hover:border-[var(--gray-300)]'
                  }`}
                >
                  <div className="absolute -top-3 right-4 bg-[var(--yellow)] text-[var(--dark)] py-1 px-3.5 rounded-full text-[11px] font-extrabold font-sora uppercase tracking-wider">Recommandé</div>
                  <div className="font-sora text-[32px] font-extrabold text-[var(--dark)] mb-0.5 max-[900px]:text-[26px] max-[500px]:text-[22px]">25 CHF <span className="text-sm font-medium text-[var(--gray-500)]">/ mois</span></div>
                  <div className="text-sm text-[var(--gray-500)] mb-4">Facturation annuelle (300 CHF par an)</div>
                  <ul className="flex flex-col gap-2">
                    {['Profil professionnel complet', 'Réception de demandes illimitées', 'Avis vérifiés', 'Sans engagement, résiliable à tout moment'].map(f => (
                      <li key={f} className="text-[13px] text-[var(--gray-700)] flex items-center gap-2">
                        <svg className="w-4 h-4 text-[var(--green)] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
                        {f}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-3 pt-3 border-t border-[var(--gray-200)] text-[13px] font-bold text-[var(--green)]">Vous économisez 60 CHF par an</div>
                </button>
              </div>

              {/* Info box */}
              <div className="bg-[rgba(232,112,10,0.05)] border border-[rgba(232,112,10,0.15)] rounded-[var(--radius-sm)] p-4 flex gap-3 items-start mb-6 max-[900px]:p-3 max-[900px]:gap-2.5">
                <svg className="w-5 h-5 text-[var(--orange)] shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                <p className="text-[13px] leading-relaxed text-[var(--gray-700)] max-[900px]:text-xs">
                  <strong>Bêta gratuite</strong> : aucun paiement ne vous est demandé aujourd&apos;hui.
                  Vous serez prévenu au moins 30 jours avant l&apos;activation de l&apos;abonnement
                  et pourrez résilier à tout moment.
                </p>
              </div>

              <hr className="border-t border-[var(--gray-200)] my-8 max-[900px]:my-6" />

              {/* CGU checkbox */}
              <div className="mb-6">
                <label className="flex items-start gap-2 cursor-pointer">
                  <input type="checkbox" checked={cguAccepted} onChange={e => setCguAccepted(e.target.checked)} className="mt-1 shrink-0" />
                  <span className="text-sm">
                    J&apos;accepte les <Link href="/cgu" target="_blank" className="text-[var(--orange)] font-semibold">conditions générales d&apos;utilisation</Link> et la <Link href="/confidentialite" target="_blank" className="text-[var(--orange)] font-semibold">politique de confidentialité</Link>
                  </span>
                </label>
              </div>

              {/* Signup error */}
              {signupError && (
                <div className="text-[var(--red)] text-sm mb-4">{signupError}</div>
              )}

              {/* Actions */}
              <div className="flex justify-between items-center mt-10 pt-6 border-t border-[var(--gray-200)] max-[900px]:flex-col-reverse max-[900px]:gap-3 max-[900px]:mt-8 max-[900px]:pt-5">
                <button onClick={() => goToStep(3)} className="flex items-center gap-2 text-[var(--gray-500)] font-semibold text-[15px] py-3 transition-colors hover:text-[var(--dark)] max-[900px]:text-sm max-[900px]:self-center">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
                  Retour
                </button>
                <button
                  onClick={handleSignup}
                  disabled={loading}
                  className="bg-[var(--green)] text-white py-4 px-10 rounded-full font-sora font-bold text-base flex items-center gap-2.5 transition-all hover:bg-[#257a2e] hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(46,125,50,0.3)] disabled:opacity-60 disabled:cursor-not-allowed disabled:transform-none max-[900px]:w-full max-[900px]:justify-center max-[900px]:min-h-12 max-[900px]:text-[15px]"
                >
                  {loading ? (
                    'Création en cours...'
                  ) : (
                    <>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
                      Créer mon profil
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
