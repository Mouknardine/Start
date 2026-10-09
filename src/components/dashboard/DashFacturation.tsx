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
import { printInvoice, buildInvoiceHTML, type InvoiceData, type InvoiceLine } from '@/lib/invoice-pdf'
import {
  calculerTotaux, totalLigne, formatCHF, formatDateCH, todayISO, addDaysISO,
  etatDocument, etapesDocument, estEnRetard, resumeFacturation, clientsRecents,
  emailValide, GROUPES_DOC, CATEGORIES, UNITES, uniteCourte, categorieLigne, resumeLigne,
  formatPrixCourt, normaliserReglages, CLE_REGLAGES, REGLAGES_DEFAUT,
  type DevisPrefill, type Remise, type GroupeDoc, type Categorie, type ReglagesFacturation,
} from '@/lib/facturation'
import { loadAgendaKey, saveAgendaKey } from '@/lib/supabase/agenda'
import Dialog from '@/components/ui/Dialog'
import DecimalInput from '@/components/ui/DecimalInput'
import {
  TON_CLASSES, inputCls, INPUT, LABEL, CARD, btn, BTN_PRIMARY, BTN_SECONDARY, ICON_BTN, SUBBAR,
  Ico, IconPlus, IconBack, IconDots, IconEye, IconTrash, IconDoc, IconInvoice, IconBook,
  IconDownload, IconCopy, IconCheck, IconSearch, IconSettings, IconChevron, DocTile, Segmented, CatTile, CatIcon,
} from './facturation/ui'
import { type LineItem, generateLineId, lineFromRaw, lineToRaw, nouvelleLigne } from './facturation/lignes'
import LigneSheet from './facturation/LigneSheet'
import ReglagesSheet from './facturation/ReglagesSheet'
import DocumentPreview from './facturation/DocumentPreview'

// ===== Types =====

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

// Taux suisses en vigueur depuis 2024 ; un ancien document à 7.7 % garde son taux.
const TVA_RATES = [
  { value: 0, label: 'Sans TVA' },
  { value: 2.6, label: '2.6 %' },
  { value: 8.1, label: '8.1 %' },
]

// ===== Helpers =====

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

function toInvoiceLine(l: LineItem): InvoiceLine {
  return {
    description: l.description, quantite: l.quantite, unite: l.unite, prix_unitaire: l.prix_unitaire,
    total: totalLigne(l.quantite, l.prix_unitaire), categorie: l.categorie, heures: l.heures, personnes: l.personnes,
  }
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

  // Saisie d'une ligne, réglages, contexte de la demande d'origine
  const [ligneEdit, setLigneEdit] = useState<{ ligne: LineItem; isNew: boolean } | null>(null)
  const [reglages, setReglages] = useState<ReglagesFacturation>(REGLAGES_DEFAUT)
  const [showReglages, setShowReglages] = useState(false)
  const [contexte, setContexte] = useState<DevisPrefill | null>(null)
  const [previewQr, setPreviewQr] = useState<string | null>(null)

  // Catalogue
  const [catForm, setCatForm] = useState<{ id: string | null; nom: string; prix: number; unite: string; description: string; categorie: Categorie } | null>(null)
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
    setContexte(null)
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
      loadAgendaKey<unknown>(supabase, userId, CLE_REGLAGES, null),
    ]).then(([docs, prests, bankDetails, regl]) => {
      setDocuments(docs)
      setPrestations(prests)
      setBank(bankDetails)
      setReglages(normaliserReglages(regl))
      setLoading(false)
      // Lien direct ?doc=<id> (page rechargée, lien partagé)
      const params = new URLSearchParams(window.location.search)
      const id = params.get('doc')
      const found = id && docs.find(d => d.id === id)
      if (found) openEditor(found)
      else if (params.get('catalogue')) setViewMode('catalogue')
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
      lignes: f.lignes.map(lineToRaw),
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
      const r = reglages
      const newDoc: Document = {
        id: '', artisan_id: userId, type, numero,
        client_nom: '', client_email: '', client_telephone: '', client_adresse: '',
        lignes: [], sous_total: 0, taux_tva: r.assujetti_tva ? r.taux_tva : 0, montant_tva: 0,
        remise_type: null, remise_valeur: null, montant_remise: null, total_ttc: 0,
        date_emission: t, date_echeance: addDaysISO(t, type === 'facture' ? r.delai_paiement : r.validite_devis),
        date_acceptation: null, date_paiement: null,
        statut: 'brouillon', notes: r.conditions, devis_source_id: null, created_at: new Date().toISOString(),
      }
      const base = formFromDoc(newDoc)
      const initial: EditorForm = pre
        ? { ...base, client_nom: pre.client_nom, client_email: pre.client_email, client_telephone: pre.client_telephone, client_adresse: pre.client_adresse }
        : base
      openEditor(newDoc, initial)
      // La demande d'origine reste affichée pendant la rédaction du devis
      if (pre) setContexte(pre)
    } catch (e) {
      showToast('error', 'Impossible de créer le document. ' + errMsg(e))
    }
  }, [userId, reglages, openEditor, showToast])

  // Devis demandé depuis l'onglet Demandes
  useEffect(() => {
    if (!prefill || loading) return
    onPrefillConsumed?.()
    // createNew ne touche à l'état qu'après l'appel réseau (numéro du devis)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void createNew('devis', prefill)
  }, [prefill, loading, onPrefillConsumed, createNew])

  // ===== Lignes =====
  const saveReglages = useCallback(async (p: Partial<ReglagesFacturation>) => {
    const next = { ...reglages, ...p }
    setReglages(next)
    try { await saveAgendaKey(createClient(), userId, CLE_REGLAGES, next) } catch { showToast('error', 'Le tarif n’a pas pu être mémorisé.') }
  }, [reglages, userId, showToast])

  const flash = (id: string) => {
    setFlashLine(id)
    setTimeout(() => setFlashLine(null), 900)
  }

  const saveLigne = useCallback((ligne: LineItem, memoriser: Partial<ReglagesFacturation> | null) => {
    setForm(f => {
      if (!f) return f
      const exists = f.lignes.some(l => l.id === ligne.id)
      return { ...f, lignes: exists ? f.lignes.map(l => l.id === ligne.id ? ligne : l) : [...f.lignes, ligne] }
    })
    setLigneEdit(null)
    flash(ligne.id)
    if (memoriser) void saveReglages(memoriser)
  }, [saveReglages])

  const removeLine = useCallback((lineId: string) => {
    setForm(f => f ? { ...f, lignes: f.lignes.filter(l => l.id !== lineId) } : f)
    setLigneEdit(null)
  }, [])

  /** Ajout depuis le catalogue : une 2e pression sur la même prestation augmente la quantité. */
  const addFromCatalogue = useCallback((p: Prestation) => {
    if (!form) return
    const categorie = categorieLigne({ categorie: p.categorie, unite: p.unite })
    const same = form.lignes.find(l => l.description === p.nom && l.unite === p.unite && l.prix_unitaire === p.prix)
    const line: LineItem = categorie === 'main_oeuvre'
      ? { id: generateLineId(), categorie, description: p.nom, heures: 1, personnes: 1, quantite: 1, unite: 'heure', prix_unitaire: p.prix }
      : { id: generateLineId(), categorie, description: p.nom, quantite: 1, unite: p.unite, prix_unitaire: p.prix }
    const lignes = same
      ? form.lignes.map(l => {
        if (l.id !== same.id) return l
        if (l.categorie === 'main_oeuvre') {
          const heures = (l.heures ?? l.quantite) + 1
          return { ...l, heures, quantite: heures * (l.personnes ?? 1) }
        }
        return { ...l, quantite: l.quantite + 1 }
      })
      : [...form.lignes, line]
    patch({ lignes })
    setPickerAdded(prev => ({ ...prev, [p.id]: (prev[p.id] || 0) + 1 }))
    flash(same ? same.id : line.id)
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
      }, { date_emission: t, date_echeance: addDaysISO(t, reglages.delai_paiement), date_acceptation: null, date_paiement: null }))
      const devis = await saveDocument(supabase, buildData(form, editingDoc, { statut: 'converti' }))
      setDocuments(prev => [facture, ...prev.map(d => d.id === devis.id ? devis : d)])
      showToast('success', `Facture ${numero} créée`)
      openEditor(facture)
    } catch (e) {
      showToast('error', 'Conversion impossible. ' + errMsg(e))
    }
  }, [editingDoc, form, userId, reglages, buildData, openEditor, showToast])

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
        total_ttc: doc.total_ttc, date_emission: t, date_echeance: addDaysISO(t, doc.type === 'facture' ? reglages.delai_paiement : reglages.validite_devis),
        statut: 'brouillon', notes: doc.notes, devis_source_id: null,
      })
      setDocuments(prev => [saved, ...prev])
      showToast('success', `Copie créée : ${numero}`)
      openEditor(saved)
    } catch (e) {
      showToast('error', 'Duplication impossible. ' + errMsg(e))
    }
  }, [userId, reglages, openEditor, showToast])

  // ===== PDF =====
  // Les coordonnées bancaires sont privées (hors profil public) : on les
  // ajoute ici pour que la facture porte l'IBAN et la QR-facture.
  const profileForPdf = useMemo(() => profile ? { ...profile, ...(bank || {}) } as Artisan : null, [profile, bank])

  const pdfOptions = useMemo(() => ({ assujettiTva: reglages.assujetti_tva, numeroTva: reglages.numero_tva }), [reglages])

  const printData = useCallback((data: InvoiceData) => {
    printInvoice(data, profileForPdf, pdfOptions).catch(() => showToast('error', 'Erreur lors de la génération du PDF.'))
  }, [profileForPdf, pdfOptions, showToast])

  const pdfFromDoc = useCallback((doc: Document) => {
    setMenuDoc(null)
    printData({
      type: doc.type, numero: doc.numero, client_nom: doc.client_nom,
      client_email: doc.client_email, client_telephone: doc.client_telephone, client_adresse: doc.client_adresse,
      lignes: formFromDoc(doc).lignes.map(toInvoiceLine),
      sous_total: doc.sous_total, taux_tva: doc.taux_tva, montant_tva: doc.montant_tva,
      montant_remise: doc.montant_remise, remise_type: doc.remise_type, remise_valeur: doc.remise_valeur, total_ttc: doc.total_ttc,
      date_emission: doc.date_emission, date_echeance: doc.date_echeance, notes: doc.notes,
    })
  }, [printData])

  /** Données du document tel qu'il est à l'écran (même avant enregistrement). */
  const dataFromEditor = useCallback((): InvoiceData => {
    const f = form!
    const t = calculerTotaux(f.lignes, f.remise_type, f.remise_valeur, f.taux_tva)
    return {
      type: editingDoc!.type, numero: editingDoc!.numero, client_nom: f.client_nom,
      client_email: f.client_email, client_telephone: f.client_telephone, client_adresse: f.client_adresse,
      lignes: f.lignes.map(toInvoiceLine),
      sous_total: t.sousTotal, taux_tva: f.taux_tva, montant_tva: t.montantTva,
      montant_remise: t.montantRemise, remise_type: f.remise_type, remise_valeur: f.remise_valeur, total_ttc: t.totalTtc,
      date_emission: f.date_emission, date_echeance: f.date_echeance || null, notes: f.notes,
    }
  }, [editingDoc, form])

  const pdfFromEditor = useCallback(() => {
    if (!editingDoc || !form) return
    printData(dataFromEditor())
  }, [editingDoc, form, dataFromEditor, printData])

  const openPreview = useCallback(() => {
    if (!editingDoc || !form) return
    setPreviewQr(null)
    setShowPreview(true)
    if (editingDoc.type === 'facture') {
      const data = dataFromEditor()
      import('@/lib/swiss-qr')
        .then(m => m.buildQrBillSvg(data, profileForPdf))
        .then(svg => setPreviewQr(svg))
        .catch(() => setPreviewQr(null))
    }
  }, [editingDoc, form, dataFromEditor, profileForPdf])

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
        unite: catForm.unite, description: catForm.description.trim(), categorie: catForm.categorie,
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
          <button onClick={openPreview} className={`${ICON_BTN} text-[var(--dark)]`} aria-label="Aperçu du document">
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
              {i > 0 && <span aria-hidden="true" className={`absolute top-3 right-1/2 w-full h-0.5 z-0 ${etapes[i - 1].etat === 'fait' ? 'bg-[var(--green)]' : 'bg-[var(--gray-200)]'}`} />}
              <span className={`relative z-10 w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold ${
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
            {contexte && (
              <div className="rounded-[20px] p-4 bg-[rgba(232,112,10,0.08)] border border-[rgba(232,112,10,0.25)]">
                <div className="text-[12px] font-bold uppercase tracking-wider text-[var(--orange-dark)] mb-1">Demande de {contexte.client_nom || 'votre client'}</div>
                <p className="text-[14px] text-[var(--dark)] whitespace-pre-line">« {contexte.description || 'Pas de message'} »</p>
              </div>
            )}
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
              <div className="flex items-center justify-between gap-3">
                <label htmlFor="fact-echeance" className="text-[15px] font-semibold text-[var(--dark)]">{isDevis ? 'Valable jusqu’au' : 'À payer jusqu’au'}</label>
                <input id="fact-echeance" type="date" value={form.date_echeance} onChange={e => patch({ date_echeance: e.target.value })} className={inputCls({ px: 'px-3', extra: 'max-w-[180px]' })} />
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[13px] text-[var(--gray-500)]">{isDevis ? 'Validité' : 'Payable sous'}</span>
                {(isDevis ? [15, 30, 60] : [10, 20, 30, 60]).map(j => {
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
            </section>

            {/* Prestations */}
            <section className={CARD} aria-labelledby="fact-lines-title">
              <div className="flex items-center justify-between mb-3">
                <h3 id="fact-lines-title" className="font-sora font-bold text-[16px]">Prestations</h3>
                {form.lignes.length > 0 && <span className="text-[13px] text-[var(--gray-500)]">{form.lignes.length} ligne{form.lignes.length > 1 ? 's' : ''}</span>}
              </div>

              {form.lignes.length > 0 ? (
                <ul className="flex flex-col gap-2 mb-4">
                  {form.lignes.map(l => {
                    return (
                      <li key={l.id}>
                        <button type="button" onClick={() => setLigneEdit({ ligne: l, isNew: false })}
                          className={`w-full flex items-center gap-3 p-3 rounded-2xl text-left border cursor-pointer transition-colors ${flashLine === l.id ? 'border-[var(--orange)] bg-[rgba(232,112,10,0.06)]' : 'border-transparent bg-[var(--gray-50)] hover:bg-[var(--gray-100)]'}`}>
                          <CatTile categorie={l.categorie} />
                          <span className="flex-1 min-w-0">
                            <span className="block font-semibold text-[15px] text-[var(--dark)] truncate">{l.description || 'Sans description'}</span>
                            <span className="block text-[13px] text-[var(--gray-500)] truncate">{resumeLigne(l)}</span>
                          </span>
                          <span className="font-sora font-bold text-[15px] text-[var(--dark)] shrink-0">{formatCHF(totalLigne(l.quantite, l.prix_unitaire))}</span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              ) : (
                <p className="text-[14px] text-[var(--gray-500)] mb-3">Qu’allez-vous facturer ?</p>
              )}

              <div className="grid grid-cols-2 gap-2 min-[600px]:grid-cols-4">
                {CATEGORIES.map(c => (
                  <button key={c.key} type="button" onClick={() => setLigneEdit({ ligne: nouvelleLigne(c.key, reglages), isNew: true })}
                    className="flex items-center gap-2.5 h-14 px-2.5 rounded-2xl border border-[var(--gray-200)] bg-white text-left cursor-pointer hover:border-[var(--orange)] active:scale-[0.98] transition-transform">
                    <CatTile categorie={c.key} className="w-9 h-9" />
                    <span className="text-[14px] font-semibold text-[var(--dark)] leading-tight">{c.label}</span>
                  </button>
                ))}
              </div>

              {/* Ajout rapide */}
              {quick.length > 0 && (
                <div className="mt-4">
                  <div className="text-[13px] text-[var(--gray-500)] mb-2">Depuis votre catalogue</div>
                  <div className="flex flex-wrap gap-2">
                    {quick.map(p => (
                      <button key={p.id} type="button" onClick={() => addFromCatalogue(p)}
                        className="flex items-center gap-1.5 h-10 pl-2.5 pr-3.5 max-w-full rounded-full border border-[var(--gray-200)] bg-white text-sm cursor-pointer hover:border-[var(--orange)] active:scale-95 transition-transform">
                        <IconPlus className="w-4 h-4 shrink-0 text-[var(--orange)]" />
                        <span className="font-semibold text-[var(--dark)] truncate">{p.nom}</span>
                        <span className="text-[var(--gray-500)] shrink-0">{formatPrixCourt(p.prix)}/{uniteCourte(p.unite)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {prestations.length > quick.length && (
                <button type="button" onClick={() => { setPickerAdded({}); setShowPicker(true) }} className="mt-3 flex items-center gap-2 h-10 text-[14px] font-semibold text-[var(--gray-700)] bg-transparent border-none cursor-pointer p-0">
                  <IconBook className="w-4 h-4" /> Tout le catalogue ({prestations.length})
                </button>
              )}
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
                <span className="text-[var(--gray-500)]">TVA{form.taux_tva > 0 ? ` ${form.taux_tva} %` : ''}</span>
                <span className="font-semibold">{formatCHF(totaux.montantTva)}</span>
              </div>
              {reglages.assujetti_tva || form.taux_tva > 0
                ? <Segmented<number> label="Taux de TVA" value={form.taux_tva} onChange={v => patch({ taux_tva: v })} options={tvaOptions} />
                : <p className="text-[13px] text-[var(--gray-500)]">Non assujetti à la TVA</p>}
            </div>
            {totaux.arrondi !== 0 && (
              <div className="flex justify-between items-center py-2 text-[14px] text-[var(--gray-500)] border-t border-[var(--gray-100)]">
                <span>Arrondi aux 5 centimes</span>
                <span>{totaux.arrondi > 0 ? '+' : '−'}{Math.abs(totaux.arrondi).toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between items-baseline gap-2 pt-3 border-t-2 border-[var(--dark)]">
              <span className="font-bold text-[16px]">Total{form.taux_tva > 0 ? ' TTC' : ''}</span>
              <span className="font-sora font-extrabold text-[22px]">{formatCHF(totaux.totalTtc)}</span>
            </div>
            {!isDevis && !bank?.bank_iban && (
              <p className="mt-4 p-3 rounded-xl bg-[var(--blue-light)] text-[13px] text-[var(--blue)]">
                Ajoutez votre IBAN dans <Link href="/mon-profil" className="font-semibold underline">Mon profil</Link> : la QR-facture sera jointe au PDF.
              </p>
            )}
            <button type="button" onClick={() => setShowReglages(true)} className="mt-4 flex items-center gap-2 text-[13px] font-semibold text-[var(--gray-700)] bg-transparent border-none cursor-pointer p-0">
              <IconSettings className="w-4 h-4" /> Tarifs, TVA et délais
            </button>
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

        {/* Aperçu : le vrai document, tel que le client le recevra */}
        {showPreview && (
          <Dialog onClose={() => setShowPreview(false)} labelledBy="fact-preview-title" variant="sheet" className="max-w-[880px] min-[600px]:max-h-[92vh]">
            <div className="flex items-baseline justify-between gap-3 px-5 pt-4 pb-3">
              <h3 id="fact-preview-title" className="font-sora font-bold text-lg">Aperçu</h3>
              <span className="text-[13px] text-[var(--gray-500)]">Tel que votre client le recevra</span>
            </div>
            <div className="px-3 pb-3">
              <DocumentPreview html={buildInvoiceHTML(dataFromEditor(), profileForPdf, previewQr, pdfOptions)} title={`Aperçu de ${editingDoc.numero}`} />
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
                        <span className="text-[14px] font-semibold text-[var(--dark)] shrink-0">{formatCHF(p.prix)}<span className="font-normal text-[var(--gray-500)]">/{uniteCourte(p.unite)}</span></span>
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

        {ligneEdit && (
          <LigneSheet
            ligne={ligneEdit.ligne}
            isNew={ligneEdit.isNew}
            reglages={reglages}
            onSave={saveLigne}
            onDelete={() => removeLine(ligneEdit.ligne.id)}
            onClose={() => setLigneEdit(null)}
          />
        )}
        {showReglages && (
          <ReglagesSheet userId={userId} reglages={reglages} onClose={() => setShowReglages(false)}
            onSaved={r => { setReglages(r); setShowReglages(false); showToast('success', 'Réglages enregistrés') }} />
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
          <button onClick={() => { setCatConfirmDelete(false); setCatForm({ id: null, nom: '', prix: 0, unite: 'heure', description: '', categorie: 'main_oeuvre' }) }} className={btn('primary', 'sm')}>
            <IconPlus className="w-4 h-4" /> Ajouter
          </button>
        </div>
        <p className="text-[14px] text-[var(--gray-500)] mb-4 px-1">Vos prestations courantes, à ajouter en un geste dans vos devis et factures.</p>

        {prestations.length === 0 ? (
          <div className={`${CARD} text-center py-12`}>
            <span className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-[rgba(232,112,10,0.12)] text-[var(--orange)] flex items-center justify-center"><IconBook className="w-7 h-7" /></span>
            <h3 className="font-sora font-bold text-base mb-1">Catalogue vide</h3>
            <p className="text-sm text-[var(--gray-500)] mb-5">Commencez par votre tarif horaire et vos forfaits.</p>
            <button onClick={() => setCatForm({ id: null, nom: 'Main d’œuvre', prix: reglages.tarif_horaire, unite: 'heure', description: '', categorie: 'main_oeuvre' })} className={BTN_PRIMARY}>Ajouter ma main d’œuvre</button>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {prestations.map(p => (
              <li key={p.id}>
                <button type="button" onClick={() => { setCatConfirmDelete(false); setCatForm({ id: p.id, nom: p.nom, prix: p.prix, unite: p.unite, description: p.description || '', categorie: categorieLigne({ categorie: p.categorie, unite: p.unite }) }) }}
                  className="w-full flex items-center gap-3 p-3.5 rounded-[20px] border border-[var(--gray-200)] bg-white text-left cursor-pointer hover:border-[var(--gray-300)]">
                  <CatTile categorie={categorieLigne({ categorie: p.categorie, unite: p.unite })} className="w-11 h-11" />
                  <span className="flex-1 min-w-0">
                    <span className="block font-semibold text-[15px] text-[var(--dark)] truncate">{p.nom}</span>
                    {p.description && <span className="block text-[13px] text-[var(--gray-500)] truncate">{p.description}</span>}
                  </span>
                  <span className="text-right shrink-0">
                    <span className="block font-sora font-bold text-[15px] text-[var(--dark)]">{formatCHF(p.prix)}</span>
                    <span className="block text-[12px] text-[var(--gray-500)]">par {uniteCourte(p.unite) === 'h' ? 'heure' : uniteCourte(p.unite)}</span>
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
                <div>
                  <span className={LABEL}>Type</span>
                  <div role="radiogroup" aria-label="Type de prestation" className="grid grid-cols-2 gap-2">
                    {CATEGORIES.map(c => {
                      const on = catForm.categorie === c.key
                      return (
                        <button key={c.key} type="button" role="radio" aria-checked={on}
                          onClick={() => setCatForm({ ...catForm, categorie: c.key, unite: c.key === 'main_oeuvre' ? 'heure' : c.key === 'materiel' ? (catForm.unite === 'heure' || catForm.unite === 'forfait' ? 'unite' : catForm.unite) : 'forfait' })}
                          className={`flex items-center gap-2 h-12 px-2.5 rounded-xl border text-left text-[14px] font-semibold cursor-pointer transition-colors ${on ? 'border-[var(--dark)] bg-[var(--gray-50)] text-[var(--dark)]' : 'border-[var(--gray-200)] bg-white text-[var(--gray-700)]'}`}>
                          <CatIcon categorie={c.key} className="w-[18px] h-[18px]" /> {c.label}
                        </button>
                      )
                    })}
                  </div>
                </div>
                <div className={`grid gap-3 ${catForm.categorie === 'materiel' ? 'grid-cols-2' : 'grid-cols-1'}`}>
                  <div>
                    <label htmlFor="cat-prix" className={LABEL}>{catForm.categorie === 'main_oeuvre' ? 'Prix par heure (CHF)' : catForm.categorie === 'materiel' ? 'Prix de vente (CHF)' : 'Prix (CHF)'}</label>
                    <DecimalInput id="cat-prix" value={catForm.prix} onValue={n => setCatForm(c => c ? { ...c, prix: n } : c)} className={`${INPUT} text-right`} />
                  </div>
                  {catForm.categorie === 'materiel' && (
                    <div>
                      <label htmlFor="cat-unite" className={LABEL}>Par</label>
                      <select id="cat-unite" value={catForm.unite} onChange={e => setCatForm({ ...catForm, unite: e.target.value })} className={inputCls({ px: 'px-3' })}>
                        {UNITES.filter(u => u.value !== 'heure' && u.value !== 'forfait').map(u => <option key={u.value} value={u.value}>{u.long}</option>)}
                      </select>
                    </div>
                  )}
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
          <button onClick={() => setShowReglages(true)} className={`${btn('secondary', 'sm')} max-[900px]:hidden`}>
            <IconSettings className="w-4 h-4" /> Réglages
          </button>
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

      {reglages.tarif_horaire === 0 && (
        <button type="button" onClick={() => setShowReglages(true)}
          className="w-full flex items-center gap-3 p-4 mb-4 rounded-[20px] bg-[rgba(232,112,10,0.08)] border border-[rgba(232,112,10,0.25)] text-left cursor-pointer">
          <span className="w-11 h-11 shrink-0 rounded-2xl bg-[var(--orange)] text-white flex items-center justify-center"><IconSettings className="w-5 h-5" /></span>
          <span className="flex-1 min-w-0">
            <span className="block font-semibold text-[15px] text-[var(--dark)]">Indiquez votre tarif horaire</span>
            <span className="block text-[13px] text-[var(--gray-700)]">30 secondes, et vos devis se remplissent tout seuls.</span>
          </span>
          <IconChevron className="w-5 h-5 text-[var(--gray-500)] shrink-0" />
        </button>
      )}

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
              <button type="button" onClick={() => { setShowCreate(false); setShowReglages(true) }} className="w-full flex items-center gap-4 p-4 rounded-[20px] bg-[var(--gray-50)] border-none text-left cursor-pointer">
                <span className="w-12 h-12 shrink-0 rounded-2xl bg-white text-[var(--gray-700)] flex items-center justify-center"><IconSettings /></span>
                <span>
                  <span className="block font-semibold text-[15px] text-[var(--dark)]">Mes tarifs et réglages</span>
                  <span className="block text-[14px] text-[var(--gray-500)]">{reglages.tarif_horaire ? `${formatPrixCourt(reglages.tarif_horaire)}/h` : 'Tarif horaire à renseigner'} · TVA · délais</span>
                </span>
              </button>
            </div>
          </div>
        </Dialog>
      )}

      {showReglages && (
        <ReglagesSheet userId={userId} reglages={reglages} onClose={() => setShowReglages(false)}
          onSaved={r => { setReglages(r); setShowReglages(false); showToast('success', 'Réglages enregistrés') }} />
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
