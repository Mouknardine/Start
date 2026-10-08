'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  loadDocuments, saveDocument, deleteDocument,
  loadPrestations, savePrestation, deletePrestation,
  getNextDocNumber, loadMyBankDetails,
} from '@/lib/supabase/helpers'
import type { Document, Prestation, Artisan } from '@/lib/supabase/helpers'
import { printInvoice, type InvoiceData, type InvoiceLine } from '@/lib/invoice-pdf'

// ===== Types =====

type LineItem = {
  id: string
  description: string
  quantite: number
  unite: string
  prix_unitaire: number
  total: number
}

type Toast = { type: 'success' | 'error'; msg: string } | null

type Props = { userId: string; profile: Artisan | null }

// ===== Helpers =====

function formatCHF(n: number): string {
  const fixed = Math.abs(n).toFixed(2)
  const [int, dec] = fixed.split('.')
  const formatted = int.replace(/\B(?=(\d{3})+(?!\d))/g, "'")
  return `${n < 0 ? '-' : ''}${formatted}.${dec} CHF`
}

function formatDate(dateStr: string): string {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`
}

function statusLabel(s: string): string {
  const map: Record<string, string> = {
    brouillon: 'Brouillon', envoye: 'Envoyé', envoyee: 'Envoyée',
    accepte: 'Accepté', refuse: 'Refusé', payee: 'Payée',
    en_retard: 'En retard', converti: 'Converti',
  }
  return map[s] || s || 'Brouillon'
}

function statusStyle(s: string): string {
  const map: Record<string, string> = {
    brouillon: 'bg-[var(--gray-100)] text-[var(--gray-500)]',
    envoye: 'bg-[var(--blue-light)] text-[var(--blue)]',
    envoyee: 'bg-[var(--blue-light)] text-[var(--blue)]',
    accepte: 'bg-[var(--green-light)] text-[var(--green)]',
    payee: 'bg-[rgba(46,125,50,0.15)] text-[#1B5E20]',
    refuse: 'bg-[var(--red-light)] text-[var(--red)]',
    en_retard: 'bg-[rgba(211,47,47,0.12)] text-[var(--red)]',
    converti: 'bg-[rgba(232,112,10,0.1)] text-[var(--orange)]',
  }
  return map[s] || 'bg-[var(--gray-100)] text-[var(--gray-500)]'
}

const UNITES = [
  { value: 'heure', label: 'heure' },
  { value: 'forfait', label: 'forfait' },
  { value: 'm2', label: 'm²' },
  { value: 'ml', label: 'ml' },
  { value: 'unite', label: 'unité' },
  { value: 'lot', label: 'lot' },
]

const TVA_RATES = [
  { value: 0, label: '0%' },
  { value: 7.7, label: '7.7%' },
  { value: 8.1, label: '8.1%' },
]

function generateLineId(): string {
  return 'l_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6)
}

function todayISO(): string {
  return new Date().toISOString().split('T')[0]
}

// ===== Component =====

export default function DashFacturation({ userId, profile }: Props) {
  const [viewMode, setViewMode] = useState<'list' | 'editor' | 'catalogue'>('list')
  const [documents, setDocuments] = useState<Document[]>([])
  const [prestations, setPrestations] = useState<Prestation[]>([])
  const [filterType, setFilterType] = useState<'all' | 'devis' | 'facture'>('all')
  const [filterStatus, setFilterStatus] = useState('all')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState<Toast>(null)

  // Editor state
  const [editingDoc, setEditingDoc] = useState<Document | null>(null)
  const [lineItems, setLineItems] = useState<LineItem[]>([])
  const [clientNom, setClientNom] = useState('')
  const [clientEmail, setClientEmail] = useState('')
  const [clientTelephone, setClientTelephone] = useState('')
  const [clientAdresse, setClientAdresse] = useState('')
  const [notes, setNotes] = useState('')
  const [dateEmission, setDateEmission] = useState(todayISO())
  const [dateEcheance, setDateEcheance] = useState('')
  const [tauxTva, setTauxTva] = useState(8.1)
  const [remiseType, setRemiseType] = useState('aucune')
  const [remiseValeur, setRemiseValeur] = useState(0)

  // Catalogue state
  const [catFormOpen, setCatFormOpen] = useState(false)
  const [catEditId, setCatEditId] = useState<string | null>(null)
  const [catNom, setCatNom] = useState('')
  const [catPrix, setCatPrix] = useState('')
  const [catUnite, setCatUnite] = useState('heure')
  const [catDesc, setCatDesc] = useState('')

  // Modals
  const [showPreview, setShowPreview] = useState(false)
  const [showPicker, setShowPicker] = useState(false)
  const [pickerSelected, setPickerSelected] = useState<Set<string>>(new Set())
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)

  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ===== Load data =====
  useEffect(() => {
    const supabase = createClient()
    Promise.all([
      loadDocuments(supabase, userId),
      loadPrestations(supabase, userId),
    ]).then(([docs, prests]) => {
      setDocuments(docs)
      setPrestations(prests)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [userId])

  // ===== Toast =====
  const showToast = useCallback((type: 'success' | 'error', msg: string) => {
    setToast({ type, msg })
    setTimeout(() => setToast(null), 4000)
  }, [])

  // ===== Calculations =====
  const sousTotal = lineItems.reduce((s, l) => s + l.total, 0)
  const montantRemise = remiseType === 'pourcentage'
    ? Math.round(sousTotal * (remiseValeur / 100) * 100) / 100
    : remiseType === 'montant'
      ? Math.round(Math.min(remiseValeur, sousTotal) * 100) / 100
      : 0
  const afterDiscount = sousTotal - montantRemise
  const montantTva = Math.round(afterDiscount * (tauxTva / 100) * 100) / 100
  const totalTtc = Math.round((afterDiscount + montantTva) * 100) / 100

  // ===== Filter documents =====
  const filteredDocs = documents
    .filter(d => filterType === 'all' || d.type === filterType)
    .filter(d => filterStatus === 'all' || d.statut === filterStatus)
    .filter(d => {
      if (!search) return true
      const q = search.toLowerCase()
      return (d.client_nom || '').toLowerCase().includes(q) || (d.numero || '').toLowerCase().includes(q)
    })
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  // ===== Editor helpers =====
  const populateEditor = useCallback((doc: Document) => {
    setEditingDoc(doc)
    setClientNom(doc.client_nom || '')
    setClientEmail(doc.client_email || '')
    setClientTelephone(doc.client_telephone || '')
    setClientAdresse(doc.client_adresse || '')
    setNotes(doc.notes || '')
    setDateEmission(doc.date_emission || todayISO())
    setDateEcheance(doc.date_echeance || '')
    setTauxTva(doc.taux_tva ?? 8.1)
    setRemiseType(doc.remise_type || 'aucune')
    setRemiseValeur(doc.remise_valeur || 0)
    const lignes = Array.isArray(doc.lignes) ? doc.lignes : []
    setLineItems(lignes.map(l => ({
      id: (l as Record<string, unknown>).id as string || generateLineId(),
      description: (l as Record<string, unknown>).description as string || '',
      quantite: Number((l as Record<string, unknown>).quantite) || 1,
      unite: (l as Record<string, unknown>).unite as string || 'heure',
      prix_unitaire: Number((l as Record<string, unknown>).prix_unitaire) || 0,
      total: Number((l as Record<string, unknown>).total) || 0,
    })))
    setViewMode('editor')
  }, [])

  const collectDocData = useCallback((): Partial<Document> => {
    const lignes = lineItems.map(l => ({
      id: l.id, description: l.description, quantite: l.quantite,
      unite: l.unite, prix_unitaire: l.prix_unitaire, total: l.total,
    }))
    return {
      ...(editingDoc?.id ? { id: editingDoc.id } : {}),
      artisan_id: userId,
      type: editingDoc?.type || 'devis',
      numero: editingDoc?.numero || '',
      client_nom: clientNom,
      client_email: clientEmail,
      client_telephone: clientTelephone,
      client_adresse: clientAdresse,
      lignes: lignes as Record<string, unknown>[],
      sous_total: Math.round(sousTotal * 100) / 100,
      taux_tva: tauxTva,
      montant_tva: montantTva,
      remise_type: remiseType === 'aucune' ? null : remiseType,
      remise_valeur: remiseType === 'aucune' ? null : remiseValeur,
      montant_remise: remiseType === 'aucune' ? null : montantRemise,
      total_ttc: totalTtc,
      date_emission: dateEmission,
      date_echeance: dateEcheance || null,
      statut: editingDoc?.statut || 'brouillon',
      notes,
      devis_source_id: editingDoc?.devis_source_id || null,
    }
  }, [editingDoc, userId, clientNom, clientEmail, clientTelephone, clientAdresse, lineItems, sousTotal, tauxTva, montantTva, remiseType, remiseValeur, montantRemise, totalTtc, dateEmission, dateEcheance, notes])

  // ===== PDF =====
  // Depuis un document enregistré (ligne de liste).
  const pdfFromDoc = useCallback((doc: Document) => {
    const lignes: InvoiceLine[] = (Array.isArray(doc.lignes) ? doc.lignes : []).map(l => ({
      description: String((l as Record<string, unknown>).description || ''),
      quantite: Number((l as Record<string, unknown>).quantite) || 0,
      unite: String((l as Record<string, unknown>).unite || 'unite'),
      prix_unitaire: Number((l as Record<string, unknown>).prix_unitaire) || 0,
      total: Number((l as Record<string, unknown>).total) || 0,
    }))
    const data: InvoiceData = {
      type: doc.type, numero: doc.numero, client_nom: doc.client_nom,
      client_email: doc.client_email, client_telephone: doc.client_telephone, client_adresse: doc.client_adresse,
      lignes, sous_total: doc.sous_total, taux_tva: doc.taux_tva, montant_tva: doc.montant_tva,
      montant_remise: doc.montant_remise, total_ttc: doc.total_ttc,
      date_emission: doc.date_emission, date_echeance: doc.date_echeance, notes: doc.notes,
    }
    printInvoice(data, profile).catch(() => showToast('error', 'Erreur lors de la génération du PDF.'))
  }, [profile, showToast])

  // Depuis l'état courant de l'éditeur (aperçu, même avant enregistrement).
  const pdfFromEditor = useCallback(() => {
    if (!editingDoc) return
    const data: InvoiceData = {
      type: editingDoc.type, numero: editingDoc.numero, client_nom: clientNom,
      client_email: clientEmail, client_telephone: clientTelephone, client_adresse: clientAdresse,
      lignes: lineItems.map(l => ({ description: l.description, quantite: l.quantite, unite: l.unite, prix_unitaire: l.prix_unitaire, total: l.total })),
      sous_total: sousTotal, taux_tva: tauxTva, montant_tva: montantTva,
      montant_remise: montantRemise, total_ttc: totalTtc,
      date_emission: dateEmission, date_echeance: dateEcheance, notes,
    }
    printInvoice(data, profile).catch(() => showToast('error', 'Erreur lors de la génération du PDF.'))
  }, [editingDoc, clientNom, clientEmail, clientTelephone, clientAdresse, lineItems, sousTotal, tauxTva, montantTva, montantRemise, totalTtc, dateEmission, dateEcheance, notes, profile, showToast])

  // ===== Create new =====
  const createNew = useCallback(async (type: 'devis' | 'facture') => {
    const supabase = createClient()
    try {
      const numero = await getNextDocNumber(supabase, userId, type)
      const newDoc: Document = {
        id: '', artisan_id: userId, type, numero,
        client_nom: '', client_email: '', client_telephone: '', client_adresse: '',
        lignes: [], sous_total: 0, taux_tva: 8.1, montant_tva: 0,
        remise_type: null, remise_valeur: null, montant_remise: null, total_ttc: 0,
        date_emission: todayISO(), date_echeance: null, date_acceptation: null, date_paiement: null,
        statut: 'brouillon', notes: '', devis_source_id: null, created_at: new Date().toISOString(),
      }
      populateEditor(newDoc)
    } catch (e) { showToast('error', 'Erreur: ' + (e instanceof Error ? e.message : '')) }
  }, [userId, populateEditor, showToast])

  // ===== Save document =====
  const handleSave = useCallback(async () => {
    if (!clientNom.trim()) { showToast('error', 'Veuillez renseigner le nom du client.'); return }
    const supabase = createClient()
    const data = collectDocData()
    try {
      const saved = await saveDocument(supabase, data)
      setEditingDoc(saved)
      setDocuments(prev => {
        const idx = prev.findIndex(d => d.id === saved.id)
        if (idx !== -1) { const copy = [...prev]; copy[idx] = saved; return copy }
        return [saved, ...prev]
      })
      showToast('success', data.type === 'devis' ? 'Devis enregistré' : 'Facture enregistrée')
    } catch (e) { showToast('error', 'Erreur: ' + (e instanceof Error ? e.message : '')) }
  }, [clientNom, collectDocData, showToast])

  // ===== Auto-save =====
  const triggerAutoSave = useCallback(() => {
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current)
    autoSaveTimer.current = setTimeout(async () => {
      if (editingDoc?.id && editingDoc.statut === 'brouillon') {
        const supabase = createClient()
        const data = collectDocData()
        try { await saveDocument(supabase, data) } catch { /* silent */ }
      }
    }, 3000)
  }, [editingDoc, collectDocData])

  // ===== Line items =====
  const addLine = useCallback((desc = '', qty = 1, unite = 'heure', prix = 0) => {
    const newLine: LineItem = { id: generateLineId(), description: desc, quantite: qty, unite, prix_unitaire: prix, total: qty * prix }
    setLineItems(prev => [...prev, newLine])
    triggerAutoSave()
  }, [triggerAutoSave])

  const updateLine = useCallback((lineId: string, field: keyof LineItem, value: string | number) => {
    setLineItems(prev => prev.map(l => {
      if (l.id !== lineId) return l
      const updated = { ...l, [field]: field === 'quantite' || field === 'prix_unitaire' ? (parseFloat(String(value)) || 0) : value }
      if (field === 'quantite' || field === 'prix_unitaire') updated.total = updated.quantite * updated.prix_unitaire
      return updated
    }))
    triggerAutoSave()
  }, [triggerAutoSave])

  const removeLine = useCallback((lineId: string) => {
    setLineItems(prev => prev.filter(l => l.id !== lineId))
    triggerAutoSave()
  }, [triggerAutoSave])

  // ===== Status workflow =====
  const setStatus = useCallback(async (newStatus: string) => {
    if (!editingDoc?.id) { showToast('error', "Enregistrez le document d'abord."); return }
    const supabase = createClient()
    try {
      const updates: Partial<Document> = { id: editingDoc.id, statut: newStatus }
      if (newStatus === 'payee') updates.date_paiement = todayISO()
      if (newStatus === 'accepte') updates.date_acceptation = todayISO()
      await saveDocument(supabase, updates)
      setEditingDoc(prev => prev ? { ...prev, ...updates } : prev)
      setDocuments(prev => prev.map(d => d.id === editingDoc.id ? { ...d, ...updates } : d))
      showToast('success', 'Statut mis à jour')
    } catch (e) { showToast('error', 'Erreur: ' + (e instanceof Error ? e.message : '')) }
  }, [editingDoc, showToast])

  // ===== Convert devis → facture =====
  const convertToFacture = useCallback(async () => {
    if (!editingDoc || editingDoc.type !== 'devis') return
    const supabase = createClient()
    try {
      const numero = await getNextDocNumber(supabase, userId, 'facture')
      const data = collectDocData()
      delete (data as Record<string, unknown>).id
      data.type = 'facture'
      data.numero = numero
      data.statut = 'brouillon'
      data.date_emission = todayISO()
      data.date_echeance = null
      data.devis_source_id = editingDoc.id
      const saved = await saveDocument(supabase, data)
      // Mark original devis as converti
      await saveDocument(supabase, { id: editingDoc.id, statut: 'converti' })
      setDocuments(prev => [saved, ...prev.map(d => d.id === editingDoc.id ? { ...d, statut: 'converti' } : d)])
      showToast('success', `Facture ${numero} créée !`)
      populateEditor(saved)
    } catch (e) { showToast('error', 'Erreur: ' + (e instanceof Error ? e.message : '')) }
  }, [editingDoc, userId, collectDocData, populateEditor, showToast])

  // ===== Delete document =====
  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return
    const supabase = createClient()
    try {
      await deleteDocument(supabase, deleteTarget)
      setDocuments(prev => prev.filter(d => d.id !== deleteTarget))
      setDeleteTarget(null)
      showToast('success', 'Document supprimé')
    } catch (e) { showToast('error', 'Erreur: ' + (e instanceof Error ? e.message : '')) }
  }, [deleteTarget, showToast])

  // ===== Duplicate =====
  const duplicateDoc = useCallback(async (docId: string) => {
    const doc = documents.find(d => d.id === docId)
    if (!doc) return
    const supabase = createClient()
    try {
      const numero = await getNextDocNumber(supabase, userId, doc.type)
      const data: Partial<Document> = {
        artisan_id: userId, type: doc.type, numero,
        client_nom: doc.client_nom, client_email: doc.client_email,
        client_telephone: doc.client_telephone, client_adresse: doc.client_adresse,
        lignes: doc.lignes, sous_total: doc.sous_total, taux_tva: doc.taux_tva,
        montant_tva: doc.montant_tva, remise_type: doc.remise_type,
        remise_valeur: doc.remise_valeur, montant_remise: doc.montant_remise,
        total_ttc: doc.total_ttc, date_emission: todayISO(), date_echeance: null,
        statut: 'brouillon', notes: doc.notes, devis_source_id: null,
      }
      const saved = await saveDocument(supabase, data)
      setDocuments(prev => [saved, ...prev])
      showToast('success', `${doc.type === 'devis' ? 'Devis' : 'Facture'} dupliqué(e)`)
    } catch (e) { showToast('error', 'Erreur: ' + (e instanceof Error ? e.message : '')) }
  }, [documents, userId, showToast])

  // ===== Catalogue =====
  const openCatForm = useCallback((prest?: Prestation) => {
    setCatFormOpen(true)
    if (prest) {
      setCatEditId(prest.id)
      setCatNom(prest.nom)
      setCatPrix(String(prest.prix))
      setCatUnite(prest.unite)
      setCatDesc(prest.description || '')
    } else {
      setCatEditId(null)
      setCatNom('')
      setCatPrix('')
      setCatUnite('heure')
      setCatDesc('')
    }
  }, [])

  const saveCatForm = useCallback(async () => {
    if (!catNom.trim() || !catPrix) { showToast('error', 'Nom et prix requis.'); return }
    const supabase = createClient()
    try {
      const data: Partial<Prestation> = {
        artisan_id: userId, nom: catNom.trim(), prix: parseFloat(catPrix),
        unite: catUnite, description: catDesc.trim(), ordre: prestations.length,
      }
      if (catEditId) data.id = catEditId
      const saved = await savePrestation(supabase, data)
      setPrestations(prev => {
        if (catEditId) return prev.map(p => p.id === catEditId ? saved : p)
        return [...prev, saved]
      })
      setCatFormOpen(false)
      showToast('success', 'Prestation enregistrée')
    } catch (e) { showToast('error', 'Erreur: ' + (e instanceof Error ? e.message : '')) }
  }, [catNom, catPrix, catUnite, catDesc, catEditId, userId, prestations.length, showToast])

  const deletePrest = useCallback(async (id: string) => {
    if (!confirm('Supprimer cette prestation ?')) return
    const supabase = createClient()
    try {
      await deletePrestation(supabase, id)
      setPrestations(prev => prev.filter(p => p.id !== id))
      showToast('success', 'Prestation supprimée')
    } catch (e) { showToast('error', 'Erreur: ' + (e instanceof Error ? e.message : '')) }
  }, [showToast])

  // ===== Picker =====
  const confirmPicker = useCallback(() => {
    pickerSelected.forEach(id => {
      const p = prestations.find(x => x.id === id)
      if (p) addLine(p.nom, 1, p.unite, p.prix)
    })
    setShowPicker(false)
    setPickerSelected(new Set())
  }, [pickerSelected, prestations, addLine])

  // ===== Loading =====
  if (loading) {
    return <div className="text-center py-12 text-[var(--gray-500)] text-sm">Chargement de la facturation...</div>
  }

  // ===== VIEW: LIST =====
  if (viewMode === 'list') {
    return (
      <>
        {/* Header */}
        <div className="flex items-center justify-between mb-5 max-[600px]:flex-col max-[600px]:gap-3 max-[600px]:items-stretch">
          <h2 className="font-sora text-[22px] font-extrabold text-[var(--dark)]">Facturation</h2>
          <div className="flex gap-2 max-[600px]:w-full">
            <button onClick={() => createNew('devis')} className="flex items-center gap-1.5 py-2.5 px-4 rounded-full text-sm font-bold bg-[var(--orange)] text-white border-none cursor-pointer hover:bg-[var(--orange-dark)] transition-colors max-[600px]:flex-1 max-[600px]:justify-center">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Nouveau devis
            </button>
            <button onClick={() => createNew('facture')} className="flex items-center gap-1.5 py-2.5 px-4 rounded-full text-sm font-bold bg-[var(--dark)] text-white border-none cursor-pointer hover:bg-[var(--dark-mid)] transition-colors max-[600px]:flex-1 max-[600px]:justify-center">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Nouvelle facture
            </button>
            <button onClick={() => setViewMode('catalogue')} className="flex items-center gap-1.5 py-2.5 px-4 rounded-full text-sm font-bold bg-[var(--gray-100)] text-[var(--gray-700)] border-none cursor-pointer hover:bg-[var(--gray-200)] transition-colors">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>
              Catalogue
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 mb-4 flex-wrap max-[600px]:gap-2">
          <div className="flex gap-0.5 bg-[var(--gray-100)] p-0.5 rounded-lg">
            {(['all', 'devis', 'facture'] as const).map(t => (
              <button key={t} onClick={() => setFilterType(t)}
                className={`py-1.5 px-3 rounded-md text-xs font-semibold border-none cursor-pointer transition-all ${filterType === t ? 'bg-white text-[var(--dark)] shadow-sm' : 'text-[var(--gray-500)]'}`}>
                {t === 'all' ? 'Tous' : t === 'devis' ? 'Devis' : 'Factures'}
              </button>
            ))}
          </div>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            className="py-1.5 px-3 rounded-lg text-xs border border-[var(--gray-200)] outline-none bg-white">
            <option value="all">Tous les statuts</option>
            <option value="brouillon">Brouillon</option>
            <option value="envoye">Envoyé</option>
            <option value="accepte">Accepté</option>
            <option value="payee">Payée</option>
            <option value="en_retard">En retard</option>
            <option value="refuse">Refusé</option>
            <option value="converti">Converti</option>
          </select>
          <div className="relative flex-1 min-w-[160px]">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--gray-500)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher..."
              className="w-full py-1.5 pl-8 pr-3 rounded-lg text-xs border border-[var(--gray-200)] outline-none focus:border-[var(--orange)]" />
          </div>
        </div>

        {/* Document list */}
        <div className="bg-white rounded-[var(--radius)] border border-[var(--gray-200)] overflow-hidden">
          {filteredDocs.length === 0 ? (
            <div className="text-center py-16 px-6">
              <svg className="w-12 h-12 mx-auto text-[var(--gray-300)] mb-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              <h3 className="font-sora font-bold text-base mb-2">Aucun document</h3>
              <p className="text-sm text-[var(--gray-500)]">Utilisez les boutons ci-dessus pour créer votre premier devis ou facture.</p>
            </div>
          ) : (
            filteredDocs.map(doc => (
              <div key={doc.id} className="flex items-center gap-4 p-4 border-b border-[var(--gray-100)] last:border-0 hover:bg-[var(--gray-50)] transition-colors max-[600px]:flex-col max-[600px]:items-start max-[600px]:gap-2">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <span className={`shrink-0 py-1 px-2 rounded text-[10px] font-bold uppercase ${doc.type === 'devis' ? 'bg-[rgba(232,112,10,0.1)] text-[var(--orange)]' : 'bg-[var(--blue-light)] text-[var(--blue)]'}`}>
                    {doc.type === 'devis' ? 'DEV' : 'FAC'}
                  </span>
                  <div className="min-w-0">
                    <div className="font-semibold text-sm text-[var(--dark)] truncate">{doc.numero}</div>
                    <div className="text-xs text-[var(--gray-500)] truncate">{doc.client_nom || '(sans client)'}</div>
                  </div>
                </div>
                <div className="text-right max-[600px]:flex max-[600px]:items-center max-[600px]:gap-3 max-[600px]:w-full max-[600px]:justify-between">
                  <div className="font-sora font-bold text-sm text-[var(--dark)]">{formatCHF(doc.total_ttc)}</div>
                  <div className="flex items-center gap-2 mt-1 max-[600px]:mt-0">
                    <span className={`py-0.5 px-2 rounded-full text-[10px] font-bold ${statusStyle(doc.statut)}`}>{statusLabel(doc.statut)}</span>
                    <span className="text-[10px] text-[var(--gray-500)]">{formatDate(doc.date_emission)}</span>
                  </div>
                </div>
                <div className="flex gap-1 shrink-0 max-[600px]:w-full max-[600px]:justify-end">
                  <button onClick={() => populateEditor(doc)} className="text-[10px] font-bold py-1 px-2.5 rounded-md bg-[var(--gray-100)] text-[var(--gray-700)] border-none cursor-pointer hover:bg-[var(--gray-200)] transition-colors">Modifier</button>
                  <button onClick={() => duplicateDoc(doc.id)} className="text-[10px] font-bold py-1 px-2.5 rounded-md bg-[var(--gray-100)] text-[var(--gray-700)] border-none cursor-pointer hover:bg-[var(--gray-200)] transition-colors">Dupliquer</button>
                  <button onClick={() => pdfFromDoc(doc)} title="Télécharger en PDF" className="text-[10px] font-bold py-1 px-2.5 rounded-md bg-[var(--gray-100)] text-[var(--gray-700)] border-none cursor-pointer hover:bg-[var(--gray-200)] transition-colors">PDF</button>
                  <button onClick={() => setDeleteTarget(doc.id)} className="text-[10px] font-bold py-1 px-2.5 rounded-md bg-[var(--red-light)] text-[var(--red)] border-none cursor-pointer hover:bg-[rgba(211,47,47,0.12)] transition-colors">
                    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Delete Modal */}
        {deleteTarget && (
          <div className="fixed inset-0 z-[200] bg-black/50 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) setDeleteTarget(null) }}>
            <div className="bg-white rounded-[var(--radius)] p-6 max-w-[400px] w-full">
              <h3 className="font-sora font-bold text-lg mb-2">Supprimer ce document ?</h3>
              <p className="text-sm text-[var(--gray-500)] mb-5">Cette action est irréversible.</p>
              <div className="flex gap-3 justify-end">
                <button onClick={() => setDeleteTarget(null)} className="py-2.5 px-5 rounded-full text-sm font-semibold bg-[var(--gray-100)] text-[var(--gray-500)] border-none cursor-pointer">Annuler</button>
                <button onClick={confirmDelete} className="py-2.5 px-5 rounded-full text-sm font-semibold bg-[var(--red)] text-white border-none cursor-pointer">Supprimer</button>
              </div>
            </div>
          </div>
        )}

        {/* Toast */}
        {toast && (
          <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[300] flex items-center gap-2 py-3 px-5 rounded-full text-sm font-semibold text-white shadow-lg transition-all ${toast.type === 'success' ? 'bg-[var(--green)]' : 'bg-[var(--red)]'}`}>
            {toast.type === 'success' ? (
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
            ) : (
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
            )}
            {toast.msg}
          </div>
        )}
      </>
    )
  }

  // ===== VIEW: EDITOR =====
  if (viewMode === 'editor' && editingDoc) {
    const isDevis = editingDoc.type === 'devis'
    return (
      <>
        {/* Editor Header */}
        <div className="flex items-center justify-between mb-5 max-[600px]:flex-col max-[600px]:gap-3 max-[600px]:items-stretch">
          <div className="flex items-center gap-3">
            <button onClick={() => { setViewMode('list'); setEditingDoc(null) }} className="flex items-center gap-1 text-sm text-[var(--gray-500)] font-medium border-none bg-transparent cursor-pointer hover:text-[var(--dark)] transition-colors">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
              Retour
            </button>
            <span className={`py-1 px-2.5 rounded text-[11px] font-bold uppercase ${isDevis ? 'bg-[rgba(232,112,10,0.1)] text-[var(--orange)]' : 'bg-[var(--blue-light)] text-[var(--blue)]'}`}>
              {isDevis ? 'DEVIS' : 'FACTURE'}
            </span>
            <span className="font-sora font-bold text-base">{editingDoc.numero}</span>
            <span className={`py-0.5 px-2 rounded-full text-[10px] font-bold ${statusStyle(editingDoc.statut)}`}>{statusLabel(editingDoc.statut)}</span>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowPreview(true)} className="flex items-center gap-1.5 text-[11px] font-bold py-1.5 px-3 rounded-lg bg-[var(--gray-100)] text-[var(--gray-700)] border-none cursor-pointer hover:bg-[var(--gray-200)] transition-colors">
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              Aperçu
            </button>
            <button onClick={handleSave} className="flex items-center gap-1.5 py-2 px-4 rounded-full text-sm font-bold bg-[var(--orange)] text-white border-none cursor-pointer hover:bg-[var(--orange-dark)] transition-colors">
              Enregistrer
            </button>
          </div>
        </div>

        <div className="grid gap-5 grid-cols-[1fr_320px] max-[900px]:grid-cols-1">
          {/* Main column */}
          <div className="flex flex-col gap-4">
            {/* Client */}
            <div className="bg-white rounded-[var(--radius)] border border-[var(--gray-200)] p-5">
              <h3 className="font-sora font-bold text-sm mb-4 flex items-center gap-2">
                <svg className="w-4 h-4 text-[var(--gray-500)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                Client
              </h3>
              <div className="grid grid-cols-2 gap-3 max-[600px]:grid-cols-1">
                <div>
                  <label className="block text-[11px] font-semibold text-[var(--gray-500)] mb-1">Nom / Entreprise</label>
                  <input type="text" value={clientNom} onChange={e => { setClientNom(e.target.value); triggerAutoSave() }} placeholder="Ex: Sophie Martin"
                    className="w-full py-2 px-3 border border-[var(--gray-200)] rounded-lg text-sm outline-none focus:border-[var(--orange)]" />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[var(--gray-500)] mb-1">Email</label>
                  <input type="email" value={clientEmail} onChange={e => { setClientEmail(e.target.value); triggerAutoSave() }} placeholder="sophie@example.ch"
                    className="w-full py-2 px-3 border border-[var(--gray-200)] rounded-lg text-sm outline-none focus:border-[var(--orange)]" />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[var(--gray-500)] mb-1">Téléphone</label>
                  <input type="tel" value={clientTelephone} onChange={e => { setClientTelephone(e.target.value); triggerAutoSave() }} placeholder="+41 79 000 00 00"
                    className="w-full py-2 px-3 border border-[var(--gray-200)] rounded-lg text-sm outline-none focus:border-[var(--orange)]" />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[var(--gray-500)] mb-1">Adresse</label>
                  <textarea value={clientAdresse} onChange={e => { setClientAdresse(e.target.value); triggerAutoSave() }} placeholder="Rue, NPA Ville" rows={2}
                    className="w-full py-2 px-3 border border-[var(--gray-200)] rounded-lg text-sm outline-none focus:border-[var(--orange)] resize-y" />
                </div>
              </div>
            </div>

            {/* Line items */}
            <div className="bg-white rounded-[var(--radius)] border border-[var(--gray-200)] p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-sora font-bold text-sm flex items-center gap-2">
                  <svg className="w-4 h-4 text-[var(--gray-500)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
                  Prestations
                </h3>
                <button onClick={() => setShowPicker(true)} className="text-[11px] font-bold py-1 px-3 rounded-md bg-[var(--gray-100)] text-[var(--gray-700)] border-none cursor-pointer hover:bg-[var(--gray-200)] transition-colors">
                  Catalogue
                </button>
              </div>

              {/* Header row */}
              <div className="grid gap-2 grid-cols-[1fr_60px_80px_80px_70px_32px] text-[10px] font-bold text-[var(--gray-500)] uppercase tracking-wider pb-2 border-b border-[var(--gray-100)] mb-2 max-[600px]:hidden">
                <span>Description</span><span>Qté</span><span>Unité</span><span>Prix unit.</span><span>Total</span><span></span>
              </div>

              {/* Lines */}
              {lineItems.map(l => (
                <div key={l.id} className="grid gap-2 grid-cols-[1fr_60px_80px_80px_70px_32px] items-center py-2 border-b border-[var(--gray-100)] last:border-0 max-[600px]:grid-cols-2 max-[600px]:gap-1.5">
                  <input type="text" value={l.description} onChange={e => updateLine(l.id, 'description', e.target.value)} placeholder="Description"
                    className="py-1.5 px-2 border border-[var(--gray-200)] rounded text-sm outline-none focus:border-[var(--orange)] max-[600px]:col-span-2" />
                  <input type="number" value={l.quantite} onChange={e => updateLine(l.id, 'quantite', e.target.value)} min={0} step={0.5}
                    className="py-1.5 px-2 border border-[var(--gray-200)] rounded text-sm outline-none focus:border-[var(--orange)] text-center" />
                  <select value={l.unite} onChange={e => updateLine(l.id, 'unite', e.target.value)}
                    className="py-1.5 px-1 border border-[var(--gray-200)] rounded text-xs outline-none">
                    {UNITES.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
                  </select>
                  <input type="number" value={l.prix_unitaire} onChange={e => updateLine(l.id, 'prix_unitaire', e.target.value)} min={0} step={0.5}
                    className="py-1.5 px-2 border border-[var(--gray-200)] rounded text-sm outline-none focus:border-[var(--orange)] text-right" />
                  <div className="text-sm font-semibold text-right pr-1">{l.total.toFixed(2)}</div>
                  <button onClick={() => removeLine(l.id)} className="w-7 h-7 rounded flex items-center justify-center text-[var(--gray-500)] hover:text-[var(--red)] hover:bg-[var(--red-light)] border-none bg-transparent cursor-pointer transition-colors">
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                </div>
              ))}

              <button onClick={() => addLine()} className="flex items-center gap-1.5 mt-3 text-xs font-semibold text-[var(--orange)] border-none bg-transparent cursor-pointer hover:underline">
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Ajouter une ligne
              </button>
            </div>

            {/* Notes */}
            <div className="bg-white rounded-[var(--radius)] border border-[var(--gray-200)] p-5">
              <h3 className="font-sora font-bold text-sm mb-3 flex items-center gap-2">
                <svg className="w-4 h-4 text-[var(--gray-500)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                Notes et conditions
              </h3>
              <label className="block text-[11px] font-semibold text-[var(--gray-500)] mb-1">Notes (visibles sur le document)</label>
              <textarea value={notes} onChange={e => { setNotes(e.target.value); triggerAutoSave() }} rows={2} placeholder="Ex: Matériel fourni par le client..."
                className="w-full py-2 px-3 border border-[var(--gray-200)] rounded-lg text-sm outline-none focus:border-[var(--orange)] resize-y mb-1" />
            </div>
          </div>

          {/* Sidebar */}
          <div className="flex flex-col gap-4">
            {/* Dates */}
            <div className="bg-white rounded-[var(--radius)] border border-[var(--gray-200)] p-5">
              <h3 className="font-sora font-bold text-sm mb-3 flex items-center gap-2">
                <svg className="w-4 h-4 text-[var(--gray-500)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                Dates
              </h3>
              <div className="mb-3">
                <label className="block text-[11px] font-semibold text-[var(--gray-500)] mb-1">Date d&apos;émission</label>
                <input type="date" value={dateEmission} onChange={e => { setDateEmission(e.target.value); triggerAutoSave() }}
                  className="w-full py-2 px-3 border border-[var(--gray-200)] rounded-lg text-sm outline-none focus:border-[var(--orange)]" />
              </div>
              {!isDevis && (
                <div>
                  <label className="block text-[11px] font-semibold text-[var(--gray-500)] mb-1">Date d&apos;échéance</label>
                  <input type="date" value={dateEcheance} onChange={e => { setDateEcheance(e.target.value); triggerAutoSave() }}
                    className="w-full py-2 px-3 border border-[var(--gray-200)] rounded-lg text-sm outline-none focus:border-[var(--orange)]" />
                </div>
              )}
            </div>

            {/* Totals */}
            <div className="bg-white rounded-[var(--radius)] border border-[var(--gray-200)] p-5">
              <div className="flex justify-between items-center py-2 text-sm">
                <span className="text-[var(--gray-500)]">Sous-total</span>
                <span className="font-semibold">{formatCHF(sousTotal)}</span>
              </div>
              <div className="flex justify-between items-center py-2 text-sm border-t border-[var(--gray-100)]">
                <div className="flex items-center gap-2">
                  <select value={remiseType} onChange={e => { setRemiseType(e.target.value); triggerAutoSave() }}
                    className="py-1 px-2 rounded text-xs border border-[var(--gray-200)] outline-none">
                    <option value="aucune">Pas de remise</option>
                    <option value="pourcentage">Remise %</option>
                    <option value="montant">Remise CHF</option>
                  </select>
                  {remiseType !== 'aucune' && (
                    <input type="number" value={remiseValeur} onChange={e => { setRemiseValeur(parseFloat(e.target.value) || 0); triggerAutoSave() }}
                      min={0} step={0.5} className="w-16 py-1 px-2 rounded text-xs border border-[var(--gray-200)] outline-none text-right" />
                  )}
                </div>
                {remiseType !== 'aucune' && <span className="font-semibold text-[var(--red)]">-{formatCHF(montantRemise)}</span>}
              </div>
              <div className="flex justify-between items-center py-2 text-sm border-t border-[var(--gray-100)]">
                <div className="flex items-center gap-2">
                  <span className="text-[var(--gray-500)]">TVA</span>
                  <select value={tauxTva} onChange={e => { setTauxTva(parseFloat(e.target.value)); triggerAutoSave() }}
                    className="py-0.5 px-1.5 rounded text-[11px] border border-[var(--gray-200)] outline-none">
                    {TVA_RATES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                </div>
                <span className="font-semibold">{formatCHF(montantTva)}</span>
              </div>
              <div className="flex justify-between items-center py-3 text-base font-bold border-t-2 border-[var(--dark)] mt-1">
                <span>Total TTC</span>
                <span className="font-sora">{formatCHF(totalTtc)}</span>
              </div>
            </div>

            {/* Status Actions */}
            <div className="bg-white rounded-[var(--radius)] border border-[var(--gray-200)] p-5">
              <h3 className="font-sora font-bold text-sm mb-3 flex items-center gap-2">
                <svg className="w-4 h-4 text-[var(--gray-500)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                Actions
              </h3>
              <div className="flex flex-col gap-2">
                {isDevis ? (
                  <>
                    {editingDoc.statut === 'brouillon' && (
                      <button onClick={() => setStatus('envoye')} className="w-full py-2 rounded-lg text-sm font-semibold bg-[var(--blue-light)] text-[var(--blue)] border-none cursor-pointer hover:brightness-95 transition-all">Marquer comme envoyé</button>
                    )}
                    {editingDoc.statut === 'envoye' && (
                      <>
                        <button onClick={() => setStatus('accepte')} className="w-full py-2 rounded-lg text-sm font-semibold bg-[var(--green-light)] text-[var(--green)] border-none cursor-pointer hover:brightness-95 transition-all">Marquer comme accepté</button>
                        <button onClick={() => setStatus('refuse')} className="w-full py-2 rounded-lg text-sm font-semibold bg-[var(--red-light)] text-[var(--red)] border-none cursor-pointer hover:brightness-95 transition-all">Marquer comme refusé</button>
                      </>
                    )}
                    {editingDoc.statut === 'accepte' && (
                      <button onClick={convertToFacture} className="w-full py-2.5 rounded-lg text-sm font-bold bg-[var(--orange)] text-white border-none cursor-pointer hover:bg-[var(--orange-dark)] transition-colors flex items-center justify-center gap-2">
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 014-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 01-4 4H3"/></svg>
                        Convertir en facture
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    {editingDoc.statut === 'brouillon' && (
                      <button onClick={() => setStatus('envoyee')} className="w-full py-2 rounded-lg text-sm font-semibold bg-[var(--blue-light)] text-[var(--blue)] border-none cursor-pointer hover:brightness-95 transition-all">Marquer comme envoyée</button>
                    )}
                    {editingDoc.statut === 'envoyee' && (
                      <>
                        <button onClick={() => setStatus('payee')} className="w-full py-2 rounded-lg text-sm font-semibold bg-[var(--green-light)] text-[var(--green)] border-none cursor-pointer hover:brightness-95 transition-all">Marquer comme payée</button>
                        <button onClick={() => setStatus('en_retard')} className="w-full py-2 rounded-lg text-sm font-semibold bg-[var(--red-light)] text-[var(--red)] border-none cursor-pointer hover:brightness-95 transition-all">Marquer en retard</button>
                      </>
                    )}
                    {editingDoc.statut === 'en_retard' && (
                      <button onClick={() => setStatus('payee')} className="w-full py-2 rounded-lg text-sm font-semibold bg-[var(--green-light)] text-[var(--green)] border-none cursor-pointer hover:brightness-95 transition-all">Marquer comme payée</button>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Preview Modal */}
        {showPreview && (
          <div className="fixed inset-0 z-[200] bg-black/50 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) setShowPreview(false) }}>
            <div className="bg-white rounded-[var(--radius)] w-full max-w-[740px] max-h-[90vh] overflow-y-auto">
              <div className="p-8 max-[600px]:p-5">
                {/* Company header */}
                <div className="flex justify-between items-start mb-8 max-[600px]:flex-col max-[600px]:gap-4">
                  <div>
                    <div className="font-sora text-xl font-extrabold text-[var(--dark)]">{profile?.entreprise || `${profile?.prenom || ''} ${profile?.nom || ''}`.trim()}</div>
                    {profile?.adresse && <div className="text-sm text-[var(--gray-500)] mt-1">{profile.adresse}</div>}
                    {profile?.telephone && <div className="text-sm text-[var(--gray-500)]">{profile.telephone}</div>}
                    {profile?.email && <div className="text-sm text-[var(--gray-500)]">{profile.email}</div>}
                  </div>
                  <div className="text-right max-[600px]:text-left">
                    <div className={`inline-block py-1 px-3 rounded text-sm font-bold uppercase ${isDevis ? 'bg-[rgba(232,112,10,0.1)] text-[var(--orange)]' : 'bg-[var(--blue-light)] text-[var(--blue)]'}`}>
                      {isDevis ? 'DEVIS' : 'FACTURE'}
                    </div>
                    <div className="font-sora font-bold text-base mt-2">{editingDoc.numero}</div>
                    <div className="text-xs text-[var(--gray-500)] mt-1">Date : {formatDate(dateEmission)}</div>
                    {dateEcheance && <div className="text-xs text-[var(--gray-500)]">Échéance : {formatDate(dateEcheance)}</div>}
                  </div>
                </div>

                {/* Client */}
                <div className="bg-[var(--gray-50)] p-4 rounded-lg mb-6">
                  <div className="text-[10px] font-bold uppercase text-[var(--gray-500)] mb-1">Client</div>
                  <div className="font-semibold text-sm">{clientNom || '—'}</div>
                  {clientAdresse && <div className="text-sm text-[var(--gray-700)]">{clientAdresse}</div>}
                  {clientEmail && <div className="text-sm text-[var(--gray-500)]">{clientEmail}</div>}
                  {clientTelephone && <div className="text-sm text-[var(--gray-500)]">{clientTelephone}</div>}
                </div>

                {/* Table */}
                <table className="w-full border-collapse mb-6 text-sm">
                  <thead>
                    <tr className="border-b-2 border-[var(--dark)]">
                      <th className="text-left py-2 text-[11px] font-bold uppercase text-[var(--gray-500)]">Description</th>
                      <th className="text-center py-2 text-[11px] font-bold uppercase text-[var(--gray-500)] w-16">Qté</th>
                      <th className="text-center py-2 text-[11px] font-bold uppercase text-[var(--gray-500)] w-16">Unité</th>
                      <th className="text-right py-2 text-[11px] font-bold uppercase text-[var(--gray-500)] w-20">Prix</th>
                      <th className="text-right py-2 text-[11px] font-bold uppercase text-[var(--gray-500)] w-20">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lineItems.map(l => (
                      <tr key={l.id} className="border-b border-[var(--gray-100)]">
                        <td className="py-2.5">{l.description || '—'}</td>
                        <td className="text-center py-2.5">{l.quantite}</td>
                        <td className="text-center py-2.5">{UNITES.find(u => u.value === l.unite)?.label || l.unite}</td>
                        <td className="text-right py-2.5">{l.prix_unitaire.toFixed(2)}</td>
                        <td className="text-right py-2.5 font-semibold">{l.total.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Totals */}
                <div className="flex justify-end mb-6">
                  <div className="w-64">
                    <div className="flex justify-between py-1.5 text-sm"><span className="text-[var(--gray-500)]">Sous-total</span><span>{formatCHF(sousTotal)}</span></div>
                    {montantRemise > 0 && <div className="flex justify-between py-1.5 text-sm"><span className="text-[var(--gray-500)]">Remise</span><span className="text-[var(--red)]">-{formatCHF(montantRemise)}</span></div>}
                    <div className="flex justify-between py-1.5 text-sm"><span className="text-[var(--gray-500)]">TVA {tauxTva}%</span><span>{formatCHF(montantTva)}</span></div>
                    <div className="flex justify-between py-2 text-base font-bold border-t-2 border-[var(--dark)] mt-1"><span>Total TTC</span><span>{formatCHF(totalTtc)}</span></div>
                  </div>
                </div>

                {/* Notes */}
                {notes && (
                  <div className="bg-[var(--gray-50)] p-4 rounded-lg text-sm text-[var(--gray-700)]">
                    <div className="text-[10px] font-bold uppercase text-[var(--gray-500)] mb-1">Notes</div>
                    {notes}
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 p-4 border-t border-[var(--gray-200)]">
                <button onClick={() => setShowPreview(false)} className="py-2.5 px-5 rounded-full text-sm font-semibold bg-[var(--gray-100)] text-[var(--gray-500)] border-none cursor-pointer">Fermer</button>
                <button onClick={pdfFromEditor} className="py-2.5 px-5 rounded-full text-sm font-semibold bg-[var(--orange)] text-white border-none cursor-pointer hover:bg-[var(--orange-dark)]">Télécharger PDF</button>
              </div>
            </div>
          </div>
        )}

        {/* Picker Modal */}
        {showPicker && (
          <div className="fixed inset-0 z-[200] bg-black/50 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) { setShowPicker(false); setPickerSelected(new Set()) } }}>
            <div className="bg-white rounded-[var(--radius)] w-full max-w-[520px] p-6">
              <h3 className="font-sora font-bold text-lg mb-1">Ajouter depuis le catalogue</h3>
              <p className="text-sm text-[var(--gray-500)] mb-4">Sélectionnez les prestations à ajouter.</p>
              {prestations.length === 0 ? (
                <p className="text-center text-[var(--gray-500)] py-5 text-sm">Aucune prestation dans le catalogue. Ajoutez-en d&apos;abord.</p>
              ) : (
                <div className="flex flex-col gap-1 max-h-[300px] overflow-y-auto mb-4">
                  {prestations.map(p => (
                    <label key={p.id} onClick={() => setPickerSelected(prev => { const s = new Set(prev); s.has(p.id) ? s.delete(p.id) : s.add(p.id); return s })}
                      className={`flex items-center justify-between p-3 rounded-lg cursor-pointer transition-all border-2 ${pickerSelected.has(p.id) ? 'border-[var(--orange)] bg-[rgba(232,112,10,0.04)]' : 'border-[var(--gray-100)] hover:border-[var(--gray-200)]'}`}>
                      <span className="font-semibold text-sm">{p.nom}</span>
                      <span className="text-xs text-[var(--gray-500)]">{formatCHF(p.prix)}/{p.unite}</span>
                    </label>
                  ))}
                </div>
              )}
              <div className="flex gap-3 justify-end">
                <button onClick={() => { setShowPicker(false); setPickerSelected(new Set()) }} className="py-2.5 px-5 rounded-full text-sm font-semibold bg-[var(--gray-100)] text-[var(--gray-500)] border-none cursor-pointer">Annuler</button>
                <button onClick={confirmPicker} className="py-2.5 px-5 rounded-full text-sm font-semibold bg-[var(--orange)] text-white border-none cursor-pointer hover:bg-[var(--orange-dark)]">Ajouter</button>
              </div>
            </div>
          </div>
        )}

        {/* Toast */}
        {toast && (
          <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[300] flex items-center gap-2 py-3 px-5 rounded-full text-sm font-semibold text-white shadow-lg ${toast.type === 'success' ? 'bg-[var(--green)]' : 'bg-[var(--red)]'}`}>
            {toast.type === 'success' ? <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg> : <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>}
            {toast.msg}
          </div>
        )}
      </>
    )
  }

  // ===== VIEW: CATALOGUE =====
  if (viewMode === 'catalogue') {
    return (
      <>
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <button onClick={() => setViewMode('list')} className="flex items-center gap-1 text-sm text-[var(--gray-500)] font-medium border-none bg-transparent cursor-pointer hover:text-[var(--dark)] transition-colors">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
              Retour
            </button>
            <h2 className="font-sora text-lg font-bold">Catalogue de prestations</h2>
          </div>
          <button onClick={() => openCatForm()} className="flex items-center gap-1.5 py-2 px-4 rounded-full text-sm font-bold bg-[var(--orange)] text-white border-none cursor-pointer hover:bg-[var(--orange-dark)] transition-colors">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Ajouter
          </button>
        </div>

        <div className="bg-white rounded-[var(--radius)] border border-[var(--gray-200)] overflow-hidden">
          {/* Add/Edit Form */}
          {catFormOpen && (
            <div className="p-5 border-b border-[var(--gray-200)] bg-[var(--gray-50)]">
              <div className="grid grid-cols-2 gap-3 mb-3 max-[600px]:grid-cols-1">
                <div>
                  <label className="block text-[11px] font-semibold text-[var(--gray-500)] mb-1">Nom</label>
                  <input type="text" value={catNom} onChange={e => setCatNom(e.target.value)} placeholder="Ex: Main d'oeuvre"
                    className="w-full py-2 px-3 border border-[var(--gray-200)] rounded-lg text-sm outline-none focus:border-[var(--orange)]" />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[var(--gray-500)] mb-1">Prix</label>
                  <input type="number" value={catPrix} onChange={e => setCatPrix(e.target.value)} placeholder="0.00" min={0} step={0.5}
                    className="w-full py-2 px-3 border border-[var(--gray-200)] rounded-lg text-sm outline-none focus:border-[var(--orange)]" />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[var(--gray-500)] mb-1">Unité</label>
                  <select value={catUnite} onChange={e => setCatUnite(e.target.value)}
                    className="w-full py-2 px-3 border border-[var(--gray-200)] rounded-lg text-sm outline-none">
                    {UNITES.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[var(--gray-500)] mb-1">Description (optionnel)</label>
                  <input type="text" value={catDesc} onChange={e => setCatDesc(e.target.value)} placeholder="Description courte"
                    className="w-full py-2 px-3 border border-[var(--gray-200)] rounded-lg text-sm outline-none focus:border-[var(--orange)]" />
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setCatFormOpen(false)} className="text-sm font-semibold py-2 px-4 rounded-full bg-[var(--gray-100)] text-[var(--gray-500)] border-none cursor-pointer">Annuler</button>
                <button onClick={saveCatForm} className="text-sm font-semibold py-2 px-4 rounded-full bg-[var(--orange)] text-white border-none cursor-pointer hover:bg-[var(--orange-dark)]">Enregistrer</button>
              </div>
            </div>
          )}

          {/* List */}
          {prestations.length === 0 ? (
            <div className="text-center py-16 px-6">
              <svg className="w-12 h-12 mx-auto text-[var(--gray-300)] mb-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>
              <h3 className="font-sora font-bold text-base mb-2">Catalogue vide</h3>
              <p className="text-sm text-[var(--gray-500)] mb-4">Ajoutez vos prestations courantes pour les réutiliser facilement.</p>
              <button onClick={() => openCatForm()} className="py-2.5 px-5 rounded-full text-sm font-bold bg-[var(--orange)] text-white border-none cursor-pointer hover:bg-[var(--orange-dark)]">Ajouter une prestation</button>
            </div>
          ) : (
            prestations.map(p => (
              <div key={p.id} className="flex items-center gap-4 p-4 border-b border-[var(--gray-100)] last:border-0 hover:bg-[var(--gray-50)] transition-colors max-[600px]:flex-col max-[600px]:items-start max-[600px]:gap-2">
                <div className="w-9 h-9 rounded-xl bg-[rgba(232,112,10,0.1)] flex items-center justify-center shrink-0">
                  <svg className="w-4 h-4 text-[var(--orange)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm text-[var(--dark)]">{p.nom}</div>
                  {p.description && <div className="text-xs text-[var(--gray-500)] truncate">{p.description}</div>}
                </div>
                <span className="text-xs text-[var(--gray-500)] shrink-0">/{p.unite}</span>
                <span className="font-sora font-bold text-sm text-[var(--dark)] shrink-0">{formatCHF(p.prix)}</span>
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => openCatForm(p)} className="text-[10px] font-bold py-1 px-2.5 rounded-md bg-[var(--gray-100)] text-[var(--gray-700)] border-none cursor-pointer hover:bg-[var(--gray-200)] transition-colors">Modifier</button>
                  <button onClick={() => deletePrest(p.id)} className="text-[10px] font-bold py-1 px-2.5 rounded-md bg-[var(--red-light)] text-[var(--red)] border-none cursor-pointer hover:bg-[rgba(211,47,47,0.12)] transition-colors">
                    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Toast */}
        {toast && (
          <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[300] flex items-center gap-2 py-3 px-5 rounded-full text-sm font-semibold text-white shadow-lg ${toast.type === 'success' ? 'bg-[var(--green)]' : 'bg-[var(--red)]'}`}>
            {toast.type === 'success' ? <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg> : <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>}
            {toast.msg}
          </div>
        )}
      </>
    )
  }

  return null
}
