'use client'

import { useState, useEffect, useCallback, useMemo, useRef, type ReactNode, type RefObject } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import {
  loadDocuments, saveDocument, deleteDocument,
  loadPrestations, savePrestation, deletePrestation,
  getNextDocNumber, loadMyBankDetails,
} from '@/lib/supabase/helpers'
import type { Document, Prestation, Artisan } from '@/lib/supabase/helpers'
import { printInvoice, type InvoiceData } from '@/lib/invoice-pdf'
import {
  calculerTotaux, totalLigne, formatCHF, formatDateCH, todayISO, addDaysISO,
  etatDocument, etapesDocument, estEnRetard, resumeFacturation, clientsRecents,
  emailValide, GROUPES_DOC, type DevisPrefill, type Remise, type Ton, type GroupeDoc,
} from '@/lib/facturation'
import Dialog from '@/components/ui/Dialog'
import DecimalInput from '@/components/ui/DecimalInput'

// ===== Types =====

type LineItem = {
  id: string
  description: string
  quantite: number
  unite: string
  prix_unitaire: number
}

type EditorForm = {
  client_nom: string
  client_email: string
  client_telephone: string
  client_adresse: string
  notes: string
  date_emission: string
  date_echeance: string
  taux_tva: number
  remise_type: Remise
  remise_valeur: number
  lignes: LineItem[]
}

type BankDetails = { bank_iban: string; bank_bic: string; bank_titulaire: string; bank_adresse: string }

type Toast = { type: 'success' | 'error'; msg: string } | null

type Filtre = 'tout' | 'devis' | 'facture' | 'a_encaisser'

type Props = {
  userId: string
  profile: Artisan | null
  /** Devis à créer depuis une demande (onglet Demandes → « Faire un devis ») */
  prefill?: DevisPrefill | null
  onPrefillConsumed?: () => void
  /** Éditeur ou catalogue ouvert : le tableau de bord masque sa navigation */
  onImmersiveChange?: (on: boolean) => void
}

// ===== Constantes =====

const UNITES = [
  { value: 'heure', label: 'heure' },
  { value: 'forfait', label: 'forfait' },
  { value: 'm2', label: 'm²' },
  { value: 'ml', label: 'ml' },
  { value: 'unite', label: 'unité' },
  { value: 'lot', label: 'lot' },
]
const uniteLabel = (u: string) => UNITES.find(x => x.value === u)?.label || u

// Taux suisses en vigueur depuis 2024 ; un ancien document à 7.7 % garde son taux.
const TVA_RATES = [
  { value: 0, label: 'Sans TVA' },
  { value: 2.6, label: '2.6 %' },
  { value: 8.1, label: '8.1 %' },
]

const TON_CLASSES: Record<Ton, string> = {
  neutre: 'bg-[var(--gray-100)] text-[var(--gray-700)]',
  info: 'bg-[var(--blue-light)] text-[var(--blue)]',
  succes: 'bg-[var(--green-light)] text-[var(--green)]',
  alerte: 'bg-[var(--red-light)] text-[var(--red)]',
  action: 'bg-[rgba(232,112,10,0.12)] text-[var(--orange-dark)]',
}

// Classes composées sans doublon de propriété : avec Tailwind, deux classes
// qui règlent la même propriété (bg-…, h-…) ne se surchargent pas dans l'ordre écrit.
const INPUT_CORE = 'w-full border bg-white text-base text-[var(--dark)] outline-none transition-shadow focus:border-[var(--orange)] focus:shadow-[0_0_0_4px_rgba(232,112,10,0.1)] placeholder:text-[var(--gray-500)]'
function inputCls({ h = 'h-12', px = 'px-3.5', rounded = 'rounded-xl', invalid = false, extra = '' } = {}): string {
  return `${INPUT_CORE} ${h} ${px} ${rounded} ${invalid ? 'border-[var(--red)]' : 'border-[var(--gray-200)]'} ${extra}`
}
const INPUT = inputCls()
const LABEL = 'block text-[13px] font-semibold text-[var(--gray-700)] mb-1.5'
const CARD = 'bg-white rounded-[20px] border border-[var(--gray-200)] p-5 max-[600px]:p-4'
const BTN_SIZES = { md: 'h-12 px-5 text-[15px]', tight: 'h-12 px-3 text-[15px]', sm: 'h-10 px-4 text-sm' }
const BTN_VARIANTS = {
  primary: 'font-bold bg-[var(--orange)] text-white hover:bg-[var(--orange-dark)]',
  success: 'font-bold bg-[var(--green)] text-white hover:bg-[#1B5E20]',
  danger: 'font-bold bg-[var(--red)] text-white hover:bg-[#B71C1C]',
  secondary: 'font-semibold bg-[var(--gray-100)] text-[var(--dark)] hover:bg-[var(--gray-200)]',
  dangerSoft: 'font-semibold bg-[var(--gray-100)] text-[var(--red)] hover:bg-[var(--red-light)]',
}
function btn(variant: keyof typeof BTN_VARIANTS = 'primary', size: keyof typeof BTN_SIZES = 'md'): string {
  return `inline-flex items-center justify-center gap-2 rounded-full border-none cursor-pointer transition-colors disabled:opacity-60 ${BTN_SIZES[size]} ${BTN_VARIANTS[variant]}`
}
const BTN_PRIMARY = btn('primary')
const BTN_SECONDARY = btn('secondary')
const ICON_BTN = 'w-11 h-11 shrink-0 rounded-full flex items-center justify-center bg-transparent border-none cursor-pointer transition-colors hover:bg-[var(--gray-100)]'
// Barre de titre des sous-écrans : collée en haut sur mobile, simple en-tête sur ordinateur
const SUBBAR = 'sticky top-0 z-40 -mx-4 px-2 py-2 mb-3 flex items-center gap-1 bg-[rgba(249,250,251,0.94)] backdrop-blur-[16px] border-b border-[var(--gray-200)] min-[600px]:-mx-5 min-[600px]:px-3 min-[900px]:static min-[900px]:mx-0 min-[900px]:px-0 min-[900px]:border-0 min-[900px]:bg-transparent min-[900px]:backdrop-blur-none'

// ===== Helpers =====

function generateLineId(): string {
  return 'l_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6)
}

function lineFromRaw(raw: Record<string, unknown>): LineItem {
  return {
    id: (raw.id as string) || generateLineId(),
    description: (raw.description as string) || '',
    quantite: Number(raw.quantite) || 0,
    unite: (raw.unite as string) || 'heure',
    prix_unitaire: Number(raw.prix_unitaire) || 0,
  }
}

function formFromDoc(doc: Document): EditorForm {
  return {
    client_nom: doc.client_nom || '',
    client_email: doc.client_email || '',
    client_telephone: doc.client_telephone || '',
    client_adresse: doc.client_adresse || '',
    notes: doc.notes || '',
    date_emission: doc.date_emission || todayISO(),
    date_echeance: doc.date_echeance || '',
    taux_tva: doc.taux_tva ?? 8.1,
    remise_type: (doc.remise_type as Remise) || 'aucune',
    remise_valeur: doc.remise_valeur || 0,
    lignes: (Array.isArray(doc.lignes) ? doc.lignes : []).map(lineFromRaw),
  }
}

function errMsg(e: unknown): string {
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message)
  return ''
}

function initiales(nom: string): string {
  return nom.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]!.toUpperCase()).join('') || '?'
}

// ===== URL : ?tab=facturation&doc=<id> ou &catalogue=1 =====
// Chaque sous-écran ajoute une entrée d'historique : le bouton « retour »
// du téléphone ramène à la liste au lieu de quitter le tableau de bord.

function viewUrl(param: 'doc' | 'catalogue' | null, value = ''): string {
  const url = new URL(window.location.href)
  url.searchParams.set('tab', 'facturation')
  url.searchParams.delete('doc')
  url.searchParams.delete('catalogue')
  if (param) url.searchParams.set(param, value)
  return url.pathname + url.search
}

function enterView(pushedRef: RefObject<boolean>, param: 'doc' | 'catalogue', value: string) {
  if (pushedRef.current) {
    window.history.replaceState(window.history.state, '', viewUrl(param, value))
  } else {
    window.history.pushState(window.history.state, '', viewUrl(param, value))
    pushedRef.current = true
  }
}

// ===== Icônes =====

function Ico({ children, className = 'w-5 h-5' }: { children: ReactNode; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  )
}
const IconPlus = ({ className }: { className?: string }) => <Ico className={className}><path d="M12 5v14M5 12h14" /></Ico>
const IconBack = () => <Ico className="w-6 h-6"><polyline points="15 18 9 12 15 6" /></Ico>
const IconDots = () => <Ico><circle cx="12" cy="5" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="12" cy="19" r="1" /></Ico>
const IconEye = () => <Ico><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></Ico>
const IconTrash = ({ className }: { className?: string }) => <Ico className={className}><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></Ico>
const IconDoc = ({ className }: { className?: string }) => <Ico className={className}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="8" y1="13" x2="16" y2="13" /><line x1="8" y1="17" x2="13" y2="17" /></Ico>
const IconInvoice = ({ className }: { className?: string }) => <Ico className={className}><path d="M4 2v20l3-2 3 2 3-2 3 2 3-2 1 .7V2l-1 .7-3-2-3 2-3-2-3 2-3-2z" /><path d="M9 8h6M9 12h6M9 16h3" /></Ico>
const IconBook = ({ className }: { className?: string }) => <Ico className={className}><path d="M4 19.5A2.5 2.5 0 016.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" /></Ico>
const IconDownload = ({ className }: { className?: string }) => <Ico className={className}><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></Ico>
const IconCopy = ({ className }: { className?: string }) => <Ico className={className}><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></Ico>
const IconCheck = ({ className }: { className?: string }) => <Ico className={className}><polyline points="20 6 9 17 4 12" /></Ico>
const IconSearch = ({ className }: { className?: string }) => <Ico className={className}><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></Ico>

function DocTile({ type, className = 'w-11 h-11' }: { type: 'devis' | 'facture'; className?: string }) {
  return (
    <span className={`${className} shrink-0 rounded-2xl flex items-center justify-center ${type === 'devis' ? 'bg-[rgba(232,112,10,0.12)] text-[var(--orange)]' : 'bg-[var(--blue-light)] text-[var(--blue)]'}`}>
      {type === 'devis' ? <IconDoc /> : <IconInvoice />}
    </span>
  )
}

function Segmented<T extends string | number>({ value, options, onChange, label }: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
  label: string
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex gap-1 p-1 rounded-full bg-[var(--gray-100)]">
      {options.map(o => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`flex-1 h-9 px-3 rounded-full text-[13px] font-semibold border-none cursor-pointer whitespace-nowrap transition-all ${value === o.value ? 'bg-white text-[var(--dark)] shadow-[0_1px_3px_rgba(0,0,0,0.1)]' : 'bg-transparent text-[var(--gray-500)]'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

// ===== Composant =====

export default function DashFacturation({ userId, profile, prefill, onPrefillConsumed, onImmersiveChange }: Props) {
  const [viewMode, setViewMode] = useState<'list' | 'editor' | 'catalogue'>('list')
  const [documents, setDocuments] = useState<Document[]>([])
  const [prestations, setPrestations] = useState<Prestation[]>([])
  const [bank, setBank] = useState<BankDetails | null>(null)
  const [filtre, setFiltre] = useState<Filtre>('tout')
  const [search, setSearch] = useState('')
  const [showAllClos, setShowAllClos] = useState(false)
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState<Toast>(null)

  // Éditeur
  const [editingDoc, setEditingDoc] = useState<Document | null>(null)
  const [form, setForm] = useState<EditorForm | null>(null)
  const [savedSnapshot, setSavedSnapshot] = useState('')
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const [notesOpen, setNotesOpen] = useState(false)
  const [flashLine, setFlashLine] = useState<string | null>(null)
  const [triedSave, setTriedSave] = useState(false)

  // Catalogue
  const [catForm, setCatForm] = useState<{ id: string | null; nom: string; prix: number; unite: string; description: string } | null>(null)
  const [catConfirmDelete, setCatConfirmDelete] = useState(false)

  // Fenêtres
  const [showCreate, setShowCreate] = useState(false)
  const [menuDoc, setMenuDoc] = useState<Document | null>(null)
  const [showPreview, setShowPreview] = useState(false)
  const [showPicker, setShowPicker] = useState(false)
  const [pickerAdded, setPickerAdded] = useState<Record<string, number>>({})
  const [deleteTarget, setDeleteTarget] = useState<Document | null>(null)
  const [leaveAsk, setLeaveAsk] = useState(false)

  // Historique du navigateur
  const pushedRef = useRef(false)
  const ignorePopRef = useRef(false)
  const stateRef = useRef({ viewMode: 'list', dirty: false, docId: '' })
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const today = todayISO()

  // ===== Navigation entre les vues =====
  const openEditor = useCallback((doc: Document, initial?: EditorForm) => {
    const base = formFromDoc(doc)
    setEditingDoc(doc)
    setForm(initial ?? base)
    setSavedSnapshot(JSON.stringify(base))
    setSavedAt(null)
    setTriedSave(false)
    setNotesOpen(!!doc.notes)
    setViewMode('editor')
    enterView(pushedRef, 'doc', doc.id || 'nouveau')
    window.scrollTo(0, 0)
  }, [])

  /** Revient à la liste sans confirmation. */
  const backToList = useCallback(() => {
    setViewMode('list')
    setEditingDoc(null)
    setForm(null)
    setSavedSnapshot('')
    setShowPreview(false)
    setShowPicker(false)
    setLeaveAsk(false)
    setCatForm(null)
    if (pushedRef.current) {
      pushedRef.current = false
      ignorePopRef.current = true
      window.history.back()
    } else {
      window.history.replaceState(window.history.state, '', viewUrl(null))
    }
    window.scrollTo(0, 0)
  }, [])

  // ===== Chargement =====
  useEffect(() => {
    const supabase = createClient()
    Promise.all([
      loadDocuments(supabase, userId),
      loadPrestations(supabase, userId),
      loadMyBankDetails(supabase).catch(() => null),
    ]).then(([docs, prests, bankDetails]) => {
      setDocuments(docs)
      setPrestations(prests)
      setBank(bankDetails)
      setLoading(false)
      // Lien direct ?doc=<id> (page rechargée, lien partagé)
      const id = new URLSearchParams(window.location.search).get('doc')
      const found = id && docs.find(d => d.id === id)
      if (found) openEditor(found)
      else if (id) window.history.replaceState(window.history.state, '', viewUrl(null))
    }).catch(() => setLoading(false))
  }, [userId, openEditor])

  // ===== Toast =====
  const showToast = useCallback((type: 'success' | 'error', msg: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast({ type, msg })
    toastTimer.current = setTimeout(() => setToast(null), 2600)
  }, [])

  // ===== Calculs =====
  const totaux = useMemo(
    () => form ? calculerTotaux(form.lignes, form.remise_type, form.remise_valeur, form.taux_tva) : null,
    [form],
  )
  const snapshot = useMemo(() => form ? JSON.stringify(form) : '', [form])
  const dirty = viewMode === 'editor' && !!form && snapshot !== savedSnapshot

  useEffect(() => {
    stateRef.current = { viewMode, dirty, docId: editingDoc?.id || 'nouveau' }
  })

  // Bouton « retour » du téléphone ou du navigateur
  useEffect(() => {
    function onPop() {
      if (ignorePopRef.current) { ignorePopRef.current = false; return }
      const params = new URLSearchParams(window.location.search)
      const { viewMode: vm, dirty: d, docId } = stateRef.current
      if (vm === 'list' || params.get('doc') || params.get('catalogue')) return
      pushedRef.current = false
      if (vm === 'editor' && d) {
        // On reste sur l'éditeur et on demande quoi faire des modifications
        enterView(pushedRef, 'doc', docId)
        setLeaveAsk(true)
        return
      }
      setViewMode('list')
      setEditingDoc(null)
      setForm(null)
      setCatForm(null)
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  // Fermeture de l'onglet / rechargement avec des modifications en cours
  useEffect(() => {
    if (!dirty) return
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [dirty])

  // Le tableau de bord masque sa navigation quand un sous-écran est ouvert
  useEffect(() => { onImmersiveChange?.(viewMode !== 'list') }, [viewMode, onImmersiveChange])
  useEffect(() => () => onImmersiveChange?.(false), [onImmersiveChange])

  // ===== Éditeur =====
  const patch = useCallback((p: Partial<EditorForm>) => {
    setForm(f => f ? { ...f, ...p } : f)
  }, [])

  const buildData = useCallback((f: EditorForm, doc: Document, overrides: Partial<Document> = {}): Partial<Document> => {
    const t = calculerTotaux(f.lignes, f.remise_type, f.remise_valeur, f.taux_tva)
    const sansRemise = f.remise_type === 'aucune'
    return {
      ...(doc.id ? { id: doc.id } : {}),
      artisan_id: userId,
      type: doc.type,
      numero: doc.numero,
      client_nom: f.client_nom.trim(),
      // Le schéma refuse une adresse vide : pas d'e-mail = null
      client_email: (f.client_email.trim() || null) as string,
      client_telephone: f.client_telephone.trim(),
      client_adresse: f.client_adresse.trim(),
      lignes: f.lignes.map(l => ({
        id: l.id, description: l.description.trim(), quantite: l.quantite,
        unite: l.unite, prix_unitaire: l.prix_unitaire, total: totalLigne(l.quantite, l.prix_unitaire),
      })),
      sous_total: t.sousTotal,
      taux_tva: f.taux_tva,
      montant_tva: t.montantTva,
      remise_type: sansRemise ? null : f.remise_type,
      remise_valeur: sansRemise ? null : f.remise_valeur,
      montant_remise: sansRemise ? null : t.montantRemise,
      total_ttc: t.totalTtc,
      date_emission: f.date_emission,
      date_echeance: f.date_echeance || null,
      statut: doc.statut || 'brouillon',
      notes: f.notes.trim(),
      devis_source_id: doc.devis_source_id || null,
      ...overrides,
    }
  }, [userId])

  /** Enregistre l'éditeur (éventuellement avec un nouveau statut). */
  const persist = useCallback(async (opts: { overrides?: Partial<Document>; silent?: boolean } = {}): Promise<Document | null> => {
    if (!editingDoc || !form) return null
    if (!form.client_nom.trim()) {
      if (!opts.silent) {
        setTriedSave(true)
        showToast('error', 'Indiquez le nom du client.')
        document.getElementById('fact-client-nom')?.focus()
      }
      return null
    }
    if (form.client_email.trim() && !emailValide(form.client_email)) {
      if (!opts.silent) {
        setTriedSave(true)
        showToast('error', "L'adresse e-mail du client n'est pas valide.")
      }
      return null
    }
    const supabase = createClient()
    const f = form
    setSaving(true)
    try {
      // Nouveau document : numéro recalculé au moment de l'insertion
      // (un autre brouillon a pu prendre le numéro affiché entre-temps).
      const numero = editingDoc.id ? editingDoc.numero : await getNextDocNumber(supabase, userId, editingDoc.type)
      const saved = await saveDocument(supabase, buildData(f, { ...editingDoc, numero }, opts.overrides))
      setEditingDoc(saved)
      setSavedSnapshot(JSON.stringify(f))
      setSavedAt(new Date())
      setDocuments(prev => {
        const idx = prev.findIndex(d => d.id === saved.id)
        if (idx !== -1) { const copy = [...prev]; copy[idx] = saved; return copy }
        return [saved, ...prev]
      })
      if (!editingDoc.id) enterView(pushedRef, 'doc', saved.id)
      return saved
    } catch (e) {
      if (!opts.silent) showToast('error', 'Enregistrement impossible. ' + errMsg(e))
      return null
    } finally {
      setSaving(false)
    }
  }, [editingDoc, form, userId, buildData, showToast])

  // Enregistrement automatique des brouillons, 1,5 s après la dernière modification
  useEffect(() => {
    if (!dirty || saving || !editingDoc?.id || editingDoc.statut !== 'brouillon' || !form?.client_nom.trim()) return
    const t = setTimeout(() => { void persist({ silent: true }) }, 1500)
    return () => clearTimeout(t)
  }, [dirty, saving, snapshot, editingDoc?.id, editingDoc?.statut, form?.client_nom, persist])

  const handleSave = useCallback(async () => {
    const saved = await persist()
    if (saved) showToast('success', saved.type === 'devis' ? 'Devis enregistré' : 'Facture enregistrée')
  }, [persist, showToast])

  const createNew = useCallback(async (type: 'devis' | 'facture', pre?: DevisPrefill | null) => {
    const supabase = createClient()
    try {
      const numero = await getNextDocNumber(supabase, userId, type)
      const t = todayISO()
      const newDoc: Document = {
        id: '', artisan_id: userId, type, numero,
        client_nom: '', client_email: '', client_telephone: '', client_adresse: '',
        lignes: [], sous_total: 0, taux_tva: 8.1, montant_tva: 0,
        remise_type: null, remise_valeur: null, montant_remise: null, total_ttc: 0,
        date_emission: t, date_echeance: type === 'facture' ? addDaysISO(t, 30) : null,
        date_acceptation: null, date_paiement: null,
        statut: 'brouillon', notes: '', devis_source_id: null, created_at: new Date().toISOString(),
      }
      const base = formFromDoc(newDoc)
      const firstLine: LineItem = pre
        ? { id: generateLineId(), description: pre.description.slice(0, 200), quantite: 1, unite: 'forfait', prix_unitaire: 0 }
        : { id: generateLineId(), description: '', quantite: 1, unite: 'heure', prix_unitaire: 0 }
      const initial: EditorForm = pre
        ? { ...base, client_nom: pre.client_nom, client_email: pre.client_email, client_telephone: pre.client_telephone, client_adresse: pre.client_adresse, lignes: [firstLine] }
        : { ...base, lignes: [firstLine] }
      openEditor(newDoc, initial)
      // Un document neuf avec sa ligne vide n'est pas « modifié »
      if (!pre) setSavedSnapshot(JSON.stringify(initial))
    } catch (e) {
      showToast('error', 'Impossible de créer le document. ' + errMsg(e))
    }
  }, [userId, openEditor, showToast])

  // Devis demandé depuis l'onglet Demandes
  useEffect(() => {
    if (!prefill || loading) return
    onPrefillConsumed?.()
    // createNew ne touche à l'état qu'après l'appel réseau (numéro du devis)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void createNew('devis', prefill)
  }, [prefill, loading, onPrefillConsumed, createNew])

  // ===== Lignes =====
  const addLine = useCallback(() => {
    const id = generateLineId()
    setForm(f => f ? { ...f, lignes: [...f.lignes, { id, description: '', quantite: 1, unite: 'heure', prix_unitaire: 0 }] } : f)
    return id
  }, [])

  const updateLine = useCallback((lineId: string, p: Partial<LineItem>) => {
    setForm(f => f ? { ...f, lignes: f.lignes.map(l => l.id === lineId ? { ...l, ...p } : l) } : f)
  }, [])

  const removeLine = useCallback((lineId: string) => {
    setForm(f => f ? { ...f, lignes: f.lignes.filter(l => l.id !== lineId) } : f)
  }, [])

  /** Ajout depuis le catalogue : une 2e pression sur la même prestation augmente la quantité. */
  const addFromCatalogue = useCallback((p: Prestation) => {
    if (!form) return
    const same = form.lignes.find(l => l.description === p.nom && l.unite === p.unite && l.prix_unitaire === p.prix)
    // La ligne vide de départ est remplacée plutôt que gardée
    const blank = form.lignes.length === 1 && !form.lignes[0].description && !form.lignes[0].prix_unitaire
    const line: LineItem = { id: generateLineId(), description: p.nom, quantite: 1, unite: p.unite, prix_unitaire: p.prix }
    const lignes = same
      ? form.lignes.map(l => l.id === same.id ? { ...l, quantite: l.quantite + 1 } : l)
      : blank ? [line] : [...form.lignes, line]
    patch({ lignes })
    setPickerAdded(prev => ({ ...prev, [p.id]: (prev[p.id] || 0) + 1 }))
    setFlashLine(same ? same.id : line.id)
    setTimeout(() => setFlashLine(null), 900)
  }, [form, patch])

  // ===== Statuts =====
  const changeStatus = useCallback(async (statut: string, msg: string) => {
    if (!editingDoc) return
    const overrides: Partial<Document> = { statut }
    if (statut === 'payee') overrides.date_paiement = todayISO()
    if (statut === 'accepte') overrides.date_acceptation = todayISO()
    const saved = await persist({ overrides })
    if (saved) showToast('success', msg)
  }, [editingDoc, persist, showToast])

  const convertToFacture = useCallback(async () => {
    if (!editingDoc?.id || editingDoc.type !== 'devis' || !form) return
    const supabase = createClient()
    try {
      const numero = await getNextDocNumber(supabase, userId, 'facture')
      const t = todayISO()
      const facture = await saveDocument(supabase, buildData(form, {
        ...editingDoc, id: '', type: 'facture', numero, statut: 'brouillon', devis_source_id: editingDoc.id,
      }, { date_emission: t, date_echeance: addDaysISO(t, 30), date_acceptation: null, date_paiement: null }))
      const devis = await saveDocument(supabase, buildData(form, editingDoc, { statut: 'converti' }))
      setDocuments(prev => [facture, ...prev.map(d => d.id === devis.id ? devis : d)])
      showToast('success', `Facture ${numero} créée`)
      openEditor(facture)
    } catch (e) {
      showToast('error', 'Conversion impossible. ' + errMsg(e))
    }
  }, [editingDoc, form, userId, buildData, openEditor, showToast])

  // ===== Actions sur un document =====
  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return
    const target = deleteTarget
    const supabase = createClient()
    try {
      if (target.id) await deleteDocument(supabase, target.id)
      setDocuments(prev => prev.filter(d => d.id !== target.id))
      setDeleteTarget(null)
      showToast('success', target.type === 'devis' ? 'Devis supprimé' : 'Facture supprimée')
      if (viewMode === 'editor') backToList()
    } catch (e) {
      showToast('error', 'Suppression impossible. ' + errMsg(e))
    }
  }, [deleteTarget, viewMode, backToList, showToast])

  const duplicateDoc = useCallback(async (doc: Document) => {
    setMenuDoc(null)
    const supabase = createClient()
    try {
      const numero = await getNextDocNumber(supabase, userId, doc.type)
      const t = todayISO()
      const saved = await saveDocument(supabase, {
        artisan_id: userId, type: doc.type, numero,
        client_nom: doc.client_nom, client_email: (doc.client_email || null) as string,
        client_telephone: doc.client_telephone, client_adresse: doc.client_adresse,
        lignes: doc.lignes, sous_total: doc.sous_total, taux_tva: doc.taux_tva,
        montant_tva: doc.montant_tva, remise_type: doc.remise_type,
        remise_valeur: doc.remise_valeur, montant_remise: doc.montant_remise,
        total_ttc: doc.total_ttc, date_emission: t, date_echeance: doc.type === 'facture' ? addDaysISO(t, 30) : null,
        statut: 'brouillon', notes: doc.notes, devis_source_id: null,
      })
      setDocuments(prev => [saved, ...prev])
      showToast('success', `Copie créée : ${numero}`)
      openEditor(saved)
    } catch (e) {
      showToast('error', 'Duplication impossible. ' + errMsg(e))
    }
  }, [userId, openEditor, showToast])

  // ===== PDF =====
  // Les coordonnées bancaires sont privées (hors profil public) : on les
  // ajoute ici pour que la facture porte l'IBAN et la QR-facture.
  const profileForPdf = useMemo(() => profile ? { ...profile, ...(bank || {}) } as Artisan : null, [profile, bank])

  const printData = useCallback((data: InvoiceData) => {
    printInvoice(data, profileForPdf).catch(() => showToast('error', 'Erreur lors de la génération du PDF.'))
  }, [profileForPdf, showToast])

  const pdfFromDoc = useCallback((doc: Document) => {
    setMenuDoc(null)
    const f = formFromDoc(doc)
    printData({
      type: doc.type, numero: doc.numero, client_nom: doc.client_nom,
      client_email: doc.client_email, client_telephone: doc.client_telephone, client_adresse: doc.client_adresse,
      lignes: f.lignes.map(l => ({ ...l, total: totalLigne(l.quantite, l.prix_unitaire) })),
      sous_total: doc.sous_total, taux_tva: doc.taux_tva, montant_tva: doc.montant_tva,
      montant_remise: doc.montant_remise, total_ttc: doc.total_ttc,
      date_emission: doc.date_emission, date_echeance: doc.date_echeance, notes: doc.notes,
    })
  }, [printData])

  const pdfFromEditor = useCallback(() => {
    if (!editingDoc || !form || !totaux) return
    printData({
      type: editingDoc.type, numero: editingDoc.numero, client_nom: form.client_nom,
      client_email: form.client_email, client_telephone: form.client_telephone, client_adresse: form.client_adresse,
      lignes: form.lignes.map(l => ({ ...l, total: totalLigne(l.quantite, l.prix_unitaire) })),
      sous_total: totaux.sousTotal, taux_tva: form.taux_tva, montant_tva: totaux.montantTva,
      montant_remise: totaux.montantRemise, total_ttc: totaux.totalTtc,
      date_emission: form.date_emission, date_echeance: form.date_echeance || null, notes: form.notes,
    })
  }, [editingDoc, form, totaux, printData])

  // ===== Catalogue =====
  const openCatalogue = useCallback(() => {
    setShowCreate(false)
    setViewMode('catalogue')
    enterView(pushedRef, 'catalogue', '1')
    window.scrollTo(0, 0)
  }, [])

  const saveCatForm = useCallback(async () => {
    if (!catForm) return
    if (!catForm.nom.trim()) { showToast('error', 'Donnez un nom à la prestation.'); return }
    const supabase = createClient()
    try {
      const data: Partial<Prestation> = {
        artisan_id: userId, nom: catForm.nom.trim(), prix: catForm.prix,
        unite: catForm.unite, description: catForm.description.trim(),
        ordre: catForm.id ? (prestations.find(p => p.id === catForm.id)?.ordre ?? 0) : prestations.length,
      }
      if (catForm.id) data.id = catForm.id
      const saved = await savePrestation(supabase, data)
      setPrestations(prev => catForm.id ? prev.map(p => p.id === catForm.id ? saved : p) : [...prev, saved])
      setCatForm(null)
      showToast('success', 'Prestation enregistrée')
    } catch (e) {
      showToast('error', 'Enregistrement impossible. ' + errMsg(e))
    }
  }, [catForm, userId, prestations, showToast])

  const confirmDeletePrest = useCallback(async () => {
    if (!catForm?.id) return
    const id = catForm.id
    const supabase = createClient()
    try {
      await deletePrestation(supabase, id)
      setPrestations(prev => prev.filter(p => p.id !== id))
      setCatForm(null)
      setCatConfirmDelete(false)
      showToast('success', 'Prestation supprimée')
    } catch (e) {
      showToast('error', 'Suppression impossible. ' + errMsg(e))
    }
  }, [catForm, showToast])

  // ===== Liste =====
  const resume = useMemo(() => resumeFacturation(documents, today), [documents, today])
  const recents = useMemo(() => clientsRecents(documents), [documents])
  const counts = useMemo(() => ({
    tout: documents.length,
    devis: documents.filter(d => d.type === 'devis').length,
    facture: documents.filter(d => d.type === 'facture').length,
    a_encaisser: resume.nbAEncaisser,
  }), [documents, resume])

  const groupes = useMemo(() => {
    const q = search.trim().toLowerCase()
    const docs = documents
      .filter(d => filtre === 'tout' || filtre === 'a_encaisser' || d.type === filtre)
      .filter(d => filtre !== 'a_encaisser' || (d.type === 'facture' && (d.statut === 'envoyee' || d.statut === 'en_retard')))
      .filter(d => !q || (d.client_nom || '').toLowerCase().includes(q) || (d.numero || '').toLowerCase().includes(q))
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
    const map: Record<GroupeDoc, Document[]> = { a_traiter: [], brouillons: [], en_attente: [], clotures: [] }
    for (const d of docs) map[etatDocument(d, today).groupe].push(d)
    return { map, total: docs.length }
  }, [documents, filtre, search, today])

  const toastEl = toast && (
    <div
      role="status"
      className={`fixed left-1/2 -translate-x-1/2 z-[300] flex items-center gap-2 py-3 px-5 rounded-full text-sm font-semibold text-white shadow-lg w-max max-w-[calc(100vw-32px)] bottom-[calc(96px+env(safe-area-inset-bottom))] min-[900px]:bottom-6 ${toast.type === 'success' ? 'bg-[var(--dark)]' : 'bg-[var(--red)]'}`}
      style={{ animation: 'fadeIn 0.2s ease-out both' }}
    >
      {toast.type === 'success' ? <IconCheck className="w-4 h-4 shrink-0 text-[#7BE08A]" /> : <Ico className="w-4 h-4 shrink-0"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></Ico>}
      <span>{toast.msg}</span>
    </div>
  )

  const deleteDialog = deleteTarget && (
    <Dialog onClose={() => setDeleteTarget(null)} labelledBy="fact-delete-title" variant="sheet" className="max-w-[420px] p-6">
      <h3 id="fact-delete-title" className="font-sora font-bold text-lg mb-2">
        Supprimer {deleteTarget.type === 'devis' ? 'le devis' : 'la facture'} {deleteTarget.numero} ?
      </h3>
      <p className="text-[15px] text-[var(--gray-500)] mb-6">Cette action est définitive.</p>
      <div className="flex flex-col-reverse gap-2 min-[600px]:flex-row min-[600px]:justify-end">
        <button onClick={() => setDeleteTarget(null)} className={BTN_SECONDARY}>Annuler</button>
        <button onClick={confirmDelete} className={btn('danger')}>Supprimer</button>
      </div>
    </Dialog>
  )

  // ===== Chargement =====
  if (loading) {
    return (
      <div aria-busy="true" aria-label="Chargement de la facturation" className="flex flex-col gap-3">
        <div className="skeleton h-8 w-48" />
        <div className="grid grid-cols-2 gap-3 min-[900px]:grid-cols-3">
          <div className="skeleton h-24 col-span-2 min-[900px]:col-span-1 rounded-[20px]" />
          <div className="skeleton h-24 rounded-[20px]" />
          <div className="skeleton h-24 rounded-[20px]" />
        </div>
        {[0, 1, 2].map(i => <div key={i} className="skeleton h-[72px] rounded-[20px]" />)}
      </div>
    )
  }

  // ===== VUE : ÉDITEUR =====
  if (viewMode === 'editor' && editingDoc && form && totaux) {
    const isDevis = editingDoc.type === 'devis'
    const docCourant = { ...editingDoc, date_echeance: form.date_echeance || null }
    const enRetard = estEnRetard(docCourant, today)
    const etat = editingDoc.id ? etatDocument(docCourant, today) : null
    const etapes = etapesDocument(editingDoc.type, editingDoc.statut, enRetard)
    const factureLiee = isDevis ? documents.find(d => d.devis_source_id === editingDoc.id) : undefined
    const quick = prestations.slice(0, 6)
    const nomManquant = triedSave && !form.client_nom.trim()
    const emailInvalide = triedSave && !!form.client_email.trim() && !emailValide(form.client_email)
    const tvaOptions = TVA_RATES.some(r => r.value === form.taux_tva)
      ? TVA_RATES
      : [...TVA_RATES, { value: form.taux_tva, label: `${form.taux_tva} %` }]
    const saveLabel = saving
      ? 'Enregistrement…'
      : !editingDoc.id
        ? 'Pas encore enregistré'
        : dirty
          ? (editingDoc.statut === 'brouillon' && form.client_nom.trim() ? 'Enregistrement auto…' : 'Modifications non enregistrées')
          : savedAt
            ? `Enregistré à ${String(savedAt.getHours()).padStart(2, '0')}:${String(savedAt.getMinutes()).padStart(2, '0')}`
            : 'Tout est enregistré'
    const requestBack = () => { if (dirty) setLeaveAsk(true); else backToList() }

    // Prochaine étape : une action principale, au plus une secondaire
    let next: { titre: string; texte: string; actions: ReactNode } | null = null
    if (editingDoc.id) {
      const pdfBtn = (
        <button onClick={pdfFromEditor} className={BTN_SECONDARY}>
          <IconDownload className="w-[18px] h-[18px]" /> PDF
        </button>
      )
      const st = editingDoc.statut
      if (st === 'brouillon') {
        next = {
          titre: 'Prêt à envoyer ?',
          texte: `Téléchargez le PDF, envoyez-le à votre client, puis indiquez ${isDevis ? 'que le devis est parti' : 'que la facture est partie'}.`,
          actions: <>{pdfBtn}<button onClick={() => changeStatus(isDevis ? 'envoye' : 'envoyee', isDevis ? 'Devis marqué comme envoyé' : 'Facture marquée comme envoyée')} className={`${BTN_PRIMARY} flex-1`}>{isDevis ? 'Marquer envoyé' : 'Marquer envoyée'}</button></>,
        }
      } else if (isDevis && st === 'envoye') {
        next = {
          titre: 'Le client a répondu ?',
          texte: 'Indiquez sa réponse pour garder votre suivi à jour.',
          actions: <><button onClick={() => changeStatus('refuse', 'Devis marqué comme refusé')} className={BTN_SECONDARY}>Refusé</button><button onClick={() => changeStatus('accepte', 'Bravo, devis accepté !')} className={`${btn('success')} flex-1`}><IconCheck className="w-[18px] h-[18px]" /> Accepté</button></>,
        }
      } else if (isDevis && st === 'accepte') {
        next = {
          titre: 'Devis accepté',
          texte: 'Créez la facture en un geste : client et prestations sont repris.',
          actions: <button onClick={convertToFacture} className={`${BTN_PRIMARY} flex-1`}><IconInvoice className="w-[18px] h-[18px]" /> Créer la facture</button>,
        }
      } else if (isDevis && st === 'converti') {
        next = {
          titre: 'Devis facturé',
          texte: factureLiee ? `Facture ${factureLiee.numero} : ${etatDocument(factureLiee, today).libelle.toLowerCase()}.` : 'La facture a été créée à partir de ce devis.',
          actions: factureLiee ? <button onClick={() => openEditor(factureLiee)} className={`${BTN_SECONDARY} flex-1`}>Voir la facture</button> : null,
        }
      } else if (isDevis && st === 'refuse') {
        next = {
          titre: 'Devis refusé',
          texte: 'Repartez de ce devis pour faire une nouvelle offre.',
          actions: <button onClick={() => duplicateDoc(editingDoc)} className={`${BTN_SECONDARY} flex-1`}><IconCopy className="w-[18px] h-[18px]" /> Dupliquer</button>,
        }
      } else if (!isDevis && (st === 'envoyee' || st === 'en_retard')) {
        next = {
          titre: enRetard ? 'Paiement en retard' : 'En attente du paiement',
          texte: form.date_echeance ? `Échéance le ${formatDateCH(form.date_echeance)}.` : 'Aucune échéance indiquée.',
          actions: <>{enRetard ? pdfBtn : <button onClick={() => changeStatus('en_retard', 'Facture marquée en retard')} className={BTN_SECONDARY}>En retard</button>}<button onClick={() => changeStatus('payee', 'Paiement enregistré')} className={`${btn('success')} flex-1`}><IconCheck className="w-[18px] h-[18px]" /> Payée</button></>,
        }
      } else if (!isDevis && st === 'payee') {
        next = {
          titre: 'Facture payée',
          texte: editingDoc.date_paiement ? `Paiement reçu le ${formatDateCH(editingDoc.date_paiement)}.` : 'Paiement reçu.',
          actions: null,
        }
      }
    }

    return (
      <div className="pb-[calc(104px+env(safe-area-inset-bottom))] min-[900px]:pb-0">
        {/* Barre du haut */}
        <div className={SUBBAR}>
          <button onClick={requestBack} className={`${ICON_BTN} text-[var(--dark)]`} aria-label="Retour à la liste">
            <IconBack />
          </button>
          <div className="flex-1 min-w-0 px-1">
            <div className="flex items-center gap-2 text-xs font-semibold text-[var(--gray-500)]">
              <span className="uppercase tracking-wide">{isDevis ? 'Devis' : 'Facture'}</span>
              {etat && <span className={`py-0.5 px-2 rounded-full text-[11px] font-bold truncate ${TON_CLASSES[etat.ton]}`}>{etat.libelle}</span>}
            </div>
            <h2 className="font-sora font-extrabold text-[17px] text-[var(--dark)] truncate leading-tight">{editingDoc.numero}</h2>
          </div>
          <button onClick={() => setShowPreview(true)} className={`${ICON_BTN} text-[var(--dark)]`} aria-label="Aperçu du document">
            <IconEye />
          </button>
          {editingDoc.id && (
            <button onClick={() => setMenuDoc(editingDoc)} className={`${ICON_BTN} text-[var(--dark)]`} aria-label="Plus d'actions">
              <IconDots />
            </button>
          )}
        </div>

        {/* Frise */}
        <ol aria-label="Avancement" className="flex mb-4">
          {etapes.map((e, i) => (
            <li key={e.label} className="relative flex-1 min-w-0 flex flex-col items-center gap-1" aria-current={e.etat === 'actuel' ? 'step' : undefined}>
              {i > 0 && <span aria-hidden="true" className={`absolute top-3 right-1/2 w-full h-0.5 ${etapes[i - 1].etat === 'fait' ? 'bg-[var(--green)]' : 'bg-[var(--gray-200)]'}`} />}
              <span className={`relative w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold ${
                e.alerte ? 'bg-[var(--red)] text-white'
                  : e.etat === 'fait' ? 'bg-[var(--green)] text-white'
                    : e.etat === 'actuel' ? 'bg-[var(--orange)] text-white ring-4 ring-[rgba(232,112,10,0.18)]'
                      : 'bg-[var(--gray-200)] text-[var(--gray-500)]'}`}>
                {e.etat === 'fait' ? <IconCheck className="w-3.5 h-3.5" /> : i + 1}
              </span>
              <span className={`text-[12px] text-center truncate max-w-full ${e.alerte ? 'font-semibold text-[var(--red)]' : e.etat === 'a_venir' ? 'text-[var(--gray-500)]' : 'font-semibold text-[var(--dark)]'}`}>{e.label}</span>
            </li>
          ))}
        </ol>

        {/* Prochaine étape */}
        {next && (
          <div className="rounded-[20px] p-4 mb-4 bg-[var(--dark)] text-white">
            <div className="font-sora font-bold text-[16px]">{next.titre}</div>
            <p className="text-[14px] text-white/75 mt-0.5">{next.texte}</p>
            {next.actions && <div className="flex gap-2 mt-3 [&>button:not(.flex-1)]:bg-white/15 [&>button:not(.flex-1)]:text-white">{next.actions}</div>}
          </div>
        )}

        <div className="grid gap-4 grid-cols-[1fr_340px] items-start max-[900px]:grid-cols-1">
          <div className="flex flex-col gap-4 min-w-0">
            {/* Client */}
            <section className={CARD} aria-labelledby="fact-client-title">
              <h3 id="fact-client-title" className="font-sora font-bold text-[16px] mb-3">Client</h3>
              {recents.length > 0 && !form.client_nom.trim() && (
                <div className="mb-4">
                  <div className="text-[13px] text-[var(--gray-500)] mb-2">Clients récents</div>
                  <div className="flex gap-2 overflow-x-auto -mx-1 px-1 pb-1 [scrollbar-width:none]">
                    {recents.map(c => (
                      <button
                        key={c.nom}
                        type="button"
                        onClick={() => patch({ client_nom: c.nom, client_email: c.email, client_telephone: c.telephone, client_adresse: c.adresse })}
                        className="flex items-center gap-2 shrink-0 h-10 pl-1 pr-3.5 rounded-full border border-[var(--gray-200)] bg-white text-sm font-semibold text-[var(--dark)] cursor-pointer hover:border-[var(--orange)]"
                      >
                        <span className="w-8 h-8 rounded-full bg-[var(--gray-100)] text-[11px] font-bold flex items-center justify-center">{initiales(c.nom)}</span>
                        {c.nom}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3 max-[600px]:grid-cols-1">
                <div className="col-span-2 max-[600px]:col-span-1">
                  <label htmlFor="fact-client-nom" className={LABEL}>Nom ou entreprise *</label>
                  <input id="fact-client-nom" type="text" value={form.client_nom} onChange={e => patch({ client_nom: e.target.value })}
                    placeholder="Ex. Sophie Martin" autoComplete="off" enterKeyHint="next" aria-invalid={nomManquant || undefined}
                    className={inputCls({ invalid: nomManquant })} />
                  {nomManquant && <p className="text-[13px] text-[var(--red)] mt-1">Le nom du client est nécessaire pour enregistrer.</p>}
                </div>
                <div>
                  <label htmlFor="fact-client-email" className={LABEL}>E-mail</label>
                  <input id="fact-client-email" type="email" inputMode="email" value={form.client_email} onChange={e => patch({ client_email: e.target.value })}
                    placeholder="sophie@exemple.ch" autoComplete="off" aria-invalid={emailInvalide || undefined}
                    className={inputCls({ invalid: emailInvalide })} />
                  {emailInvalide && <p className="text-[13px] text-[var(--red)] mt-1">Adresse e-mail invalide.</p>}
                </div>
                <div>
                  <label htmlFor="fact-client-tel" className={LABEL}>Téléphone</label>
                  <input id="fact-client-tel" type="tel" inputMode="tel" value={form.client_telephone} onChange={e => patch({ client_telephone: e.target.value })}
                    placeholder="079 000 00 00" autoComplete="off" className={INPUT} />
                </div>
                <div className="col-span-2 max-[600px]:col-span-1">
                  <label htmlFor="fact-client-adresse" className={LABEL}>Adresse</label>
                  <textarea id="fact-client-adresse" value={form.client_adresse} onChange={e => patch({ client_adresse: e.target.value })}
                    placeholder={'Rue et numéro\nNPA Localité'} rows={2} className={inputCls({ h: 'h-auto py-3', extra: 'resize-none' })} />
                </div>
              </div>
            </section>

            {/* Dates */}
            <section className={`${CARD} flex flex-col gap-3`} aria-label="Dates">
              <div className="flex items-center justify-between gap-3">
                <label htmlFor="fact-date" className="text-[15px] font-semibold text-[var(--dark)]">{isDevis ? 'Date du devis' : 'Date de la facture'}</label>
                <input id="fact-date" type="date" value={form.date_emission} onChange={e => patch({ date_emission: e.target.value })} className={inputCls({ px: 'px-3', extra: 'max-w-[180px]' })} />
              </div>
              {!isDevis && (
                <>
                  <div className="flex items-center justify-between gap-3">
                    <label htmlFor="fact-echeance" className="text-[15px] font-semibold text-[var(--dark)]">Échéance</label>
                    <input id="fact-echeance" type="date" value={form.date_echeance} onChange={e => patch({ date_echeance: e.target.value })} className={inputCls({ px: 'px-3', extra: 'max-w-[180px]' })} />
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[13px] text-[var(--gray-500)]">Payable sous</span>
                    {[10, 30, 60].map(j => {
                      const val = addDaysISO(form.date_emission || today, j)
                      const on = form.date_echeance === val
                      return (
                        <button key={j} type="button" onClick={() => patch({ date_echeance: val })} aria-pressed={on}
                          className={`h-9 px-3.5 rounded-full text-[13px] font-semibold border cursor-pointer transition-colors ${on ? 'bg-[var(--dark)] border-[var(--dark)] text-white' : 'bg-white border-[var(--gray-200)] text-[var(--dark)] hover:border-[var(--dark)]'}`}>
                          {j} jours
                        </button>
                      )
                    })}
                  </div>
                </>
              )}
            </section>

            {/* Prestations */}
            <section className={CARD} aria-labelledby="fact-lines-title">
              <div className="flex items-center justify-between mb-3">
                <h3 id="fact-lines-title" className="font-sora font-bold text-[16px]">Prestations</h3>
                <span className="text-[13px] text-[var(--gray-500)]">{form.lignes.length} ligne{form.lignes.length > 1 ? 's' : ''}</span>
              </div>

              <ul className="flex flex-col gap-3">
                {form.lignes.map((l, idx) => (
                  <li key={l.id} className={`rounded-2xl border p-3 transition-colors ${flashLine === l.id ? 'border-[var(--orange)] bg-[rgba(232,112,10,0.05)]' : 'border-[var(--gray-200)] bg-[var(--gray-50)]'}`}>
                    <div className="flex items-start gap-2">
                      <label htmlFor={`fact-desc-${l.id}`} className="sr-only">Description de la ligne {idx + 1}</label>
                      <input id={`fact-desc-${l.id}`} type="text" value={l.description} onChange={e => updateLine(l.id, { description: e.target.value })}
                        placeholder="Ex. Remplacement du siphon" autoComplete="off"
                        className={`${INPUT} font-semibold`} />
                      <button type="button" onClick={() => removeLine(l.id)} aria-label={`Supprimer la ligne ${idx + 1}`}
                        className="w-12 h-12 shrink-0 rounded-xl flex items-center justify-center text-[var(--gray-500)] bg-transparent border-none cursor-pointer hover:text-[var(--red)] hover:bg-[var(--red-light)]">
                        <IconTrash className="w-[18px] h-[18px]" />
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2 mt-2 min-[600px]:grid-cols-[150px_1fr_1fr]">
                      <div className="min-w-0">
                        <span className="block text-[12px] font-semibold text-[var(--gray-500)] mb-1" id={`fact-qte-l-${l.id}`}>Quantité</span>
                        <div className="flex items-center h-12 rounded-xl border border-[var(--gray-200)] bg-white overflow-hidden focus-within:border-[var(--orange)]">
                          <button type="button" aria-label="Diminuer la quantité" onClick={() => updateLine(l.id, { quantite: Math.max(0, l.quantite - (l.unite === 'heure' ? 0.5 : 1)) })}
                            className="w-10 h-full shrink-0 text-xl text-[var(--gray-700)] bg-transparent border-none cursor-pointer hover:bg-[var(--gray-100)]">−</button>
                          <DecimalInput value={l.quantite} onValue={n => updateLine(l.id, { quantite: n })} aria-labelledby={`fact-qte-l-${l.id}`}
                            className="w-full min-w-0 h-full text-center text-base font-semibold bg-transparent border-none outline-none" />
                          <button type="button" aria-label="Augmenter la quantité" onClick={() => updateLine(l.id, { quantite: l.quantite + (l.unite === 'heure' ? 0.5 : 1) })}
                            className="w-10 h-full shrink-0 text-xl text-[var(--gray-700)] bg-transparent border-none cursor-pointer hover:bg-[var(--gray-100)]">+</button>
                        </div>
                      </div>
                      <div className="min-w-0">
                        <label htmlFor={`fact-unite-${l.id}`} className="block text-[12px] font-semibold text-[var(--gray-500)] mb-1">Unité</label>
                        <select id={`fact-unite-${l.id}`} value={l.unite} onChange={e => updateLine(l.id, { unite: e.target.value })} className={inputCls({ px: 'px-3' })}>
                          {UNITES.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
                        </select>
                      </div>
                      <div className="col-span-2 min-w-0 min-[600px]:col-span-1">
                        <label htmlFor={`fact-prix-${l.id}`} className="block text-[12px] font-semibold text-[var(--gray-500)] mb-1">Prix par {uniteLabel(l.unite)} (CHF)</label>
                        <DecimalInput id={`fact-prix-${l.id}`} value={l.prix_unitaire} onValue={n => updateLine(l.id, { prix_unitaire: n })}
                          placeholder="0.00" className={`${INPUT} text-right font-semibold`} />
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-2 px-1 text-[13px]">
                      <span className="text-[var(--gray-500)] truncate">{l.quantite} {uniteLabel(l.unite)} × {l.prix_unitaire.toFixed(2)}</span>
                      <span className="font-sora font-bold text-[15px] text-[var(--dark)] shrink-0">{formatCHF(totalLigne(l.quantite, l.prix_unitaire))}</span>
                    </div>
                  </li>
                ))}
              </ul>

              {form.lignes.length === 0 && (
                <p className="text-center text-[14px] text-[var(--gray-500)] py-4">Ajoutez une première prestation.</p>
              )}

              {/* Ajout rapide */}
              {quick.length > 0 && (
                <div className="mt-4">
                  <div className="text-[13px] text-[var(--gray-500)] mb-2">Ajout rapide</div>
                  <div className="flex flex-wrap gap-2">
                    {quick.map(p => (
                      <button key={p.id} type="button" onClick={() => addFromCatalogue(p)}
                        className="flex items-center gap-1.5 h-10 pl-2.5 pr-3.5 max-w-full rounded-full border border-[var(--gray-200)] bg-white text-sm cursor-pointer hover:border-[var(--orange)] active:scale-95 transition-transform">
                        <IconPlus className="w-4 h-4 shrink-0 text-[var(--orange)]" />
                        <span className="font-semibold text-[var(--dark)] truncate">{p.nom}</span>
                        <span className="text-[var(--gray-500)] shrink-0">{Math.round(p.prix)}.–/{uniteLabel(p.unite)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2 mt-4">
                <button type="button" onClick={() => { const id = addLine(); setTimeout(() => document.getElementById(`fact-desc-${id}`)?.focus(), 0) }} className={btn('secondary', 'tight')}>
                  <IconPlus className="w-[18px] h-[18px]" /> Ligne
                </button>
                <button type="button" onClick={() => { setPickerAdded({}); setShowPicker(true) }} className={btn('secondary', 'tight')}>
                  <IconBook className="w-[18px] h-[18px]" /> Catalogue
                </button>
              </div>
            </section>

            {/* Notes */}
            <section className={CARD} aria-label="Notes">
              {notesOpen ? (
                <>
                  <label htmlFor="fact-notes" className="font-sora font-bold text-[16px] block mb-1">Notes et conditions</label>
                  <p className="text-[13px] text-[var(--gray-500)] mb-2">Visibles sur le document.</p>
                  <textarea id="fact-notes" value={form.notes} onChange={e => patch({ notes: e.target.value })} rows={3}
                    placeholder="Ex. Matériel fourni par le client. Devis valable 30 jours."
                    className={inputCls({ h: 'h-auto py-3', extra: 'resize-y' })} />
                </>
              ) : (
                <button type="button" onClick={() => { setNotesOpen(true); setTimeout(() => document.getElementById('fact-notes')?.focus(), 0) }}
                  className="w-full flex items-center gap-2 text-[15px] font-semibold text-[var(--orange)] bg-transparent border-none cursor-pointer p-0">
                  <IconPlus className="w-[18px] h-[18px]" /> Ajouter une note ou des conditions
                </button>
              )}
            </section>
          </div>

          {/* Récapitulatif */}
          <aside className={`${CARD} min-[900px]:sticky min-[900px]:top-[84px]`} aria-labelledby="fact-recap-title">
            <h3 id="fact-recap-title" className="font-sora font-bold text-[16px] mb-3">Récapitulatif</h3>
            <div className="flex justify-between items-center py-2 text-[15px]">
              <span className="text-[var(--gray-500)]">Sous-total</span>
              <span className="font-semibold">{formatCHF(totaux.sousTotal)}</span>
            </div>
            <div className="py-3 border-t border-[var(--gray-100)]">
              <div className="flex justify-between items-center mb-2 text-[15px]">
                <span className="text-[var(--gray-500)]">Remise</span>
                {form.remise_type !== 'aucune' && <span className="font-semibold text-[var(--red)]">−{formatCHF(totaux.montantRemise)}</span>}
              </div>
              <Segmented<Remise> label="Type de remise" value={form.remise_type} onChange={v => patch({ remise_type: v })}
                options={[{ value: 'aucune', label: 'Aucune' }, { value: 'pourcentage', label: '%' }, { value: 'montant', label: 'CHF' }]} />
              {form.remise_type !== 'aucune' && (
                <DecimalInput value={form.remise_valeur} onValue={n => patch({ remise_valeur: n })}
                  aria-label={form.remise_type === 'pourcentage' ? 'Remise en pourcentage' : 'Remise en francs'}
                  placeholder={form.remise_type === 'pourcentage' ? '10' : '50.00'} className={`${INPUT} mt-2 text-right`} />
              )}
            </div>
            <div className="py-3 border-t border-[var(--gray-100)]">
              <div className="flex justify-between items-center mb-2 text-[15px]">
                <span className="text-[var(--gray-500)]">TVA</span>
                <span className="font-semibold">{formatCHF(totaux.montantTva)}</span>
              </div>
              <Segmented<number> label="Taux de TVA" value={form.taux_tva} onChange={v => patch({ taux_tva: v })} options={tvaOptions} />
            </div>
            <div className="flex justify-between items-baseline gap-2 pt-3 border-t-2 border-[var(--dark)]">
              <span className="font-bold text-[16px]">Total TTC</span>
              <span className="font-sora font-extrabold text-[22px]">{formatCHF(totaux.totalTtc)}</span>
            </div>
            {!isDevis && !bank?.bank_iban && (
              <p className="mt-4 p-3 rounded-xl bg-[var(--blue-light)] text-[13px] text-[var(--blue)]">
                Ajoutez votre IBAN dans <Link href="/mon-profil" className="font-semibold underline">Mon profil</Link> : la QR-facture sera jointe au PDF.
              </p>
            )}
            <div className="max-[900px]:hidden mt-5">
              <button onClick={handleSave} disabled={saving} className={`${BTN_PRIMARY} w-full`}>Enregistrer</button>
              <p className="text-center text-[12px] text-[var(--gray-500)] mt-2" aria-live="polite">{saveLabel}</p>
            </div>
          </aside>
        </div>

        {/* Barre du bas (mobile) : total toujours visible + enregistrer */}
        <div className="fixed inset-x-0 bottom-0 z-40 bg-white border-t border-[var(--gray-200)] px-4 pt-3 pb-[calc(12px+env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(0,0,0,0.06)] min-[900px]:hidden">
          <div className="flex items-center gap-3 max-w-[600px] mx-auto">
            <div className="flex-1 min-w-0">
              <div className="text-[12px] text-[var(--gray-500)] truncate" aria-live="polite">{saveLabel}</div>
              <div className="font-sora font-extrabold text-[20px] text-[var(--dark)] leading-tight truncate">{formatCHF(totaux.totalTtc)}</div>
            </div>
            <button onClick={handleSave} disabled={saving} className={BTN_PRIMARY}>
              Enregistrer
            </button>
          </div>
        </div>

        {/* Aperçu */}
        {showPreview && (
          <Dialog onClose={() => setShowPreview(false)} labelledBy="fact-preview-title" variant="sheet" className="max-w-[760px] min-[600px]:max-h-[90vh]">
            <div className="p-7 max-[600px]:p-5">
              <h3 id="fact-preview-title" className="sr-only">Aperçu de {editingDoc.numero}</h3>
              <div className="flex justify-between items-start gap-4 mb-6 max-[600px]:flex-col">
                <div>
                  <div className="font-sora text-lg font-extrabold text-[var(--dark)]">{profile?.entreprise || `${profile?.prenom || ''} ${profile?.nom || ''}`.trim()}</div>
                  {profile?.adresse && <div className="text-sm text-[var(--gray-500)] mt-1">{profile.adresse}</div>}
                  {profile?.telephone && <div className="text-sm text-[var(--gray-500)]">{profile.telephone}</div>}
                  {profile?.email && <div className="text-sm text-[var(--gray-500)]">{profile.email}</div>}
                </div>
                <div className="text-right max-[600px]:text-left">
                  <div className={`inline-block py-1 px-3 rounded-lg text-sm font-bold uppercase ${isDevis ? 'bg-[rgba(232,112,10,0.1)] text-[var(--orange)]' : 'bg-[var(--blue-light)] text-[var(--blue)]'}`}>{isDevis ? 'Devis' : 'Facture'}</div>
                  <div className="font-sora font-bold text-base mt-2">{editingDoc.numero}</div>
                  <div className="text-xs text-[var(--gray-500)] mt-1">Date : {formatDateCH(form.date_emission)}</div>
                  {!isDevis && form.date_echeance && <div className="text-xs text-[var(--gray-500)]">Échéance : {formatDateCH(form.date_echeance)}</div>}
                </div>
              </div>
              <div className="bg-[var(--gray-50)] p-4 rounded-xl mb-5">
                <div className="text-[11px] font-bold uppercase text-[var(--gray-500)] mb-1">Client</div>
                <div className="font-semibold text-sm">{form.client_nom || '—'}</div>
                {form.client_adresse && <div className="text-sm text-[var(--gray-700)] whitespace-pre-line">{form.client_adresse}</div>}
                {form.client_email && <div className="text-sm text-[var(--gray-500)]">{form.client_email}</div>}
                {form.client_telephone && <div className="text-sm text-[var(--gray-500)]">{form.client_telephone}</div>}
              </div>
              <ul className="mb-5 border-t-2 border-[var(--dark)]">
                {form.lignes.map(l => (
                  <li key={l.id} className="flex justify-between gap-4 py-3 border-b border-[var(--gray-100)] text-sm">
                    <div className="min-w-0">
                      <div className="font-semibold text-[var(--dark)] break-words">{l.description || '—'}</div>
                      <div className="text-[var(--gray-500)]">{l.quantite} {uniteLabel(l.unite)} × {l.prix_unitaire.toFixed(2)}</div>
                    </div>
                    <div className="font-semibold shrink-0">{totalLigne(l.quantite, l.prix_unitaire).toFixed(2)}</div>
                  </li>
                ))}
              </ul>
              <div className="ml-auto max-w-[280px]">
                <div className="flex justify-between py-1 text-sm"><span className="text-[var(--gray-500)]">Sous-total</span><span>{formatCHF(totaux.sousTotal)}</span></div>
                {totaux.montantRemise > 0 && <div className="flex justify-between py-1 text-sm"><span className="text-[var(--gray-500)]">Remise</span><span className="text-[var(--red)]">−{formatCHF(totaux.montantRemise)}</span></div>}
                <div className="flex justify-between py-1 text-sm"><span className="text-[var(--gray-500)]">TVA {form.taux_tva} %</span><span>{formatCHF(totaux.montantTva)}</span></div>
                <div className="flex justify-between py-2 mt-1 font-bold border-t-2 border-[var(--dark)]"><span>Total TTC</span><span>{formatCHF(totaux.totalTtc)}</span></div>
              </div>
              {form.notes && (
                <div className="bg-[var(--gray-50)] p-4 rounded-xl text-sm text-[var(--gray-700)] mt-5 whitespace-pre-line">
                  <div className="text-[11px] font-bold uppercase text-[var(--gray-500)] mb-1">Notes</div>
                  {form.notes}
                </div>
              )}
            </div>
            <div className="sticky bottom-0 flex gap-2 p-4 border-t border-[var(--gray-200)] bg-white">
              <button onClick={() => setShowPreview(false)} className={`${BTN_SECONDARY} flex-1 min-[600px]:flex-none`}>Fermer</button>
              <button onClick={pdfFromEditor} className={`${BTN_PRIMARY} flex-1 min-[600px]:flex-none min-[600px]:ml-auto`}><IconDownload className="w-[18px] h-[18px]" /> PDF</button>
            </div>
          </Dialog>
        )}

        {/* Catalogue : choisir des prestations */}
        {showPicker && (
          <Dialog onClose={() => setShowPicker(false)} labelledBy="fact-picker-title" variant="sheet" className="max-w-[520px]">
            <div className="p-5 pb-3">
              <h3 id="fact-picker-title" className="font-sora font-bold text-lg">Ajouter depuis le catalogue</h3>
              <p className="text-sm text-[var(--gray-500)]">Touchez une prestation pour l&apos;ajouter, encore une fois pour augmenter la quantité.</p>
            </div>
            {prestations.length === 0 ? (
              <p className="text-center text-[var(--gray-500)] px-6 py-8 text-sm">
                Votre catalogue est vide. Enregistrez vos prestations courantes (main d&apos;œuvre, déplacement…) depuis <strong>Devis &amp; factures › Catalogue</strong>.
              </p>
            ) : (
              <ul className="px-3">
                {prestations.map(p => {
                  const n = pickerAdded[p.id] || 0
                  return (
                    <li key={p.id}>
                      <button type="button" onClick={() => addFromCatalogue(p)}
                        className={`w-full flex items-center gap-3 p-3 rounded-2xl text-left border-2 bg-transparent cursor-pointer transition-colors ${n ? 'border-[var(--orange)] bg-[rgba(232,112,10,0.05)]' : 'border-transparent hover:bg-[var(--gray-50)]'}`}>
                        <span className={`w-10 h-10 shrink-0 rounded-full flex items-center justify-center ${n ? 'bg-[var(--orange)] text-white' : 'bg-[var(--gray-100)] text-[var(--orange)]'}`}>
                          {n ? <span className="font-bold text-sm">+{n}</span> : <IconPlus className="w-5 h-5" />}
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="block font-semibold text-[15px] text-[var(--dark)] truncate">{p.nom}</span>
                          {p.description && <span className="block text-[13px] text-[var(--gray-500)] truncate">{p.description}</span>}
                        </span>
                        <span className="text-[14px] font-semibold text-[var(--dark)] shrink-0">{formatCHF(p.prix)}<span className="font-normal text-[var(--gray-500)]">/{uniteLabel(p.unite)}</span></span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
            <div className="sticky bottom-0 p-4 bg-white border-t border-[var(--gray-100)] mt-2">
              <button onClick={() => setShowPicker(false)} className={`${BTN_PRIMARY} w-full`}>Terminé</button>
            </div>
          </Dialog>
        )}

        {/* Quitter avec des modifications */}
        {leaveAsk && (
          <Dialog onClose={() => setLeaveAsk(false)} labelledBy="fact-leave-title" variant="sheet" className="max-w-[420px] p-6">
            <h3 id="fact-leave-title" className="font-sora font-bold text-lg mb-2">Enregistrer les modifications ?</h3>
            <p className="text-[15px] text-[var(--gray-500)] mb-6">Vous avez modifié {isDevis ? 'ce devis' : 'cette facture'} sans l&apos;enregistrer.</p>
            <div className="flex flex-col gap-2">
              <button onClick={async () => { setLeaveAsk(false); if (await persist()) backToList() }} className={BTN_PRIMARY}>Enregistrer et quitter</button>
              <button onClick={backToList} className={btn('dangerSoft')}>Quitter sans enregistrer</button>
              <button onClick={() => setLeaveAsk(false)} className="h-11 text-[15px] font-semibold text-[var(--gray-500)] bg-transparent border-none cursor-pointer">Continuer</button>
            </div>
          </Dialog>
        )}

        {menuDoc && <DocMenu doc={menuDoc} onClose={() => setMenuDoc(null)} onPdf={() => { setMenuDoc(null); pdfFromEditor() }} onDuplicate={() => duplicateDoc(menuDoc)} onDelete={() => { setDeleteTarget(menuDoc); setMenuDoc(null) }} />}
        {deleteDialog}
        {toastEl}
      </div>
    )
  }

  // ===== VUE : CATALOGUE =====
  if (viewMode === 'catalogue') {
    return (
      <div className="pb-8">
        <div className={SUBBAR}>
          <button onClick={backToList} className={`${ICON_BTN} text-[var(--dark)]`} aria-label="Retour à la liste">
            <IconBack />
          </button>
          <h2 className="flex-1 font-sora font-extrabold text-[18px] text-[var(--dark)] px-1">Catalogue</h2>
          <button onClick={() => { setCatConfirmDelete(false); setCatForm({ id: null, nom: '', prix: 0, unite: 'heure', description: '' }) }} className={btn('primary', 'sm')}>
            <IconPlus className="w-4 h-4" /> Ajouter
          </button>
        </div>
        <p className="text-[14px] text-[var(--gray-500)] mb-4 px-1">Vos prestations courantes, à ajouter en un geste dans vos devis et factures.</p>

        {prestations.length === 0 ? (
          <div className={`${CARD} text-center py-12`}>
            <span className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-[rgba(232,112,10,0.12)] text-[var(--orange)] flex items-center justify-center"><IconBook className="w-7 h-7" /></span>
            <h3 className="font-sora font-bold text-base mb-1">Catalogue vide</h3>
            <p className="text-sm text-[var(--gray-500)] mb-5">Commencez par votre tarif horaire et vos forfaits.</p>
            <button onClick={() => setCatForm({ id: null, nom: "Main d'œuvre", prix: 0, unite: 'heure', description: '' })} className={BTN_PRIMARY}>Ajouter ma main d&apos;œuvre</button>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {prestations.map(p => (
              <li key={p.id}>
                <button type="button" onClick={() => { setCatConfirmDelete(false); setCatForm({ id: p.id, nom: p.nom, prix: p.prix, unite: p.unite, description: p.description || '' }) }}
                  className="w-full flex items-center gap-3 p-3.5 rounded-[20px] border border-[var(--gray-200)] bg-white text-left cursor-pointer hover:border-[var(--gray-300)]">
                  <span className="w-11 h-11 shrink-0 rounded-2xl bg-[rgba(232,112,10,0.12)] text-[var(--orange)] flex items-center justify-center"><IconBook className="w-5 h-5" /></span>
                  <span className="flex-1 min-w-0">
                    <span className="block font-semibold text-[15px] text-[var(--dark)] truncate">{p.nom}</span>
                    {p.description && <span className="block text-[13px] text-[var(--gray-500)] truncate">{p.description}</span>}
                  </span>
                  <span className="text-right shrink-0">
                    <span className="block font-sora font-bold text-[15px] text-[var(--dark)]">{formatCHF(p.prix)}</span>
                    <span className="block text-[12px] text-[var(--gray-500)]">par {uniteLabel(p.unite)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {catForm && (
          <Dialog onClose={() => setCatForm(null)} labelledBy="cat-form-title" variant="sheet" className="max-w-[480px]">
            <div className="p-5">
              <h3 id="cat-form-title" className="font-sora font-bold text-lg mb-4">{catForm.id ? 'Modifier la prestation' : 'Nouvelle prestation'}</h3>
              <div className="flex flex-col gap-3">
                <div>
                  <label htmlFor="cat-nom" className={LABEL}>Nom *</label>
                  <input id="cat-nom" type="text" value={catForm.nom} onChange={e => setCatForm({ ...catForm, nom: e.target.value })} placeholder="Ex. Main d'œuvre" className={INPUT} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="cat-prix" className={LABEL}>Prix (CHF)</label>
                    <DecimalInput id="cat-prix" value={catForm.prix} onValue={n => setCatForm(c => c ? { ...c, prix: n } : c)} className={`${INPUT} text-right`} />
                  </div>
                  <div>
                    <label htmlFor="cat-unite" className={LABEL}>Par</label>
                    <select id="cat-unite" value={catForm.unite} onChange={e => setCatForm({ ...catForm, unite: e.target.value })} className={inputCls({ px: 'px-3' })}>
                      {UNITES.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label htmlFor="cat-desc" className={LABEL}>Description (facultatif)</label>
                  <input id="cat-desc" type="text" value={catForm.description} onChange={e => setCatForm({ ...catForm, description: e.target.value })} placeholder="Ex. Tarif horaire, déplacement compris" className={INPUT} />
                </div>
              </div>
            </div>
            <div className="sticky bottom-0 bg-white border-t border-[var(--gray-100)] p-4 flex flex-col gap-2">
              <button onClick={saveCatForm} className={BTN_PRIMARY}>Enregistrer</button>
              {catForm.id && !catConfirmDelete && (
                <button onClick={() => setCatConfirmDelete(true)} className={btn('dangerSoft')}>Supprimer</button>
              )}
              {catForm.id && catConfirmDelete && (
                <button onClick={confirmDeletePrest} className={btn('danger')}>Confirmer la suppression</button>
              )}
            </div>
          </Dialog>
        )}
        {toastEl}
      </div>
    )
  }

  // ===== VUE : LISTE =====
  const filtres: { key: Filtre; label: string }[] = [
    { key: 'tout', label: 'Tout' },
    { key: 'devis', label: 'Devis' },
    { key: 'facture', label: 'Factures' },
    { key: 'a_encaisser', label: 'À encaisser' },
  ]
  const moisLabel = new Date().toLocaleDateString('fr-CH', { month: 'long' })

  return (
    <div className="pb-4 max-[900px]:pb-20">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h2 className="font-sora text-[22px] font-extrabold text-[var(--dark)]">Devis &amp; factures</h2>
        <div className="flex gap-2">
          <button onClick={openCatalogue} className={btn('secondary', 'sm')} aria-label="Catalogue de prestations">
            <IconBook className="w-4 h-4" /> Catalogue
          </button>
          <button onClick={() => createNew('facture')} className={`${btn('secondary', 'sm')} max-[900px]:hidden`}>
            <IconPlus className="w-4 h-4" /> Facture
          </button>
          <button onClick={() => createNew('devis')} className={`${btn('primary', 'sm')} max-[900px]:hidden`}>
            <IconPlus className="w-4 h-4" /> Devis
          </button>
        </div>
      </div>

      {documents.length === 0 ? (
        <div className={`${CARD} text-center py-12 px-6`}>
          <span className="w-16 h-16 mx-auto mb-4 rounded-3xl bg-[rgba(232,112,10,0.12)] text-[var(--orange)] flex items-center justify-center"><IconDoc className="w-8 h-8" /></span>
          <h3 className="font-sora font-bold text-lg mb-1">Votre premier devis en 1 minute</h3>
          <p className="text-[15px] text-[var(--gray-500)] mb-6 max-w-[340px] mx-auto">Client, prestations, total : le PDF est prêt à envoyer. Transformez-le ensuite en facture en un geste.</p>
          <div className="flex flex-col gap-2 max-w-[280px] mx-auto">
            <button onClick={() => createNew('devis')} className={BTN_PRIMARY}><IconPlus className="w-[18px] h-[18px]" /> Créer un devis</button>
            <button onClick={() => createNew('facture')} className={BTN_SECONDARY}>Créer une facture</button>
          </div>
        </div>
      ) : (
        <>
          {/* Résumé */}
          <div className="grid grid-cols-2 gap-3 mb-4 min-[900px]:grid-cols-3">
            <button type="button" onClick={() => setFiltre(filtre === 'a_encaisser' ? 'tout' : 'a_encaisser')} aria-pressed={filtre === 'a_encaisser'}
              className="col-span-2 min-[900px]:col-span-1 text-left rounded-[20px] p-4 bg-[var(--dark)] text-white border-none cursor-pointer">
              <div className="text-[13px] text-white/70 font-semibold">À encaisser</div>
              <div className="font-sora font-extrabold text-[26px] leading-tight mt-0.5">{formatCHF(resume.aEncaisser)}</div>
              <div className="text-[13px] text-white/70 mt-1">
                {resume.nbAEncaisser} facture{resume.nbAEncaisser > 1 ? 's' : ''} envoyée{resume.nbAEncaisser > 1 ? 's' : ''}
                {resume.nbEnRetard > 0 && <span className="ml-2 inline-block py-0.5 px-2 rounded-full bg-[var(--red)] text-white text-[12px] font-bold">{resume.nbEnRetard} en retard</span>}
              </div>
            </button>
            <button type="button" onClick={() => setFiltre(filtre === 'devis' ? 'tout' : 'devis')} aria-pressed={filtre === 'devis'}
              className="text-left rounded-[20px] p-4 bg-white border border-[var(--gray-200)] cursor-pointer">
              <div className="text-[13px] text-[var(--gray-500)] font-semibold">Devis en attente</div>
              <div className="font-sora font-extrabold text-[18px] text-[var(--dark)] leading-tight mt-0.5">{formatCHF(resume.devisEnAttente)}</div>
              <div className="text-[12px] text-[var(--gray-500)] mt-1">{resume.nbDevisEnAttente} devis envoyé{resume.nbDevisEnAttente > 1 ? 's' : ''}</div>
            </button>
            <div className="rounded-[20px] p-4 bg-[var(--green-light)]">
              <div className="text-[13px] text-[var(--green)] font-semibold">Encaissé en {moisLabel}</div>
              <div className="font-sora font-extrabold text-[18px] text-[var(--dark)] leading-tight mt-0.5">{formatCHF(resume.encaisseMois)}</div>
              <div className="text-[12px] text-[var(--green)] mt-1">Factures payées</div>
            </div>
          </div>

          {/* Filtres */}
          <div className="flex gap-2 overflow-x-auto -mx-4 px-4 pb-1 mb-3 [scrollbar-width:none] min-[600px]:mx-0 min-[600px]:px-0">
            {filtres.map(f => (
              <button key={f.key} type="button" onClick={() => setFiltre(f.key)} aria-pressed={filtre === f.key}
                className={`shrink-0 h-10 px-4 rounded-full text-sm font-semibold border cursor-pointer transition-colors ${filtre === f.key ? 'bg-[var(--dark)] border-[var(--dark)] text-white' : 'bg-white border-[var(--gray-200)] text-[var(--dark)]'}`}>
                {f.label} <span className={filtre === f.key ? 'text-white/70' : 'text-[var(--gray-500)]'}>{counts[f.key]}</span>
              </button>
            ))}
          </div>
          <div className="relative mb-5">
            <IconSearch className="absolute left-4 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-[var(--gray-500)]" />
            <label htmlFor="fact-search" className="sr-only">Rechercher un client ou un numéro</label>
            <input id="fact-search" type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Client ou numéro…" className={inputCls({ px: 'pl-11 pr-4', rounded: 'rounded-full' })} />
          </div>

          {groupes.total === 0 ? (
            <p className="text-center text-[15px] text-[var(--gray-500)] py-10">Aucun document ne correspond.</p>
          ) : (
            GROUPES_DOC.map(g => {
              const docs = groupes.map[g.key]
              if (docs.length === 0) return null
              const visibles = g.key === 'clotures' && !showAllClos ? docs.slice(0, 6) : docs
              return (
                <section key={g.key} className="mb-5" aria-labelledby={`fact-grp-${g.key}`}>
                  <h3 id={`fact-grp-${g.key}`} className="text-[13px] font-bold uppercase tracking-wider text-[var(--gray-500)] mb-2 px-1">
                    {g.label} <span className="font-semibold">· {docs.length}</span>
                  </h3>
                  <ul className="flex flex-col gap-2">
                    {visibles.map(doc => {
                      const e = etatDocument(doc, today)
                      return (
                        <li key={doc.id} className="flex items-center rounded-[20px] border border-[var(--gray-200)] bg-white transition-shadow hover:shadow-[0_4px_16px_rgba(0,0,0,0.05)]">
                          <button type="button" onClick={() => openEditor(doc)} className="flex-1 min-w-0 flex items-center gap-3 p-3.5 pr-1 text-left bg-transparent border-none cursor-pointer">
                            <DocTile type={doc.type} />
                            <span className="flex-1 min-w-0">
                              <span className="flex items-baseline justify-between gap-2">
                                <span className="font-semibold text-[15px] text-[var(--dark)] truncate">{doc.client_nom || 'Sans client'}</span>
                                <span className="font-sora font-bold text-[15px] text-[var(--dark)] shrink-0">{formatCHF(doc.total_ttc)}</span>
                              </span>
                              <span className="flex items-center justify-between gap-2 mt-1">
                                <span className="text-[13px] text-[var(--gray-500)] truncate">{doc.numero}<span className="max-[600px]:hidden"> · {formatDateCH(doc.date_emission)}</span></span>
                                <span className={`shrink-0 py-0.5 px-2 rounded-full text-[11px] font-bold ${TON_CLASSES[e.ton]}`}>{e.libelle}</span>
                              </span>
                            </span>
                          </button>
                          <button type="button" onClick={() => setMenuDoc(doc)} aria-label={`Actions pour ${doc.numero}`} className={`${ICON_BTN} mr-1 text-[var(--gray-500)]`}>
                            <IconDots />
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                  {g.key === 'clotures' && docs.length > 6 && (
                    <button type="button" onClick={() => setShowAllClos(v => !v)} className="mt-2 w-full h-11 text-sm font-semibold text-[var(--orange)] bg-transparent border-none cursor-pointer">
                      {showAllClos ? 'Afficher moins' : `Afficher les ${docs.length} documents`}
                    </button>
                  )}
                </section>
              )
            })
          )}
        </>
      )}

      {/* Bouton flottant (mobile) */}
      <button type="button" onClick={() => setShowCreate(true)} aria-label="Créer un devis ou une facture"
        className="fixed right-4 z-40 bottom-[calc(84px+env(safe-area-inset-bottom))] w-14 h-14 rounded-full bg-[var(--orange)] text-white border-none cursor-pointer shadow-[0_8px_24px_rgba(232,112,10,0.4)] flex items-center justify-center active:scale-95 transition-transform min-[900px]:hidden">
        <IconPlus className="w-7 h-7" />
      </button>

      {showCreate && (
        <Dialog onClose={() => setShowCreate(false)} labelledBy="fact-create-title" variant="sheet" className="max-w-[440px]">
          <div className="p-5">
            <h3 id="fact-create-title" className="font-sora font-bold text-lg mb-4">Créer</h3>
            <div className="flex flex-col gap-2">
              {([
                { type: 'devis' as const, titre: 'Un devis', texte: 'Proposez un prix à votre client' },
                { type: 'facture' as const, titre: 'Une facture', texte: 'Demandez le paiement, avec QR-facture' },
              ]).map(o => (
                <button key={o.type} type="button" onClick={() => { setShowCreate(false); createNew(o.type) }}
                  className="w-full flex items-center gap-4 p-4 rounded-[20px] border border-[var(--gray-200)] bg-white text-left cursor-pointer hover:border-[var(--orange)]">
                  <DocTile type={o.type} className="w-12 h-12" />
                  <span>
                    <span className="block font-sora font-bold text-[16px] text-[var(--dark)]">{o.titre}</span>
                    <span className="block text-[14px] text-[var(--gray-500)]">{o.texte}</span>
                  </span>
                </button>
              ))}
              <button type="button" onClick={openCatalogue} className="w-full flex items-center gap-4 p-4 rounded-[20px] bg-[var(--gray-50)] border-none text-left cursor-pointer">
                <span className="w-12 h-12 shrink-0 rounded-2xl bg-white text-[var(--gray-700)] flex items-center justify-center"><IconBook /></span>
                <span>
                  <span className="block font-semibold text-[15px] text-[var(--dark)]">Gérer mon catalogue</span>
                  <span className="block text-[14px] text-[var(--gray-500)]">{prestations.length} prestation{prestations.length > 1 ? 's' : ''} enregistrée{prestations.length > 1 ? 's' : ''}</span>
                </span>
              </button>
            </div>
          </div>
        </Dialog>
      )}

      {menuDoc && <DocMenu doc={menuDoc} onClose={() => setMenuDoc(null)} onOpen={() => { const d = menuDoc; setMenuDoc(null); openEditor(d) }} onPdf={() => pdfFromDoc(menuDoc)} onDuplicate={() => duplicateDoc(menuDoc)} onDelete={() => { setDeleteTarget(menuDoc); setMenuDoc(null) }} />}
      {deleteDialog}
      {toastEl}
    </div>
  )
}

// ===== Feuille d'actions d'un document =====

function DocMenu({ doc, onClose, onOpen, onPdf, onDuplicate, onDelete }: {
  doc: Document
  onClose: () => void
  onOpen?: () => void
  onPdf: () => void
  onDuplicate: () => void
  onDelete: () => void
}) {
  const item = 'w-full flex items-center gap-3 h-14 px-4 rounded-2xl text-[16px] font-semibold text-left bg-transparent border-none cursor-pointer hover:bg-[var(--gray-50)]'
  return (
    <Dialog onClose={onClose} labelledBy="fact-menu-title" variant="sheet" className="max-w-[400px]">
      <div className="p-3 pt-4">
        <div className="flex items-center gap-3 px-2 pb-3 mb-1 border-b border-[var(--gray-100)]">
          <DocTile type={doc.type} />
          <div className="min-w-0">
            <h3 id="fact-menu-title" className="font-sora font-bold text-[16px] truncate">{doc.numero}</h3>
            <p className="text-[13px] text-[var(--gray-500)] truncate">{doc.client_nom || 'Sans client'} · {formatCHF(doc.total_ttc)}</p>
          </div>
        </div>
        {onOpen && (
          <button type="button" onClick={onOpen} className={item}>
            <Ico className="w-5 h-5 text-[var(--gray-700)]"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></Ico>
            Ouvrir
          </button>
        )}
        <button type="button" onClick={onPdf} className={item}><IconDownload className="w-5 h-5 text-[var(--gray-700)]" /> Télécharger le PDF</button>
        <button type="button" onClick={onDuplicate} className={item}><IconCopy className="w-5 h-5 text-[var(--gray-700)]" /> Dupliquer</button>
        <button type="button" onClick={onDelete} className={`${item} text-[var(--red)]`}><IconTrash className="w-5 h-5" /> Supprimer</button>
      </div>
    </Dialog>
  )
}
