'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import Logo from '@/components/Logo'
import { createClient } from '@/lib/supabase/client'
import {
  loadArtisanProfile,
  saveArtisanProfile,
  loadMyBankDetails,
  saveMyBankDetails,
  uploadToStorage,
  deleteFromStorage,
  updateAvatarUrl,
  updateGalleryUrls,
  deleteArtisanAccount,
  signOut,
} from '@/lib/supabase/helpers'
import type { Artisan } from '@/lib/supabase/helpers'
import { logger } from '@/lib/logger'
import { compressImage } from '@/lib/image'
import IdeVerification from '@/components/IdeVerification'
import { METIERS_AVEC_AUTRE as METIERS } from '@/lib/metiers'


const JOURS_SEMAINE = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche']
const JOURS_URGENCE = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']

type Horaire = { jour: string; ouvert: boolean; debut: string; fin: string }

const DEFAULT_HORAIRES: Horaire[] = JOURS_SEMAINE.map((j, i) => ({
  jour: j,
  ouvert: i < 5,
  debut: '07:30',
  fin: i < 5 ? '18:00' : '12:00',
}))

export default function MonProfilPage() {
  const router = useRouter()
  const [userId, setUserId] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(false)

  // Form state
  const [prenom, setPrenom] = useState('')
  const [nom, setNom] = useState('')
  const [entreprise, setEntreprise] = useState('')
  const [telephone, setTelephone] = useState('')
  const [email, setEmail] = useState('')
  const [adresse, setAdresse] = useState('')
  const [site, setSite] = useState('')
  const [metier, setMetier] = useState('')
  const [specialites, setSpecialites] = useState<string[]>([])
  const [zones, setZones] = useState<string[]>([])
  const [description, setDescription] = useState('')
  const [horaires, setHoraires] = useState<Horaire[]>(DEFAULT_HORAIRES)
  const [urgence, setUrgence] = useState(false)
  const [urgenceSupplement, setUrgenceSupplement] = useState('')
  const [urgenceRayon, setUrgenceRayon] = useState('')
  const [urgenceHeureDebut, setUrgenceHeureDebut] = useState('07:00')
  const [urgenceHeureFin, setUrgenceHeureFin] = useState('22:00')
  const [urgenceJours, setUrgenceJours] = useState<string[]>(['Lun', 'Mar', 'Mer', 'Jeu', 'Ven'])
  const [contactPrefs, setContactPrefs] = useState({ complete: true, message: false, appel: false })
  const [avatarUrl, setAvatarUrl] = useState('')
  const [galleryUrls, setGalleryUrls] = useState<string[]>([])
  const [bankIban, setBankIban] = useState('')
  const [bankTitulaire, setBankTitulaire] = useState('')
  const [bankAdresse, setBankAdresse] = useState('')
  const [bankBic, setBankBic] = useState('')
  // Vérification IDE-CHE (Zefix). Mis à jour côté serveur via RPC ;
  // on récupère juste les infos en lecture pour afficher l'état.
  const [ideNumber, setIdeNumber] = useState('')
  const [ideVerified, setIdeVerified] = useState(false)
  const [ideCompanyName, setIdeCompanyName] = useState('')

  const [avatarUploading, setAvatarUploading] = useState(false)
  const [galleryUploading, setGalleryUploading] = useState(false)

  const specInputRef = useRef<HTMLInputElement>(null)
  const zoneInputRef = useRef<HTMLInputElement>(null)
  const avatarInputRef = useRef<HTMLInputElement>(null)
  const galleryInputRef = useRef<HTMLInputElement>(null)

  // Auth + load profile
  function populateFromProfile(p: Artisan) {
    setPrenom(p.prenom || '')
    setNom(p.nom || '')
    setEntreprise(p.entreprise || '')
    setTelephone(p.telephone || '')
    setEmail(p.email || '')
    setAdresse(p.adresse || '')
    setSite(p.site || '')
    setMetier(p.metier || '')
    setSpecialites(p.specialites || [])
    setZones(p.zones || [])
    setDescription(p.description || '')
    setHoraires((p.horaires as Horaire[])?.length ? (p.horaires as Horaire[]) : DEFAULT_HORAIRES)
    setUrgence(p.urgence || false)
    setUrgenceSupplement(p.urgence_supplement || '')
    setUrgenceRayon(p.urgence_rayon || '')
    setUrgenceHeureDebut(p.urgence_heure_debut || '07:00')
    setUrgenceHeureFin(p.urgence_heure_fin || '22:00')
    setUrgenceJours(p.urgence_jours?.length ? p.urgence_jours : ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven'])
    setContactPrefs(p.contact_prefs || { complete: true, message: false, appel: false })
    setAvatarUrl(p.avatar_url || '')
    setGalleryUrls(p.gallery_urls || [])
    // Vérification IDE
    setIdeNumber((p as Artisan & { ide_number?: string }).ide_number || '')
    setIdeVerified((p as Artisan & { ide_verified?: boolean }).ide_verified || false)
    setIdeCompanyName((p as Artisan & { ide_company_name?: string }).ide_company_name || '')
    // Note : les champs bank_* ne sont plus dans `p` (révoqués au niveau
    // Postgres). On les charge séparément via loadMyBankDetails().
  }

  // Auth + load profile
  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { router.push('/connexion'); return }
      const uid = session.user.id
      setUserId(uid)

      try {
        const p = await loadArtisanProfile(supabase, uid)
        if (!p) { router.push('/client'); return }
        populateFromProfile(p)

        // Charge les coordonnées bancaires via RPC sécurisée
        try {
          const bank = await loadMyBankDetails(supabase)
          if (bank) {
            setBankIban(bank.bank_iban)
            setBankTitulaire(bank.bank_titulaire)
            setBankAdresse(bank.bank_adresse)
            setBankBic(bank.bank_bic)
          }
        } catch (err) {
          logger.warn('Chargement bank details échoué:', err)
        }
      } catch {
        router.push('/client')
        return
      }
      setLoading(false)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router])

  // Tag helpers
  function addTag(type: 'specialites' | 'zones') {
    const ref = type === 'specialites' ? specInputRef : zoneInputRef
    const val = ref.current?.value.trim()
    if (!val) return
    if (type === 'specialites') {
      if (specialites.includes(val)) { ref.current!.value = ''; return }
      setSpecialites(prev => [...prev, val])
    } else {
      if (zones.includes(val)) { ref.current!.value = ''; return }
      setZones(prev => [...prev, val])
    }
    ref.current!.value = ''
  }

  function removeTag(type: 'specialites' | 'zones', idx: number) {
    if (type === 'specialites') setSpecialites(prev => prev.filter((_, i) => i !== idx))
    else setZones(prev => prev.filter((_, i) => i !== idx))
  }

  // Horaire helpers
  function toggleHoraire(idx: number) {
    setHoraires(prev => prev.map((h, i) => i === idx ? { ...h, ouvert: !h.ouvert } : h))
  }

  function updateHoraireTime(idx: number, field: 'debut' | 'fin', value: string) {
    setHoraires(prev => prev.map((h, i) => i === idx ? { ...h, [field]: value } : h))
  }

  // Urgence day toggle
  function toggleUrgDay(day: string) {
    setUrgenceJours(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day])
  }

  // Contact pref toggle
  function toggleContactPref(key: 'complete' | 'message' | 'appel') {
    setContactPrefs(prev => ({ ...prev, [key]: !prev[key] }))
  }

  // Avatar upload — validation magic bytes + strip EXIF via compressImage
  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const rawFile = e.target.files?.[0]
    if (!rawFile || !userId) return

    setAvatarUploading(true)
    try {
      // compressImage valide + nettoie EXIF + compresse en une passe.
      // Lance une erreur si fichier suspect (mauvais magic bytes, > 15 Mo, etc.)
      const file = await compressImage(rawFile, 'avatar')
      const supabase = createClient()
      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
      const url = await uploadToStorage(supabase, userId, `avatar.${ext}`, file)
      await updateAvatarUrl(supabase, userId, url)
      setAvatarUrl(url)
    } catch (err) {
      logger.error('Erreur upload avatar:', err)
      const msg = err instanceof Error ? err.message : 'Erreur lors de l\'upload'
      alert(msg)
    }
    setAvatarUploading(false)
    e.target.value = ''
  }

  // Gallery upload
  async function handleGalleryUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (!files || files.length === 0 || !userId) return

    const remaining = 10 - galleryUrls.length
    const toUpload = Array.from(files).slice(0, remaining)
    if (toUpload.length < files.length) {
      alert(`Vous pouvez encore ajouter ${remaining} photo(s) maximum.`)
    }

    setGalleryUploading(true)
    const supabase = createClient()
    const newUrls = [...galleryUrls]

    for (let i = 0; i < toUpload.length; i++) {
      const rawFile = toUpload[i]
      try {
        // compressImage valide + strip EXIF + compresse
        const file = await compressImage(rawFile, 'gallery')
        const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
        const fileName = `gallery/photo-${Date.now()}-${i}.${ext}`
        const url = await uploadToStorage(supabase, userId, fileName, file)
        newUrls.push(url)
      } catch (err) {
        logger.error('Erreur upload galerie:', err)
        const msg = err instanceof Error ? err.message : 'Erreur upload'
        alert(`${rawFile.name} : ${msg}`)
      }
    }

    try { await updateGalleryUrls(supabase, userId, newUrls) } catch (err) { logger.error(err) }
    setGalleryUrls(newUrls)
    setGalleryUploading(false)
    e.target.value = ''
  }

  // Gallery remove
  async function removeGalleryPhoto(idx: number) {
    if (!confirm('Supprimer cette photo ?')) return
    const url = galleryUrls[idx]
    const supabase = createClient()

    try {
      const parts = url.split('/artisan-media/')
      if (parts[1]) {
        const fullPath = decodeURIComponent(parts[1])
        const userPrefix = `${userId}/`
        const filePath = fullPath.startsWith(userPrefix) ? fullPath.substring(userPrefix.length) : fullPath
        await deleteFromStorage(supabase, userId, filePath)
      }
    } catch (err) { logger.error('Erreur suppression fichier:', err) }

    const newUrls = galleryUrls.filter((_, i) => i !== idx)
    try { await updateGalleryUrls(supabase, userId, newUrls) } catch (err) { logger.error(err) }
    setGalleryUrls(newUrls)
  }

  // Save profile
  const handleSave = useCallback(async () => {
    if (!userId) return
    setSaving(true)

    const supabase = createClient()
    const profileData: Partial<Artisan> = {
      prenom, nom, entreprise, telephone, email, adresse, site,
      metier, specialites, zones, description,
      horaires: horaires as unknown as Record<string, unknown>[],
      urgence,
      urgence_supplement: urgenceSupplement,
      urgence_rayon: urgenceRayon,
      urgence_heure_debut: urgenceHeureDebut,
      urgence_heure_fin: urgenceHeureFin,
      urgence_jours: urgenceJours,
      contact_prefs: contactPrefs,
      avatar_url: avatarUrl,
      gallery_urls: galleryUrls,
      // Pas de bank_* ici : passent par saveMyBankDetails() ci-dessous
    }

    try {
      await saveArtisanProfile(supabase, userId, profileData)
      // Mise à jour des coordonnées bancaires via RPC séparée et sécurisée
      await saveMyBankDetails(supabase, {
        bank_iban: bankIban,
        bank_bic: bankBic,
        bank_titulaire: bankTitulaire,
        bank_adresse: bankAdresse,
      })
      setToast(true)
      setTimeout(() => setToast(false), 3000)
    } catch (err) {
      logger.error('Erreur sauvegarde:', err)
      alert('Erreur lors de la sauvegarde.')
    }

    setSaving(false)
  }, [userId, prenom, nom, entreprise, telephone, email, adresse, site, metier, specialites, zones, description, horaires, urgence, urgenceSupplement, urgenceRayon, urgenceHeureDebut, urgenceHeureFin, urgenceJours, contactPrefs, avatarUrl, galleryUrls, bankIban, bankTitulaire, bankAdresse, bankBic])

  // Delete account
  async function handleDeleteAccount() {
    const step1 = confirm('Voulez-vous vraiment supprimer votre compte artisan ?\n\nCette action est irreversible. Toutes vos donnees seront supprimees :\n- Profil artisan\n- Demandes reçues\n- Avis clients\n- Devis et factures\n- Catalogue de prestations')
    if (!step1) return
    const step2 = confirm('Derniere confirmation : toutes vos donnees seront supprimees DEFINITIVEMENT.\n\nContinuer ?')
    if (!step2) return

    // R5 (audit 22/05/2026) : confirmation explicite par mot de passe
    const password = prompt('Pour confirmer la suppression, entrez votre mot de passe :')
    if (!password) return

    try {
      const supabase = createClient()
      await deleteArtisanAccount(supabase, userId, password)
      router.push('/connexion')
    } catch (err) {
      alert('Erreur lors de la suppression : ' + (err as Error).message)
    }
  }

  // Logout
  const handleLogout = useCallback(async () => {
    const supabase = createClient()
    await signOut(supabase)
    router.push('/connexion')
  }, [router])

  // Display
  const displayName = entreprise || `${prenom} ${nom}`.trim() || ''
  const initials = displayName.split(/[\s&]+/).filter(w => w.length > 0).slice(0, 2).map(w => w[0].toUpperCase()).join('')

  // Lien direct vers une section (/mon-profil#banque) : la page n'existe
  // qu'après le chargement, on fait défiler à ce moment-là.
  useEffect(() => {
    if (loading) return
    const id = window.location.hash.slice(1)
    if (id) document.getElementById(id)?.scrollIntoView({ block: 'start' })
  }, [loading])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--white)]">
        <div className="text-[var(--gray-500)] text-sm">Chargement...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[var(--gray-50)]">
      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 px-10 py-3.5 flex items-center justify-between bg-[rgba(250,250,248,0.92)] backdrop-blur-[20px] border-b border-black/5 max-[600px]:px-4 max-[600px]:py-3">
        <div className="flex items-center gap-8 max-[600px]:gap-1">
          <Link href="/dashboard?tab=profil" aria-label="Retour au tableau de bord" className="hidden max-[600px]:flex w-10 h-10 -ml-2 items-center justify-center rounded-full text-[var(--dark)] hover:bg-[var(--gray-100)]">
            <svg aria-hidden="true" className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
          </Link>
          <span className="max-[600px]:hidden"><Logo /></span>
          <span className="hidden max-[600px]:block font-sora font-extrabold text-[17px] text-[var(--dark)]">Mon profil</span>
          <div className="flex items-center gap-1 max-[600px]:hidden">
            <Link href="/dashboard" className="no-underline text-sm text-[var(--gray-500)] hover:text-[var(--dark)] transition-colors">Tableau de bord</Link>
            <span className="text-[var(--gray-300)] mx-1">·</span>
            <Link href="/mon-profil" className="no-underline text-sm font-semibold text-[var(--dark)]">Mon profil</Link>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-[var(--gray-500)] max-[600px]:hidden">{displayName}</span>
          <div className="relative w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 overflow-hidden" style={{ background: avatarUrl ? undefined : 'linear-gradient(135deg, var(--dark), var(--dark-mid))' }}>
            {avatarUrl ? <Image key={avatarUrl} src={avatarUrl} alt="" fill sizes="36px" className="object-cover" /> : initials}
          </div>
          <button onClick={handleLogout} className="flex items-center gap-1.5 text-sm text-[var(--gray-500)] font-medium hover:text-[var(--dark)] transition-colors" title="Se déconnecter" aria-label="Se déconnecter">
            <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          </button>
        </div>
      </nav>

      <div className="max-w-[800px] mx-auto px-10 pt-[90px] pb-20 max-[900px]:px-4 max-[900px]:pt-[75px] max-[900px]:pb-[100px] max-[500px]:px-3">
        {/* Header */}
        <div className="mb-8">
          <h1 className="font-sora text-[28px] font-extrabold text-[var(--dark)] max-[900px]:text-[22px] max-[500px]:text-xl">Mon profil</h1>
          <p className="text-[14px] text-[var(--gray-500)] mt-1">Modifiez vos informations visibles sur votre page artisan</p>
          {userId && (
            <Link href={`/artisan/${userId}`} className="inline-flex items-center gap-1.5 mt-3 text-[14px] font-semibold text-[var(--orange)] no-underline">
              <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              Voir ma page publique
            </Link>
          )}
        </div>

        {/* PHOTO / AVATAR */}
        <Card id="photo" icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>} title="Photo de profil">
          <div className="flex items-center gap-5 max-[900px]:flex-col max-[900px]:items-start">
            <div className="w-20 h-20 rounded-full bg-[var(--dark)] flex items-center justify-center text-white font-sora font-extrabold text-2xl shrink-0 overflow-hidden relative">
              {avatarUploading ? (
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center rounded-full">
                  <div className="w-6 h-6 border-3 border-white border-t-transparent rounded-full animate-spin" />
                </div>
              ) : avatarUrl ? (
                <Image key={avatarUrl} src={avatarUrl} alt="Photo de profil" fill sizes="80px" className="object-cover" />
              ) : (
                initials || 'A'
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <button onClick={() => avatarInputRef.current?.click()} className="py-2.5 px-5 rounded-full border-2 border-[var(--gray-200)] bg-white text-[13px] font-semibold text-[var(--dark)] cursor-pointer transition-all hover:border-[var(--orange)] hover:text-[var(--orange)]">
                Changer la photo
              </button>
              <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
              <span className="text-xs text-[var(--gray-500)]">JPG ou PNG, max 2 Mo</span>
            </div>
          </div>
        </Card>

        {/* GALERIE */}
        <Card id="galerie" icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>} title="Galerie de réalisations">
          <p className="text-xs text-[var(--gray-500)] mb-2">Montrez vos realisations aux clients potentiels. Max 10 photos, 5 Mo chacune.</p>
          <div className="text-[13px] text-[var(--gray-500)] mb-1">{galleryUrls.length} / 10 photos</div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-3 mt-4 max-[900px]:grid-cols-[repeat(auto-fill,minmax(120px,1fr))] max-[400px]:grid-cols-2 max-[400px]:gap-2">
            {galleryUrls.map((url, i) => (
              <div key={url} className="relative rounded-[var(--radius-sm)] overflow-hidden aspect-square bg-[var(--gray-100)]">
                <Image src={url} alt={`Realisation ${i + 1}`} fill sizes="(max-width: 400px) 50vw, 140px" className="object-cover" />
                <button onClick={() => removeGalleryPhoto(i)} className="absolute top-1.5 right-1.5 w-7 h-7 bg-[rgba(211,47,47,0.9)] text-white border-none rounded-full cursor-pointer text-base flex items-center justify-center shadow-[0_2px_6px_rgba(0,0,0,0.3)] hover:bg-[rgba(211,47,47,1)] hover:scale-110 transition-all z-[2]">
                  &times;
                </button>
              </div>
            ))}
            {galleryUrls.length < 10 && (
              <button
                onClick={() => galleryInputRef.current?.click()}
                className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-[var(--gray-300)] rounded-[var(--radius-sm)] aspect-square cursor-pointer text-[var(--gray-500)] transition-all bg-transparent text-xs font-medium hover:border-[var(--orange)] hover:text-[var(--orange)] hover:bg-[rgba(232,112,10,0.03)]"
              >
                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                {galleryUploading ? 'Upload...' : 'Ajouter'}
              </button>
            )}
          </div>
          <input ref={galleryInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleGalleryUpload} />
        </Card>

        {/* INFORMATIONS ENTREPRISE */}
        <Card id="entreprise" icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>} title="Informations de l'entreprise">
          <div className="grid grid-cols-2 gap-4 mb-4 max-[900px]:grid-cols-1">
            <FormGroup label="Prénom">
              <input type="text" value={prenom} onChange={e => setPrenom(e.target.value)} placeholder="Jean" className="form-input" />
            </FormGroup>
            <FormGroup label="Nom">
              <input type="text" value={nom} onChange={e => setNom(e.target.value)} placeholder="Muller" className="form-input" />
            </FormGroup>
          </div>
          <FormGroup label="Nom de l'entreprise">
            <input type="text" value={entreprise} onChange={e => setEntreprise(e.target.value)} placeholder="Muller & Fils" className="form-input" />
          </FormGroup>
          <div className="grid grid-cols-2 gap-4 mb-4 max-[900px]:grid-cols-1">
            <FormGroup label="Téléphone">
              <input type="tel" value={telephone} onChange={e => setTelephone(e.target.value)} placeholder="021 123 45 67" className="form-input" />
            </FormGroup>
            <FormGroup label="Email professionnel">
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="contact@muller-fils.ch" className="form-input" />
            </FormGroup>
          </div>
          <FormGroup label="Adresse de l'entreprise">
            <input type="text" value={adresse} onChange={e => setAdresse(e.target.value)} placeholder="Rue du Lac 15, 1003 Lausanne" className="form-input" />
          </FormGroup>
          <FormGroup label="Site internet" hint="optionnel">
            <input type="url" value={site} onChange={e => setSite(e.target.value)} placeholder="https://www.muller-fils.ch" className="form-input" />
          </FormGroup>
        </Card>

        {/* ACTIVITE */}
        <Card id="activite" icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/></svg>} title="Activité">
          <FormGroup label="Métier principal">
            <select value={metier} onChange={e => setMetier(e.target.value)} className="form-input appearance-none bg-[url('data:image/svg+xml,%3Csvg%20xmlns=%27http://www.w3.org/2000/svg%27%20width=%2716%27%20height=%2716%27%20viewBox=%270%200%2024%2024%27%20fill=%27none%27%20stroke=%27%238A8680%27%20stroke-width=%272%27%3E%3Cpath%20d=%27M6%209l6%206%206-6%27/%3E%3C/svg%3E')] bg-no-repeat bg-[right_12px_center] pr-9 cursor-pointer">
              <option value="">Selectionnez votre metier</option>
              {METIERS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </FormGroup>
          <FormGroup label="Spécialités">
            <div className="flex flex-wrap gap-2 mb-2">
              {specialites.map((tag, i) => (
                <span key={i} className="inline-flex items-center gap-1.5 py-1.5 px-3.5 bg-[var(--gray-100)] rounded-full text-[13px] font-medium">
                  {tag}
                  <button onClick={() => removeTag('specialites', i)} className="w-4 h-4 rounded-full bg-[var(--gray-300)] text-white border-none cursor-pointer text-[11px] flex items-center justify-center hover:bg-[var(--red)] transition-colors">&times;</button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input ref={specInputRef} type="text" placeholder="Ex: Depannage urgent, Salle de bain..." className="form-input flex-1" onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag('specialites') } }} />
              <button onClick={() => addTag('specialites')} className="py-2.5 px-4.5 rounded-[var(--radius-sm)] border-2 border-[var(--gray-200)] bg-white text-[13px] font-semibold text-[var(--dark)] cursor-pointer transition-all whitespace-nowrap hover:border-[var(--orange)] hover:text-[var(--orange)]">Ajouter</button>
            </div>
          </FormGroup>
          <FormGroup label="Zones d'intervention (communes)">
            <div className="flex flex-wrap gap-2 mb-2">
              {zones.map((tag, i) => (
                <span key={i} className="inline-flex items-center gap-1.5 py-1.5 px-3.5 bg-[var(--gray-100)] rounded-full text-[13px] font-medium">
                  {tag}
                  <button onClick={() => removeTag('zones', i)} className="w-4 h-4 rounded-full bg-[var(--gray-300)] text-white border-none cursor-pointer text-[11px] flex items-center justify-center hover:bg-[var(--red)] transition-colors">&times;</button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input ref={zoneInputRef} type="text" placeholder="Ex: Lausanne, Pully, Morges..." className="form-input flex-1" onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag('zones') } }} />
              <button onClick={() => addTag('zones')} className="py-2.5 px-4.5 rounded-[var(--radius-sm)] border-2 border-[var(--gray-200)] bg-white text-[13px] font-semibold text-[var(--dark)] cursor-pointer transition-all whitespace-nowrap hover:border-[var(--orange)] hover:text-[var(--orange)]">Ajouter</button>
            </div>
          </FormGroup>
          <FormGroup label="Description de votre activité">
            <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Decrivez vos services, votre experience, vos points forts..." className="form-input resize-y min-h-[100px]" />
          </FormGroup>
        </Card>

        {/* HORAIRES */}
        <Card id="horaires" icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>} title="Horaires d'ouverture">
          <div>
            {horaires.map((h, i) => (
              <div key={h.jour} className="flex items-center gap-3 py-3 border-b border-[var(--gray-100)] last:border-b-0 max-[900px]:flex-wrap max-[900px]:gap-2">
                <span className="w-20 text-sm font-semibold shrink-0 max-[900px]:w-[60px]">{h.jour}</span>
                <button
                  type="button"
                  onClick={() => toggleHoraire(i)}
                  className={`w-[42px] h-6 rounded-full relative transition-all duration-300 shrink-0 cursor-pointer border-none ${h.ouvert ? 'bg-[var(--green)]' : 'bg-[var(--gray-300)]'}`}
                >
                  <span className={`absolute top-[2px] w-5 h-5 bg-white rounded-full transition-all duration-300 shadow-[0_1px_3px_rgba(0,0,0,0.15)] ${h.ouvert ? 'left-5' : 'left-[2px]'}`} />
                </button>
                {h.ouvert ? (
                  <div className="flex items-center gap-2 flex-1">
                    <input type="text" value={h.debut} onChange={e => updateHoraireTime(i, 'debut', e.target.value)} className="form-input w-20 text-center text-[13px] py-2 px-2.5 max-[900px]:w-[70px]" />
                    <span className="text-[13px] text-[var(--gray-500)]">a</span>
                    <input type="text" value={h.fin} onChange={e => updateHoraireTime(i, 'fin', e.target.value)} className="form-input w-20 text-center text-[13px] py-2 px-2.5 max-[900px]:w-[70px]" />
                  </div>
                ) : (
                  <span className="text-[13px] text-[var(--gray-500)] italic">Ferme</span>
                )}
              </div>
            ))}
          </div>
        </Card>

        {/* URGENCES */}
        <Card id="urgences" icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>} title="Disponibilité urgences">
          <div className="flex items-center justify-between py-0">
            <div className="flex-1">
              <div className="text-sm font-semibold">Activer les urgences</div>
              <div className="text-xs text-[var(--gray-500)] mt-0.5">Votre profil affichera un badge urgence et les clients pourront vous appeler directement</div>
            </div>
            <button
              type="button"
              onClick={() => setUrgence(!urgence)}
              className={`w-12 h-7 rounded-full relative transition-all duration-300 shrink-0 cursor-pointer border-none ${urgence ? 'bg-[var(--green)]' : 'bg-[var(--gray-300)]'}`}
            >
              <span className={`absolute top-[3px] w-[22px] h-[22px] bg-white rounded-full transition-all duration-300 shadow-[0_1px_4px_rgba(0,0,0,0.15)] ${urgence ? 'left-[23px]' : 'left-[3px]'}`} />
            </button>
          </div>
          <div className={`overflow-hidden transition-all duration-400 ${urgence ? 'max-h-[400px]' : 'max-h-0'}`}>
            <div className="pt-4">
              <div className="grid grid-cols-2 gap-4 mb-4 max-[900px]:grid-cols-1">
                <FormGroup label="Supplément urgence (CHF)">
                  <input type="number" value={urgenceSupplement} onChange={e => setUrgenceSupplement(e.target.value)} placeholder="Ex: 50" className="form-input" />
                  <span className="text-xs text-[var(--gray-500)] mt-1 block">Laissez vide si pas de supplement</span>
                </FormGroup>
                <FormGroup label="Rayon d'intervention (km)">
                  <input type="number" value={urgenceRayon} onChange={e => setUrgenceRayon(e.target.value)} placeholder="Ex: 15" className="form-input" />
                </FormGroup>
              </div>
              <div className="grid grid-cols-2 gap-4 mb-4 max-[900px]:grid-cols-1">
                <FormGroup label="Disponible de">
                  <input type="time" value={urgenceHeureDebut} onChange={e => setUrgenceHeureDebut(e.target.value)} className="form-input" />
                </FormGroup>
                <FormGroup label="Jusqu'à">
                  <input type="time" value={urgenceHeureFin} onChange={e => setUrgenceHeureFin(e.target.value)} className="form-input" />
                </FormGroup>
              </div>
              <FormGroup label="Jours de disponibilité urgence">
                <div className="flex gap-1.5 flex-wrap mt-3">
                  {JOURS_URGENCE.map(day => (
                    <button
                      key={day}
                      type="button"
                      onClick={() => toggleUrgDay(day)}
                      className={`py-2 px-3.5 rounded-full border-2 text-[13px] font-semibold cursor-pointer transition-all ${
                        urgenceJours.includes(day)
                          ? 'bg-[var(--red)] text-white border-[var(--red)]'
                          : 'bg-white text-[var(--dark)] border-[var(--gray-200)]'
                      }`}
                    >
                      {day}
                    </button>
                  ))}
                </div>
              </FormGroup>
            </div>
          </div>
        </Card>

        {/* PREFERENCES DE CONTACT */}
        <Card id="contact" icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z"/></svg>} title="Préférences de contact">
          {[
            { key: 'complete' as const, label: 'Demande complete (formulaire)' },
            { key: 'message' as const, label: 'Message rapide' },
            { key: 'appel' as const, label: 'Appel telephonique direct' },
          ].map(opt => (
            <button
              key={opt.key}
              type="button"
              onClick={() => toggleContactPref(opt.key)}
              className={`flex items-center gap-3 py-3 px-4 border-2 rounded-[var(--radius-sm)] mb-2 cursor-pointer transition-all w-full text-left ${
                contactPrefs[opt.key]
                  ? 'border-[var(--orange)] bg-[rgba(232,112,10,0.03)]'
                  : 'border-[var(--gray-200)] bg-white hover:border-[var(--gray-300)]'
              }`}
            >
              <div className={`w-5 h-5 rounded-[5px] flex items-center justify-center shrink-0 transition-all ${
                contactPrefs[opt.key] ? 'bg-[var(--orange)] border-[var(--orange)]' : 'border-2 border-[var(--gray-300)] bg-transparent'
              }`}>
                {contactPrefs[opt.key] && (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                )}
              </div>
              <span className="text-sm font-medium">{opt.label}</span>
            </button>
          ))}
        </Card>

        {/* VERIFICATION D'IDENTITE (IDE-CHE) */}
        <Card id="verification"
          icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 12l2 2 4-4"/><path d="M21 12c0 4.97-4.03 9-9 9s-9-4.03-9-9 4.03-9 9-9c2.21 0 4.21.81 5.75 2.15"/></svg>}
          title="Vérification d'identité"
        >
          <p className="text-xs text-[var(--gray-500)] mb-3.5">
            Renseignez votre numéro IDE (registre suisse du commerce) pour obtenir le badge
            « Vérifié » sur votre profil public. Vos clients vous feront davantage confiance.
          </p>
          <IdeVerification
            initialIde={ideNumber}
            alreadyVerified={ideVerified}
            alreadyCompanyName={ideCompanyName}
            mode="save"
            onVerified={(r) => {
              if (r.verified && r.ide) {
                setIdeNumber(r.ide)
                setIdeVerified(true)
                if (r.name) setIdeCompanyName(r.name)
              }
            }}
          />
        </Card>

        {/* COORDONNEES BANCAIRES */}
        <Card id="banque" icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>} title="Coordonnées bancaires">
          <p className="text-xs text-[var(--gray-500)] mb-3.5">Ces informations apparaitront sur vos factures et permettront a vos clients de vous payer. Elles ne sont jamais partagees publiquement.</p>
          <FormGroup label="IBAN">
            <input type="text" value={bankIban} onChange={e => setBankIban(e.target.value)} placeholder="CH93 0076 2011 6238 5295 7" className="form-input font-mono tracking-wider" />
          </FormGroup>
          <FormGroup label="Titulaire du compte">
            <input type="text" value={bankTitulaire} onChange={e => setBankTitulaire(e.target.value)} placeholder="Jean Muller / Muller & Fils Sarl" className="form-input" />
          </FormGroup>
          <div className="grid grid-cols-2 gap-4 mb-4 max-[900px]:grid-cols-1">
            <FormGroup label="Adresse du titulaire">
              <input type="text" value={bankAdresse} onChange={e => setBankAdresse(e.target.value)} placeholder="Rue du Lac 15, 1003 Lausanne" className="form-input" />
            </FormGroup>
            <FormGroup label="BIC/SWIFT" hint="optionnel">
              <input type="text" value={bankBic} onChange={e => setBankBic(e.target.value)} placeholder="UBSWCHZH80A" className="form-input" />
            </FormGroup>
          </div>
        </Card>

        {/* ACTIONS BAR */}
        <div className="flex gap-3 justify-end mt-8 max-[900px]:sticky max-[900px]:bottom-0 max-[900px]:z-40 max-[900px]:-mx-4 max-[900px]:px-4 max-[900px]:py-3 max-[900px]:pb-[calc(12px+env(safe-area-inset-bottom))] max-[900px]:bg-[rgba(249,250,251,0.95)] max-[900px]:backdrop-blur-[12px] max-[900px]:border-t max-[900px]:border-[var(--gray-200)] max-[500px]:-mx-3 max-[500px]:px-3">
          <Link href={userId ? `/artisan/${userId}` : '/recherche'} className="no-underline bg-white text-[var(--dark)] py-4 px-8 rounded-full font-sora font-bold text-[15px] border-2 border-[var(--gray-200)] cursor-pointer transition-all inline-flex items-center gap-2 hover:border-[var(--gray-300)] hover:bg-[var(--gray-100)] max-[900px]:hidden">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            Voir mon profil public
          </Link>
          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-[var(--orange)] text-white py-4 px-10 rounded-full font-sora font-bold text-[15px] border-none cursor-pointer transition-all inline-flex items-center gap-2 hover:bg-[var(--orange-dark)] hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(232,112,10,0.3)] disabled:opacity-60 disabled:cursor-not-allowed max-[900px]:w-full max-[900px]:justify-center"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
            {saving ? 'Sauvegarde...' : 'Enregistrer les modifications'}
          </button>
        </div>

        {/* RGPD : EXPORT */}
        <div id="donnees" className="mt-8 p-5 border border-[var(--gray-200)] rounded-[var(--radius)] scroll-mt-[84px]">
          <div className="font-sora text-[15px] font-bold text-[var(--dark)] mb-2">Mes données personnelles</div>
          <p className="text-[13px] text-[var(--gray-500)] leading-relaxed mb-4">
            Conformément au RGPD (art. 15 et 20), téléchargez l&apos;ensemble de vos données stockées sur Artisano au format JSON.
          </p>
          <a
            href="/api/account/export"
            download
            className="inline-block bg-transparent border-2 border-[var(--gray-200)] text-[var(--dark)] py-3 px-6 rounded-full font-sora font-bold text-sm no-underline cursor-pointer transition-all hover:border-[var(--orange)] hover:text-[var(--orange)]"
          >
            Télécharger mes données
          </a>
        </div>

        {/* DANGER ZONE */}
        <div className="mt-8 p-5 border border-[rgba(211,47,47,0.2)] rounded-[var(--radius)] bg-[rgba(211,47,47,0.02)]">
          <div className="font-sora text-[15px] font-bold text-[var(--red)] mb-2">Supprimer mon compte</div>
          <p className="text-[13px] text-[var(--gray-500)] leading-relaxed mb-4">Cette action est irréversible. Toutes vos données seront définitivement supprimées : profil, demandes, avis, devis, factures et catalogue.</p>
          <button
            onClick={handleDeleteAccount}
            className="bg-transparent border-2 border-[var(--red)] text-[var(--red)] py-3 px-6 rounded-full font-sora font-bold text-sm cursor-pointer transition-all hover:bg-[var(--red)] hover:text-white"
          >
            Supprimer mon compte
          </button>
        </div>
      </div>

      {/* TOAST */}
      <div className={`fixed bottom-[30px] left-1/2 -translate-x-1/2 bg-[var(--dark)] text-white py-3.5 px-7 rounded-full font-semibold text-sm flex items-center gap-2.5 shadow-[0_8px_32px_rgba(0,0,0,0.15)] z-[999] transition-transform duration-400 ${toast ? 'translate-y-0' : 'translate-y-20'}`} style={{ transitionTimingFunction: 'cubic-bezier(0.34,1.56,0.64,1)' }}>
        <svg className="w-[18px] h-[18px] text-[var(--green)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
        Profil enregistré
      </div>
    </div>
  )
}

// ===== Sub-components =====

function Card({ id, icon, title, children }: { id?: string; icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div id={id} className="bg-white rounded-[var(--radius)] p-7 border border-[var(--gray-200)] mb-5 scroll-mt-[84px] max-[900px]:p-5">
      <div className="font-sora text-lg font-bold mb-5 flex items-center gap-2.5">
        <span className="w-5 h-5 text-[var(--orange)] shrink-0">{icon}</span>
        {title}
      </div>
      {children}
    </div>
  )
}

function FormGroup({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="mb-4 last:mb-0">
      <label className="block text-[13px] font-semibold text-[var(--dark)] mb-1.5">
        {label}
        {hint && <span className="font-normal text-[var(--gray-500)]"> ({hint})</span>}
      </label>
      {children}
    </div>
  )
}
