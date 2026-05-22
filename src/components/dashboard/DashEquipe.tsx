'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  getEmployes, addEmploye, updateEmploye, deleteEmploye,
  getAffectations, addAffectation, updateAffectation, deleteAffectation,
} from '@/lib/supabase/helpers'
import type { Employe, Affectation, Demande } from '@/lib/supabase/helpers'
import { logger } from '@/lib/logger'

// ===== Constants =====

const TEAM_COLORS = ['#2E7D32','#1565C0','#E65100','#6A1B9A','#C62828','#00838F','#4E342E','#37474F']
const HOUR_START = 7
const HOUR_END = 19
const HOURS = Array.from({ length: HOUR_END - HOUR_START }, (_, i) => HOUR_START + i)
const JOUR_NOMS = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi']
const MOIS_NOMS = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre']
const JOUR_COURTS = ['Lun','Mar','Mer','Jeu','Ven','Sam','Dim']

// ===== Helpers =====

function formatDateISO(d: Date): string {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
}

function getMonday(d: Date): Date {
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  const monday = new Date(d)
  monday.setDate(diff)
  monday.setHours(0, 0, 0, 0)
  return monday
}

function timeToMinutes(timeStr: string): number {
  const parts = timeStr.split(':')
  return parseInt(parts[0]) * 60 + parseInt(parts[1])
}

function getInitials(prenom: string, nom?: string): string {
  return (prenom[0] || '').toUpperCase() + (nom ? nom[0].toUpperCase() : '')
}

function getDateLabel(date: Date, view: 'day' | 'week'): string {
  if (view === 'day') {
    return JOUR_NOMS[date.getDay()] + ' ' + date.getDate() + ' ' + MOIS_NOMS[date.getMonth()] + ' ' + date.getFullYear()
  }
  const monday = getMonday(new Date(date))
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  return 'Semaine du ' + monday.getDate() + ' ' + MOIS_NOMS[monday.getMonth()] + ' au ' + sunday.getDate() + ' ' + MOIS_NOMS[sunday.getMonth()]
}

// ===== Types =====

type EmpFormData = {
  prenom: string
  nom: string
  telephone: string
  email: string
  poste: string
  couleur: string
}

type AffPopupData = {
  titre: string
  employe_id: string
  date: string
  heure_debut: string
  heure_fin: string
  adresse: string
  notes: string
  demande_id: string
}

const emptyEmpForm: EmpFormData = { prenom: '', nom: '', telephone: '', email: '', poste: '', couleur: TEAM_COLORS[0] }
const emptyAffData: AffPopupData = { titre: '', employe_id: '', date: '', heure_debut: '08:00', heure_fin: '12:00', adresse: '', notes: '', demande_id: '' }

type Props = {
  userId: string
  demandes: Demande[]
}

// ===== Component =====

export default function DashEquipe({ userId, demandes }: Props) {
  const supabase = useMemo(() => createClient(), [])

  // Data
  const [employees, setEmployees] = useState<Employe[]>([])
  const [affectations, setAffectations] = useState<Affectation[]>([])
  const [loading, setLoading] = useState(true)

  // Timeline state
  const [currentDate, setCurrentDate] = useState(new Date())
  const [view, setView] = useState<'day' | 'week'>('day')

  // Employee form
  const [showForm, setShowForm] = useState(false)
  const [editingEmpId, setEditingEmpId] = useState<string | null>(null)
  const [formData, setFormData] = useState<EmpFormData>(emptyEmpForm)

  // Affectation popup
  const [affPopup, setAffPopup] = useState<{ open: boolean; editId: string | null; data: AffPopupData }>({ open: false, editId: null, data: emptyAffData })

  // ===== Date range =====

  const getDateRange = useCallback((d: Date, v: 'day' | 'week') => {
    if (v === 'day') {
      const ds = formatDateISO(d)
      return { start: ds, end: ds }
    }
    const monday = getMonday(new Date(d))
    const sunday = new Date(monday)
    sunday.setDate(monday.getDate() + 6)
    return { start: formatDateISO(monday), end: formatDateISO(sunday) }
  }, [])

  // ===== Data loading =====

  const loadData = useCallback(async () => {
    try {
      const emps = await getEmployes(supabase, userId)
      setEmployees(emps)
      const range = getDateRange(currentDate, view)
      const affs = await getAffectations(supabase, userId, range.start, range.end)
      setAffectations(affs)
    } catch (e) {
      logger.error('Erreur chargement équipe:', e)
    } finally {
      setLoading(false)
    }
  }, [supabase, userId, currentDate, view, getDateRange])

  const reloadAffectations = useCallback(async () => {
    const range = getDateRange(currentDate, view)
    try {
      const affs = await getAffectations(supabase, userId, range.start, range.end)
      setAffectations(affs)
    } catch (e) {
      logger.error(e)
    }
  }, [supabase, userId, currentDate, view, getDateRange])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { loadData() }, [loadData])

  // ===== Employee CRUD =====

  const openAddForm = () => {
    setEditingEmpId(null)
    setFormData(emptyEmpForm)
    setShowForm(true)
  }

  const openEditForm = (emp: Employe) => {
    setEditingEmpId(emp.id)
    setFormData({
      prenom: emp.prenom || '',
      nom: emp.nom || '',
      telephone: emp.telephone || '',
      email: emp.email || '',
      poste: emp.poste || '',
      couleur: emp.couleur || TEAM_COLORS[0],
    })
    setShowForm(true)
  }

  const saveEmployee = async () => {
    if (!formData.prenom.trim()) { alert('Le prénom est requis.'); return }
    const payload: Partial<Employe> = {
      prenom: formData.prenom.trim(),
      nom: formData.nom.trim(),
      telephone: formData.telephone.trim(),
      email: formData.email.trim(),
      poste: formData.poste.trim(),
      couleur: formData.couleur,
    }
    try {
      if (editingEmpId) {
        await updateEmploye(supabase, editingEmpId, payload)
      } else {
        await addEmploye(supabase, { ...payload, artisan_id: userId })
      }
      setShowForm(false)
      setEditingEmpId(null)
      await loadData()
    } catch (e: unknown) {
      alert('Erreur: ' + (e instanceof Error ? e.message : e))
    }
  }

  const removeEmployee = async (id: string) => {
    if (!confirm('Supprimer cet employé ? Ses affectations futures seront aussi supprimées.')) return
    try {
      await deleteEmploye(supabase, id)
      await loadData()
    } catch (e: unknown) {
      alert('Erreur: ' + (e instanceof Error ? e.message : e))
    }
  }

  // ===== Date navigation =====

  const navigateDate = (dir: number) => {
    setCurrentDate(prev => {
      const next = new Date(prev)
      next.setDate(next.getDate() + (view === 'day' ? dir : dir * 7))
      return next
    })
  }

  const goToday = () => setCurrentDate(new Date())

  const switchView = (v: 'day' | 'week') => setView(v)

  // ===== Affectation popup =====

  const openNewAffect = (empId: string, date: string, hour: number) => {
    const endHour = Math.min(hour + 2, HOUR_END)
    setAffPopup({
      open: true,
      editId: null,
      data: {
        titre: '',
        employe_id: empId,
        date,
        heure_debut: String(hour).padStart(2, '0') + ':00',
        heure_fin: String(endHour).padStart(2, '0') + ':00',
        adresse: '',
        notes: '',
        demande_id: '',
      },
    })
  }

  const openEditAffect = (aff: Affectation) => {
    setAffPopup({
      open: true,
      editId: aff.id,
      data: {
        titre: aff.titre || '',
        employe_id: aff.employe_id || '',
        date: aff.date_debut || '',
        heure_debut: aff.heure_debut ? aff.heure_debut.substring(0, 5) : '',
        heure_fin: aff.heure_fin ? aff.heure_fin.substring(0, 5) : '',
        adresse: aff.adresse || '',
        notes: aff.notes || '',
        demande_id: aff.demande_id || '',
      },
    })
  }

  const closePopup = () => setAffPopup({ open: false, editId: null, data: emptyAffData })

  const checkOverlap = (empId: string, date: string, debut: string, fin: string, excludeId?: string | null): Affectation | undefined => {
    return affectations.find(a => {
      if (a.employe_id !== empId) return false
      if (a.date_debut !== date) return false
      if (excludeId && a.id === excludeId) return false
      const aStart = a.heure_debut.substring(0, 5)
      const aEnd = a.heure_fin.substring(0, 5)
      return debut < aEnd && fin > aStart
    })
  }

  const saveAffectation = async () => {
    const { titre, employe_id, date, heure_debut, heure_fin, adresse, notes, demande_id } = affPopup.data
    if (!titre.trim()) { alert('Le titre est requis.'); return }
    if (!employe_id) { alert('Sélectionnez un employé.'); return }
    if (!date) { alert('La date est requise.'); return }
    if (!heure_debut || !heure_fin) { alert('Les heures de début et fin sont requises.'); return }
    if (heure_fin <= heure_debut) { alert("L'heure de fin doit être après l'heure de début."); return }

    const overlap = checkOverlap(employe_id, date, heure_debut, heure_fin, affPopup.editId)
    if (overlap) {
      alert('Conflit : ' + (overlap.titre || 'une affectation') + ' occupe déjà ce créneau pour cet employé.')
      return
    }

    const payload: Partial<Affectation> = {
      titre: titre.trim(),
      employe_id,
      date_debut: date,
      heure_debut,
      heure_fin,
      adresse: adresse.trim(),
      notes: notes.trim(),
      demande_id: demande_id || null,
    }

    try {
      if (affPopup.editId) {
        await updateAffectation(supabase, affPopup.editId, payload)
      } else {
        await addAffectation(supabase, { ...payload, artisan_id: userId })
      }
      closePopup()
      await reloadAffectations()
    } catch (e: unknown) {
      alert('Erreur: ' + (e instanceof Error ? e.message : e))
    }
  }

  const removeAffectation = async () => {
    if (!affPopup.editId) return
    if (!confirm('Supprimer cette affectation ?')) return
    try {
      await deleteAffectation(supabase, affPopup.editId)
      closePopup()
      await reloadAffectations()
    } catch (e: unknown) {
      alert('Erreur: ' + (e instanceof Error ? e.message : e))
    }
  }

  // ===== Active demandes for linking =====

  const activeDemandes = useMemo(() => {
    return demandes.filter(d => d.statut !== 'refusee').slice(0, 20)
  }, [demandes])

  // ===== Render =====

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-3 border-[var(--gray-200)] border-t-[var(--orange)] rounded-full animate-spin" />
      </div>
    )
  }

  const todayStr = formatDateISO(currentDate)

  return (
    <div className="grid grid-cols-[280px_1fr] gap-6 max-[900px]:grid-cols-1">
      {/* ===== SIDEBAR ===== */}
      <div className="bg-white rounded-[var(--radius)] border border-[var(--gray-200)] p-5 h-fit max-[900px]:order-1">
        {/* Header */}
        <div className="flex justify-between items-center mb-4">
          <span className="font-sora text-base font-bold">Mon équipe</span>
          <button
            onClick={openAddForm}
            className="bg-[var(--orange)] text-white border-none rounded-full px-3.5 py-1.5 text-xs font-bold cursor-pointer font-sora transition-all hover:bg-[var(--orange-dark)] hover:-translate-y-px"
          >
            + Ajouter
          </button>
        </div>

        {/* Employee list */}
        <div className="flex flex-col gap-2">
          {employees.length === 0 && !showForm && (
            <div className="text-center py-15 text-[var(--gray-500)]">
              <svg className="w-12 h-12 text-[var(--gray-300)] mx-auto mb-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 00-3-3.87" />
                <path d="M16 3.13a4 4 0 010 7.75" />
              </svg>
              <p className="text-[13px] m-0">Ajoutez vos employés pour gérer leur planning</p>
            </div>
          )}
          {employees.map(emp => (
            <div
              key={emp.id}
              className="group flex items-center gap-3 px-3 py-2.5 rounded-[10px] cursor-pointer transition-all border border-transparent hover:bg-[var(--gray-100)]"
            >
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center text-white font-sora font-extrabold text-[13px] shrink-0"
                style={{ background: emp.couleur }}
              >
                {getInitials(emp.prenom, emp.nom)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-[13px] whitespace-nowrap overflow-hidden text-ellipsis">
                  {emp.prenom}{emp.nom ? ' ' + emp.nom : ''}
                </div>
                {emp.poste && <div className="text-[11px] text-[var(--gray-500)]">{emp.poste}</div>}
              </div>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={(e) => { e.stopPropagation(); openEditForm(emp) }}
                  className="bg-transparent border-none cursor-pointer p-1 rounded-md text-[var(--gray-500)] transition-all hover:bg-[var(--gray-200)] hover:text-[var(--dark)]"
                  title="Modifier"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); removeEmployee(emp.id) }}
                  className="bg-transparent border-none cursor-pointer p-1 rounded-md text-[var(--gray-500)] transition-all hover:bg-[rgba(211,47,47,0.08)] hover:text-[var(--red)]"
                  title="Supprimer"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Add/Edit form */}
        {showForm && (
          <div className="bg-[var(--gray-100)] rounded-xl p-4 mt-3">
            <input
              type="text"
              placeholder="Prénom *"
              value={formData.prenom}
              onChange={e => setFormData(f => ({ ...f, prenom: e.target.value }))}
              className="w-full px-3 py-2 border border-[var(--gray-200)] rounded-lg text-[13px] mb-2 bg-white focus:outline-none focus:border-[var(--orange)] focus:shadow-[0_0_0_3px_rgba(232,112,10,0.08)]"
            />
            <input
              type="text"
              placeholder="Nom"
              value={formData.nom}
              onChange={e => setFormData(f => ({ ...f, nom: e.target.value }))}
              className="w-full px-3 py-2 border border-[var(--gray-200)] rounded-lg text-[13px] mb-2 bg-white focus:outline-none focus:border-[var(--orange)] focus:shadow-[0_0_0_3px_rgba(232,112,10,0.08)]"
            />
            <input
              type="text"
              placeholder="Poste (ex: Apprenti, Chef)"
              value={formData.poste}
              onChange={e => setFormData(f => ({ ...f, poste: e.target.value }))}
              className="w-full px-3 py-2 border border-[var(--gray-200)] rounded-lg text-[13px] mb-2 bg-white focus:outline-none focus:border-[var(--orange)] focus:shadow-[0_0_0_3px_rgba(232,112,10,0.08)]"
            />
            <input
              type="tel"
              placeholder="Téléphone"
              value={formData.telephone}
              onChange={e => setFormData(f => ({ ...f, telephone: e.target.value }))}
              className="w-full px-3 py-2 border border-[var(--gray-200)] rounded-lg text-[13px] mb-2 bg-white focus:outline-none focus:border-[var(--orange)] focus:shadow-[0_0_0_3px_rgba(232,112,10,0.08)]"
            />
            <input
              type="email"
              placeholder="Email"
              value={formData.email}
              onChange={e => setFormData(f => ({ ...f, email: e.target.value }))}
              className="w-full px-3 py-2 border border-[var(--gray-200)] rounded-lg text-[13px] mb-2 bg-white focus:outline-none focus:border-[var(--orange)] focus:shadow-[0_0_0_3px_rgba(232,112,10,0.08)]"
            />
            {/* Color picker */}
            <div className="flex gap-1.5 mb-3 flex-wrap">
              {TEAM_COLORS.map(c => (
                <div
                  key={c}
                  onClick={() => setFormData(f => ({ ...f, couleur: c }))}
                  className={`w-6 h-6 rounded-full cursor-pointer border-2 transition-all hover:scale-115 ${
                    c === formData.couleur
                      ? 'border-[var(--dark)] shadow-[0_0_0_2px_white,0_0_0_4px_var(--dark)]'
                      : 'border-transparent'
                  }`}
                  style={{ background: c }}
                />
              ))}
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => { setShowForm(false); setEditingEmpId(null) }}
                className="px-4 py-1.5 rounded-lg text-xs font-semibold cursor-pointer border-none bg-[var(--gray-200)] text-[var(--gray-700)] transition-all"
              >
                Annuler
              </button>
              <button
                onClick={saveEmployee}
                className="px-4 py-1.5 rounded-lg text-xs font-semibold cursor-pointer border-none bg-[var(--orange)] text-white transition-all hover:bg-[var(--orange-dark)]"
              >
                {editingEmpId ? 'Modifier' : 'Ajouter'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ===== TIMELINE ===== */}
      <div className="bg-white rounded-[var(--radius)] border border-[var(--gray-200)] overflow-hidden max-[900px]:order-2">
        {/* Timeline header */}
        <div className="px-5 py-4 flex justify-between items-center border-b border-[var(--gray-100)] max-[600px]:flex-col max-[600px]:gap-3">
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => navigateDate(-1)}
              className="w-8 h-8 rounded-lg border border-[var(--gray-200)] bg-white cursor-pointer flex items-center justify-center transition-all hover:bg-[var(--gray-100)]"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
            </button>
            <span className="font-sora text-sm font-bold min-w-[200px] text-center">{getDateLabel(currentDate, view)}</span>
            <button
              onClick={() => navigateDate(1)}
              className="w-8 h-8 rounded-lg border border-[var(--gray-200)] bg-white cursor-pointer flex items-center justify-center transition-all hover:bg-[var(--gray-100)]"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6" /></svg>
            </button>
            <button
              onClick={goToday}
              className="px-3.5 py-1.5 rounded-full border border-[var(--gray-200)] bg-white text-xs font-semibold cursor-pointer transition-all hover:bg-[var(--gray-100)]"
            >
              Aujourd&apos;hui
            </button>
          </div>
          <div className="flex gap-0.5 bg-[var(--gray-200)] p-[3px] rounded-lg">
            <button
              onClick={() => switchView('day')}
              className={`px-3.5 py-1.5 rounded-md text-xs font-semibold cursor-pointer border-none transition-all ${
                view === 'day' ? 'bg-white text-[var(--dark)] shadow-[0_1px_3px_rgba(0,0,0,0.08)]' : 'bg-transparent text-[var(--gray-500)]'
              }`}
            >
              Jour
            </button>
            <button
              onClick={() => switchView('week')}
              className={`px-3.5 py-1.5 rounded-md text-xs font-semibold cursor-pointer border-none transition-all ${
                view === 'week' ? 'bg-white text-[var(--dark)] shadow-[0_1px_3px_rgba(0,0,0,0.08)]' : 'bg-transparent text-[var(--gray-500)]'
              }`}
            >
              Semaine
            </button>
          </div>
        </div>

        {/* Timeline body */}
        <div className="overflow-x-auto">
          {employees.length === 0 ? (
            <div className="text-center py-15 px-5 text-[var(--gray-500)]">
              <svg className="w-12 h-12 text-[var(--gray-300)] mx-auto mb-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 00-3-3.87" />
                <path d="M16 3.13a4 4 0 010 7.75" />
              </svg>
              <p className="text-[13px] m-0">Ajoutez des employés pour voir leur planning ici</p>
            </div>
          ) : view === 'day' ? (
            <DayView
              employees={employees}
              affectations={affectations}
              todayStr={todayStr}
              onClickCell={openNewAffect}
              onClickBlock={openEditAffect}
            />
          ) : (
            <WeekView
              employees={employees}
              affectations={affectations}
              currentDate={currentDate}
              onClickCell={openNewAffect}
              onClickBlock={openEditAffect}
            />
          )}
        </div>
      </div>

      {/* ===== AFFECTATION POPUP ===== */}
      {affPopup.open && (
        <div
          className="fixed inset-0 bg-black/40 z-[200] flex items-center justify-center"
          onMouseDown={e => { if (e.target === e.currentTarget) closePopup() }}
        >
          <div className="bg-white rounded-2xl p-7 w-[440px] max-w-[90vw] max-h-[85vh] overflow-y-auto shadow-[0_20px_60px_rgba(0,0,0,0.15)] max-[600px]:p-5 max-[600px]:w-[95vw]">
            <div className="font-sora text-lg font-bold mb-5 flex items-center gap-2.5">
              <svg className="w-5 h-5 text-[var(--orange)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="4" width="18" height="18" rx="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              {affPopup.editId ? "Modifier l'affectation" : 'Nouvelle affectation'}
            </div>

            <label className="block text-xs font-semibold text-[var(--gray-600)] mb-1">Titre du chantier *</label>
            <input
              type="text"
              placeholder="Ex: Rénovation salle de bain"
              value={affPopup.data.titre}
              onChange={e => setAffPopup(p => ({ ...p, data: { ...p.data, titre: e.target.value } }))}
              className="w-full px-3.5 py-2.5 border border-[var(--gray-200)] rounded-[10px] text-[13px] mb-3.5 font-[DM_Sans,sans-serif] focus:outline-none focus:border-[var(--orange)] focus:shadow-[0_0_0_3px_rgba(232,112,10,0.08)]"
            />

            <label className="block text-xs font-semibold text-[var(--gray-600)] mb-1">Employé *</label>
            <select
              value={affPopup.data.employe_id}
              onChange={e => setAffPopup(p => ({ ...p, data: { ...p.data, employe_id: e.target.value } }))}
              className="w-full px-3.5 py-2.5 border border-[var(--gray-200)] rounded-[10px] text-[13px] mb-3.5 font-[DM_Sans,sans-serif] focus:outline-none focus:border-[var(--orange)] focus:shadow-[0_0_0_3px_rgba(232,112,10,0.08)]"
            >
              <option value="">Sélectionner un employé</option>
              {employees.map(emp => (
                <option key={emp.id} value={emp.id}>{emp.prenom}{emp.nom ? ' ' + emp.nom : ''}</option>
              ))}
            </select>

            <div className="grid grid-cols-2 gap-3 max-[600px]:grid-cols-1">
              <div>
                <label className="block text-xs font-semibold text-[var(--gray-600)] mb-1">Date</label>
                <input
                  type="date"
                  value={affPopup.data.date}
                  onChange={e => setAffPopup(p => ({ ...p, data: { ...p.data, date: e.target.value } }))}
                  className="w-full px-3.5 py-2.5 border border-[var(--gray-200)] rounded-[10px] text-[13px] mb-3.5 font-[DM_Sans,sans-serif] focus:outline-none focus:border-[var(--orange)] focus:shadow-[0_0_0_3px_rgba(232,112,10,0.08)]"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-[var(--gray-600)] mb-1">Début</label>
                  <input
                    type="time"
                    value={affPopup.data.heure_debut}
                    onChange={e => setAffPopup(p => ({ ...p, data: { ...p.data, heure_debut: e.target.value } }))}
                    className="w-full px-3.5 py-2.5 border border-[var(--gray-200)] rounded-[10px] text-[13px] mb-3.5 font-[DM_Sans,sans-serif] focus:outline-none focus:border-[var(--orange)] focus:shadow-[0_0_0_3px_rgba(232,112,10,0.08)]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--gray-600)] mb-1">Fin</label>
                  <input
                    type="time"
                    value={affPopup.data.heure_fin}
                    onChange={e => setAffPopup(p => ({ ...p, data: { ...p.data, heure_fin: e.target.value } }))}
                    className="w-full px-3.5 py-2.5 border border-[var(--gray-200)] rounded-[10px] text-[13px] mb-3.5 font-[DM_Sans,sans-serif] focus:outline-none focus:border-[var(--orange)] focus:shadow-[0_0_0_3px_rgba(232,112,10,0.08)]"
                  />
                </div>
              </div>
            </div>

            <label className="block text-xs font-semibold text-[var(--gray-600)] mb-1">Adresse</label>
            <input
              type="text"
              placeholder="Rue, ville (optionnel)"
              value={affPopup.data.adresse}
              onChange={e => setAffPopup(p => ({ ...p, data: { ...p.data, adresse: e.target.value } }))}
              className="w-full px-3.5 py-2.5 border border-[var(--gray-200)] rounded-[10px] text-[13px] mb-3.5 font-[DM_Sans,sans-serif] focus:outline-none focus:border-[var(--orange)] focus:shadow-[0_0_0_3px_rgba(232,112,10,0.08)]"
            />

            <label className="block text-xs font-semibold text-[var(--gray-600)] mb-1">Notes</label>
            <textarea
              placeholder="Instructions, matériel nécessaire..."
              value={affPopup.data.notes}
              onChange={e => setAffPopup(p => ({ ...p, data: { ...p.data, notes: e.target.value } }))}
              className="w-full px-3.5 py-2.5 border border-[var(--gray-200)] rounded-[10px] text-[13px] mb-3.5 font-[DM_Sans,sans-serif] resize-y min-h-[60px] focus:outline-none focus:border-[var(--orange)] focus:shadow-[0_0_0_3px_rgba(232,112,10,0.08)]"
            />

            <label className="block text-xs font-semibold text-[var(--gray-600)] mb-1">Lier à une demande</label>
            <select
              value={affPopup.data.demande_id}
              onChange={e => setAffPopup(p => ({ ...p, data: { ...p.data, demande_id: e.target.value } }))}
              className="w-full px-3.5 py-2.5 border border-[var(--gray-200)] rounded-[10px] text-[13px] mb-3.5 font-[DM_Sans,sans-serif] focus:outline-none focus:border-[var(--orange)] focus:shadow-[0_0_0_3px_rgba(232,112,10,0.08)]"
            >
              <option value="">Aucune demande liée</option>
              {activeDemandes.map(d => (
                <option key={d.id} value={d.id}>
                  {(d.client_nom || 'Client') + ' — ' + (d.message || '').substring(0, 30)}
                </option>
              ))}
            </select>

            <div className="flex justify-between mt-2">
              {affPopup.editId ? (
                <button
                  onClick={removeAffectation}
                  className="bg-transparent border-none text-[var(--red)] py-2.5 px-0 font-bold text-[13px] cursor-pointer font-sora hover:underline"
                >
                  Supprimer
                </button>
              ) : (
                <div />
              )}
              <div className="flex gap-2">
                <button
                  onClick={closePopup}
                  className="px-5 py-2.5 rounded-full font-bold text-[13px] cursor-pointer border-none bg-[var(--gray-200)] text-[var(--gray-700)] font-sora transition-all hover:bg-[var(--gray-300)]"
                >
                  Annuler
                </button>
                <button
                  onClick={saveAffectation}
                  className="px-5 py-2.5 rounded-full font-bold text-[13px] cursor-pointer border-none bg-[var(--orange)] text-white font-sora transition-all hover:bg-[var(--orange-dark)]"
                >
                  Enregistrer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ===== Day View Sub-component =====

function DayView({
  employees,
  affectations,
  todayStr,
  onClickCell,
  onClickBlock,
}: {
  employees: Employe[]
  affectations: Affectation[]
  todayStr: string
  onClickCell: (empId: string, date: string, hour: number) => void
  onClickBlock: (aff: Affectation) => void
}) {
  const totalMinutes = (HOUR_END - HOUR_START) * 60

  return (
    <div className="min-w-[900px]">
      {/* Hours header */}
      <div className="grid border-b border-[var(--gray-200)]" style={{ gridTemplateColumns: '160px repeat(12, 1fr)' }}>
        <div className="px-3 py-2 text-[10px] font-bold text-[var(--gray-400)] uppercase">Employé</div>
        {HOURS.map(h => (
          <div key={h} className="py-2 text-center text-[10px] font-semibold text-[var(--gray-400)] border-l border-[var(--gray-100)]">
            {h}h
          </div>
        ))}
      </div>

      {/* Employee rows */}
      {employees.map(emp => {
        const empAffs = affectations.filter(a => a.employe_id === emp.id && a.date_debut === todayStr)
        return (
          <div
            key={emp.id}
            className="grid border-b border-[var(--gray-50)] last:border-b-0"
            style={{ gridTemplateColumns: '160px 1fr', minHeight: '60px' }}
          >
            {/* Label */}
            <div className="flex items-center gap-2.5 px-4 py-2.5 border-r border-[var(--gray-100)]">
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-white font-sora font-extrabold text-[10px] shrink-0"
                style={{ background: emp.couleur }}
              >
                {getInitials(emp.prenom, emp.nom)}
              </div>
              <div className="text-xs font-semibold whitespace-nowrap overflow-hidden text-ellipsis">
                {emp.prenom}{emp.nom ? ' ' + emp.nom[0] + '.' : ''}
              </div>
            </div>

            {/* Timeline area */}
            <div className="relative grid" style={{ gridTemplateColumns: 'repeat(12, 1fr)' }}>
              {/* Hour cells */}
              {HOURS.map(h => (
                <div
                  key={h}
                  onClick={() => onClickCell(emp.id, todayStr, h)}
                  className="border-l border-[var(--gray-50)] min-h-[60px] cursor-pointer transition-colors hover:bg-[rgba(232,112,10,0.03)]"
                />
              ))}

              {/* Affectation blocks */}
              {empAffs.map(aff => {
                const startMin = timeToMinutes(aff.heure_debut)
                const endMin = timeToMinutes(aff.heure_fin)
                const gridStart = HOUR_START * 60
                let left = ((startMin - gridStart) / totalMinutes) * 100
                let width = ((endMin - startMin) / totalMinutes) * 100
                if (left < 0) left = 0
                if (left + width > 100) width = 100 - left
                const color = emp.couleur

                return (
                  <div
                    key={aff.id}
                    onClick={e => { e.stopPropagation(); onClickBlock(aff) }}
                    className="absolute top-1.5 bottom-1.5 rounded-md px-2 py-1 cursor-pointer flex flex-col justify-center overflow-hidden border-l-4 transition-all z-[2] hover:shadow-[0_4px_12px_rgba(0,0,0,0.12)] hover:-translate-y-px hover:z-[5]"
                    style={{
                      left: `${left}%`,
                      width: `${width}%`,
                      borderLeftColor: color,
                      background: color + '15',
                    }}
                  >
                    <div className="text-[11px] font-bold whitespace-nowrap overflow-hidden text-ellipsis" style={{ color }}>
                      {aff.titre}
                    </div>
                    <div className="text-[9px] opacity-70 whitespace-nowrap">
                      {aff.heure_debut.substring(0, 5)} - {aff.heure_fin.substring(0, 5)}
                    </div>
                    {aff.adresse && (
                      <div className="text-[9px] opacity-60 whitespace-nowrap overflow-hidden text-ellipsis">
                        {aff.adresse}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ===== Week View Sub-component =====

function WeekView({
  employees,
  affectations,
  currentDate,
  onClickCell,
  onClickBlock,
}: {
  employees: Employe[]
  affectations: Affectation[]
  currentDate: Date
  onClickCell: (empId: string, date: string, hour: number) => void
  onClickBlock: (aff: Affectation) => void
}) {
  const monday = getMonday(new Date(currentDate))
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return d
  })

  return (
    <div className="min-w-[900px]">
      {/* Day headers */}
      <div className="grid border-b border-[var(--gray-200)]" style={{ gridTemplateColumns: '160px repeat(7, 1fr)' }}>
        <div className="px-3 py-2 text-[10px] font-bold text-[var(--gray-400)] uppercase">Employé</div>
        {weekDays.map((d, i) => {
          const isToday = d.getTime() === today.getTime()
          return (
            <div
              key={i}
              className={`px-2 py-2.5 text-center text-[11px] font-bold border-l border-[var(--gray-100)] ${
                isToday ? 'text-[var(--orange)]' : 'text-[var(--gray-500)]'
              }`}
            >
              {JOUR_COURTS[i]} {d.getDate()}
            </div>
          )
        })}
      </div>

      {/* Employee rows */}
      {employees.map(emp => (
        <div
          key={emp.id}
          className="grid border-b border-[var(--gray-50)] last:border-b-0"
          style={{ gridTemplateColumns: '160px repeat(7, 1fr)', minHeight: '70px' }}
        >
          {/* Label */}
          <div className="flex items-center gap-2.5 px-4 py-2.5 border-r border-[var(--gray-100)]">
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-white font-sora font-extrabold text-[10px] shrink-0"
              style={{ background: emp.couleur }}
            >
              {getInitials(emp.prenom, emp.nom)}
            </div>
            <div className="text-xs font-semibold whitespace-nowrap overflow-hidden text-ellipsis">
              {emp.prenom}{emp.nom ? ' ' + emp.nom[0] + '.' : ''}
            </div>
          </div>

          {/* Day cells */}
          {weekDays.map((d, i) => {
            const ds = formatDateISO(d)
            const dayAffs = affectations.filter(a => a.employe_id === emp.id && a.date_debut === ds)
            return (
              <div
                key={i}
                onClick={() => onClickCell(emp.id, ds, 8)}
                className="border-l border-[var(--gray-50)] p-1 flex flex-col gap-[3px] cursor-pointer transition-colors hover:bg-[rgba(232,112,10,0.03)]"
              >
                {dayAffs.map(aff => {
                  const color = emp.couleur
                  return (
                    <div
                      key={aff.id}
                      onClick={e => { e.stopPropagation(); onClickBlock(aff) }}
                      className="rounded px-1.5 py-[3px] border-l-[3px] text-[10px] font-semibold whitespace-nowrap overflow-hidden text-ellipsis cursor-pointer transition-all hover:opacity-80"
                      style={{
                        borderLeftColor: color,
                        background: color + '12',
                        color,
                      }}
                    >
                      {aff.titre} <span className="opacity-60">{aff.heure_debut.substring(0, 5)}</span>
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}
