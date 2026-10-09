'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  getEmployes, addEmploye, updateEmploye, deleteEmploye,
  getAffectations, addAffectation, updateAffectation, deleteAffectation,
} from '@/lib/supabase/helpers'
import type { Employe, Affectation, Demande } from '@/lib/supabase/helpers'
import { logger } from '@/lib/logger'
import Dialog from '@/components/ui/Dialog'

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

  // Erreurs affichées dans les formulaires (au lieu des alert() natifs)
  const [empError, setEmpError] = useState('')
  const [affError, setAffError] = useState('')
  const [affConfirmDelete, setAffConfirmDelete] = useState(false)
  const [empToDelete, setEmpToDelete] = useState<Employe | null>(null)

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
    if (!formData.prenom.trim()) { setEmpError('Le prénom est requis.'); return }
    setEmpError('')
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
      setEmpError('Enregistrement impossible : ' + (e instanceof Error ? e.message : 'réessayez.'))
    }
  }

  const removeEmployee = async (id: string) => {
    try {
      await deleteEmploye(supabase, id)
      setEmpToDelete(null)
      await loadData()
    } catch (e: unknown) {
      setEmpToDelete(null)
      setEmpError('Suppression impossible : ' + (e instanceof Error ? e.message : 'réessayez.'))
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

  const closePopup = () => {
    setAffPopup({ open: false, editId: null, data: emptyAffData })
    setAffError('')
    setAffConfirmDelete(false)
  }

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
    if (!titre.trim()) { setAffError('Le titre est requis.'); return }
    if (!employe_id) { setAffError('Sélectionnez un employé.'); return }
    if (!date) { setAffError('La date est requise.'); return }
    if (!heure_debut || !heure_fin) { setAffError('Les heures de début et fin sont requises.'); return }
    if (heure_fin <= heure_debut) { setAffError("L'heure de fin doit être après l'heure de début."); return }

    const overlap = checkOverlap(employe_id, date, heure_debut, heure_fin, affPopup.editId)
    if (overlap) {
      setAffError('Conflit : ' + (overlap.titre || 'une affectation') + ' occupe déjà ce créneau pour cet employé.')
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
      setAffError('Enregistrement impossible : ' + (e instanceof Error ? e.message : 'réessayez.'))
    }
  }

  const removeAffectation = async () => {
    if (!affPopup.editId) return
    if (!affConfirmDelete) { setAffConfirmDelete(true); return }
    try {
      await deleteAffectation(supabase, affPopup.editId)
      closePopup()
      await reloadAffectations()
    } catch (e: unknown) {
      setAffError('Suppression impossible : ' + (e instanceof Error ? e.message : 'réessayez.'))
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
      <div className="bg-white rounded-[var(--radius)] border border-[var(--gray-200)] p-5 h-fit max-[900px]:order-2">
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
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity max-[900px]:opacity-100">
                <button
                  onClick={(e) => { e.stopPropagation(); openEditForm(emp) }}
                  aria-label={`Modifier ${emp.prenom}`}
                  className="bg-transparent border-none cursor-pointer p-1 max-[900px]:p-2.5 rounded-md text-[var(--gray-500)] transition-all hover:bg-[var(--gray-200)] hover:text-[var(--dark)]"
                  title="Modifier"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); setEmpToDelete(emp) }}
                  aria-label={`Supprimer ${emp.prenom}`}
                  className="bg-transparent border-none cursor-pointer p-1 max-[900px]:p-2.5 rounded-md text-[var(--gray-500)] transition-all hover:bg-[rgba(211,47,47,0.08)] hover:text-[var(--red)]"
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
              className="w-full px-3 py-2 border border-[var(--gray-200)] rounded-lg text-[13px] max-[600px]:text-base mb-2 bg-white focus:outline-none focus:border-[var(--orange)] focus:shadow-[0_0_0_3px_rgba(232,112,10,0.08)]"
            />
            <input
              type="text"
              placeholder="Nom"
              value={formData.nom}
              onChange={e => setFormData(f => ({ ...f, nom: e.target.value }))}
              className="w-full px-3 py-2 border border-[var(--gray-200)] rounded-lg text-[13px] max-[600px]:text-base mb-2 bg-white focus:outline-none focus:border-[var(--orange)] focus:shadow-[0_0_0_3px_rgba(232,112,10,0.08)]"
            />
            <input
              type="text"
              placeholder="Poste (ex: Apprenti, Chef)"
              value={formData.poste}
              onChange={e => setFormData(f => ({ ...f, poste: e.target.value }))}
              className="w-full px-3 py-2 border border-[var(--gray-200)] rounded-lg text-[13px] max-[600px]:text-base mb-2 bg-white focus:outline-none focus:border-[var(--orange)] focus:shadow-[0_0_0_3px_rgba(232,112,10,0.08)]"
            />
            <input
              type="tel"
              placeholder="Téléphone"
              value={formData.telephone}
              onChange={e => setFormData(f => ({ ...f, telephone: e.target.value }))}
              className="w-full px-3 py-2 border border-[var(--gray-200)] rounded-lg text-[13px] max-[600px]:text-base mb-2 bg-white focus:outline-none focus:border-[var(--orange)] focus:shadow-[0_0_0_3px_rgba(232,112,10,0.08)]"
            />
            <input
              type="email"
              placeholder="Email"
              value={formData.email}
              onChange={e => setFormData(f => ({ ...f, email: e.target.value }))}
              className="w-full px-3 py-2 border border-[var(--gray-200)] rounded-lg text-[13px] max-[600px]:text-base mb-2 bg-white focus:outline-none focus:border-[var(--orange)] focus:shadow-[0_0_0_3px_rgba(232,112,10,0.08)]"
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
            {empError && <p role="alert" className="text-[13px] text-[var(--red)] font-semibold mb-2">{empError}</p>}
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => { setShowForm(false); setEditingEmpId(null); setEmpError('') }}
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
      <div className="bg-white rounded-[var(--radius)] border border-[var(--gray-200)] overflow-hidden max-[900px]:order-1">
        {/* Timeline header */}
        <div className="px-5 py-4 flex justify-between items-center border-b border-[var(--gray-100)] max-[600px]:flex-col max-[600px]:gap-3">
          <div className="flex items-center gap-2.5 max-[600px]:w-full max-[600px]:justify-between">
            <button
              onClick={() => navigateDate(-1)}
              aria-label={view === 'day' ? 'Jour précédent' : 'Semaine précédente'}
              className="w-8 h-8 rounded-lg border border-[var(--gray-200)] bg-white cursor-pointer flex items-center justify-center transition-all hover:bg-[var(--gray-100)]"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
            </button>
            <span className="font-sora text-sm font-bold min-w-[200px] text-center max-[600px]:min-w-0 max-[600px]:flex-1 max-[600px]:truncate">{getDateLabel(currentDate, view)}</span>
            <button
              onClick={() => navigateDate(1)}
              aria-label={view === 'day' ? 'Jour suivant' : 'Semaine suivante'}
              className="w-8 h-8 rounded-lg border border-[var(--gray-200)] bg-white cursor-pointer flex items-center justify-center transition-all hover:bg-[var(--gray-100)]"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6" /></svg>
            </button>
          </div>
          <div className="flex items-center gap-2">
          <button
            onClick={goToday}
            className="px-3.5 py-1.5 rounded-full border border-[var(--gray-200)] bg-white text-xs font-semibold cursor-pointer transition-all hover:bg-[var(--gray-100)] max-[600px]:py-2"
          >
            Aujourd&apos;hui
          </button>
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
        </div>

        {/* Mobile : liste des affectations, plus lisible qu'une frise horaire */}
        {employees.length > 0 && (
          <div className="hidden max-[600px]:block">
            <MobileList
              employees={employees}
              affectations={affectations}
              dates={view === 'day' ? [todayStr] : weekDates(currentDate)}
              todayStr={formatDateISO(new Date())}
              onAdd={(date) => openNewAffect(employees[0].id, date, 8)}
              onClickBlock={openEditAffect}
            />
          </div>
        )}

        {/* Timeline body */}
        <div className={`overflow-x-auto ${employees.length > 0 ? 'max-[600px]:hidden' : ''}`}>
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
          className="fixed inset-0 bg-black/40 z-[200] flex items-center justify-center max-[600px]:items-end"
          onMouseDown={e => { if (e.target === e.currentTarget) closePopup() }}
        >
          <div role="dialog" aria-modal="true" aria-label={affPopup.editId ? "Modifier l'affectation" : 'Nouvelle affectation'} className="dialog-sheet bg-white rounded-2xl p-7 w-[440px] max-w-[90vw] max-h-[85vh] overflow-y-auto shadow-[0_20px_60px_rgba(0,0,0,0.15)] max-[600px]:p-5 max-[600px]:w-full max-[600px]:max-w-none max-[600px]:rounded-b-none max-[600px]:max-h-[92dvh] max-[600px]:pb-[calc(20px+env(safe-area-inset-bottom))]">
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
              className="w-full px-3.5 py-2.5 border border-[var(--gray-200)] rounded-[10px] text-[13px] max-[600px]:text-base mb-3.5 font-[DM_Sans,sans-serif] focus:outline-none focus:border-[var(--orange)] focus:shadow-[0_0_0_3px_rgba(232,112,10,0.08)]"
            />

            <label className="block text-xs font-semibold text-[var(--gray-600)] mb-1">Employé *</label>
            <select
              value={affPopup.data.employe_id}
              onChange={e => setAffPopup(p => ({ ...p, data: { ...p.data, employe_id: e.target.value } }))}
              className="w-full px-3.5 py-2.5 border border-[var(--gray-200)] rounded-[10px] text-[13px] max-[600px]:text-base mb-3.5 font-[DM_Sans,sans-serif] focus:outline-none focus:border-[var(--orange)] focus:shadow-[0_0_0_3px_rgba(232,112,10,0.08)]"
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
                  className="w-full px-3.5 py-2.5 border border-[var(--gray-200)] rounded-[10px] text-[13px] max-[600px]:text-base mb-3.5 font-[DM_Sans,sans-serif] focus:outline-none focus:border-[var(--orange)] focus:shadow-[0_0_0_3px_rgba(232,112,10,0.08)]"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-[var(--gray-600)] mb-1">Début</label>
                  <input
                    type="time"
                    value={affPopup.data.heure_debut}
                    onChange={e => setAffPopup(p => ({ ...p, data: { ...p.data, heure_debut: e.target.value } }))}
                    className="w-full px-3.5 py-2.5 border border-[var(--gray-200)] rounded-[10px] text-[13px] max-[600px]:text-base mb-3.5 font-[DM_Sans,sans-serif] focus:outline-none focus:border-[var(--orange)] focus:shadow-[0_0_0_3px_rgba(232,112,10,0.08)]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--gray-600)] mb-1">Fin</label>
                  <input
                    type="time"
                    value={affPopup.data.heure_fin}
                    onChange={e => setAffPopup(p => ({ ...p, data: { ...p.data, heure_fin: e.target.value } }))}
                    className="w-full px-3.5 py-2.5 border border-[var(--gray-200)] rounded-[10px] text-[13px] max-[600px]:text-base mb-3.5 font-[DM_Sans,sans-serif] focus:outline-none focus:border-[var(--orange)] focus:shadow-[0_0_0_3px_rgba(232,112,10,0.08)]"
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
              className="w-full px-3.5 py-2.5 border border-[var(--gray-200)] rounded-[10px] text-[13px] max-[600px]:text-base mb-3.5 font-[DM_Sans,sans-serif] focus:outline-none focus:border-[var(--orange)] focus:shadow-[0_0_0_3px_rgba(232,112,10,0.08)]"
            />

            <label className="block text-xs font-semibold text-[var(--gray-600)] mb-1">Notes</label>
            <textarea
              placeholder="Instructions, matériel nécessaire..."
              value={affPopup.data.notes}
              onChange={e => setAffPopup(p => ({ ...p, data: { ...p.data, notes: e.target.value } }))}
              className="w-full px-3.5 py-2.5 border border-[var(--gray-200)] rounded-[10px] text-[13px] max-[600px]:text-base mb-3.5 font-[DM_Sans,sans-serif] resize-y min-h-[60px] focus:outline-none focus:border-[var(--orange)] focus:shadow-[0_0_0_3px_rgba(232,112,10,0.08)]"
            />

            <label className="block text-xs font-semibold text-[var(--gray-600)] mb-1">Lier à une demande</label>
            <select
              value={affPopup.data.demande_id}
              onChange={e => setAffPopup(p => ({ ...p, data: { ...p.data, demande_id: e.target.value } }))}
              className="w-full px-3.5 py-2.5 border border-[var(--gray-200)] rounded-[10px] text-[13px] max-[600px]:text-base mb-3.5 font-[DM_Sans,sans-serif] focus:outline-none focus:border-[var(--orange)] focus:shadow-[0_0_0_3px_rgba(232,112,10,0.08)]"
            >
              <option value="">Aucune demande liée</option>
              {activeDemandes.map(d => (
                <option key={d.id} value={d.id}>
                  {(d.client_nom || 'Client') + ' — ' + (d.message || '').substring(0, 30)}
                </option>
              ))}
            </select>

            {affError && <p role="alert" className="text-[13px] text-[var(--red)] font-semibold mb-2">{affError}</p>}
            <div className="flex justify-between gap-2 mt-2">
              {affPopup.editId ? (
                <button
                  onClick={removeAffectation}
                  className="bg-transparent border-none text-[var(--red)] py-2.5 px-0 font-bold text-[13px] cursor-pointer font-sora hover:underline"
                >
                  {affConfirmDelete ? 'Confirmer ?' : 'Supprimer'}
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

      {empToDelete && (
        <Dialog onClose={() => setEmpToDelete(null)} labelledBy="emp-suppr-titre" variant="sheet" className="max-w-[420px] p-6">
          <h3 id="emp-suppr-titre" className="font-sora font-bold text-lg mb-2">Supprimer {empToDelete.prenom} ?</h3>
          <p className="text-[15px] text-[var(--gray-500)] mb-6">Ses affectations à venir seront aussi supprimées.</p>
          <div className="flex flex-col-reverse gap-2 min-[600px]:flex-row min-[600px]:justify-end">
            <button onClick={() => setEmpToDelete(null)} className="h-12 px-5 rounded-full text-[15px] font-semibold bg-[var(--gray-100)] text-[var(--dark)] border-none cursor-pointer">Annuler</button>
            <button onClick={() => removeEmployee(empToDelete.id)} className="h-12 px-5 rounded-full text-[15px] font-bold bg-[var(--red)] text-white border-none cursor-pointer">Supprimer</button>
          </div>
        </Dialog>
      )}
    </div>
  )
}

// ===== Mobile : liste par jour =====

function weekDates(d: Date): string[] {
  const monday = getMonday(new Date(d))
  return Array.from({ length: 7 }, (_, i) => {
    const x = new Date(monday)
    x.setDate(monday.getDate() + i)
    return formatDateISO(x)
  })
}

function MobileList({
  employees,
  affectations,
  dates,
  todayStr,
  onAdd,
  onClickBlock,
}: {
  employees: Employe[]
  affectations: Affectation[]
  dates: string[]
  todayStr: string
  onAdd: (date: string) => void
  onClickBlock: (aff: Affectation) => void
}) {
  return (
    <div className="flex flex-col">
      {dates.map(date => {
        const d = new Date(date + 'T00:00:00')
        const items = affectations
          .filter(a => a.date_debut === date)
          .sort((a, b) => a.heure_debut.localeCompare(b.heure_debut))
        return (
          <section key={date} className="px-4 py-3 border-b border-[var(--gray-100)] last:border-0" aria-label={`${JOUR_NOMS[d.getDay()]} ${d.getDate()} ${MOIS_NOMS[d.getMonth()]}`}>
            {dates.length > 1 && (
              <div className={`text-[13px] font-bold mb-2 ${date === todayStr ? 'text-[var(--orange)]' : 'text-[var(--gray-500)]'}`}>
                {JOUR_NOMS[d.getDay()]} {d.getDate()} {MOIS_NOMS[d.getMonth()]}{date === todayStr ? ' · aujourd’hui' : ''}
              </div>
            )}
            <ul className="flex flex-col gap-2">
              {items.map(a => {
                const emp = employees.find(e => e.id === a.employe_id)
                const color = emp?.couleur || a.employes?.couleur || 'var(--gray-500)'
                return (
                  <li key={a.id}>
                    <button
                      type="button"
                      onClick={() => onClickBlock(a)}
                      className="w-full flex items-stretch gap-3 p-3 rounded-2xl bg-[var(--gray-50)] border-none text-left cursor-pointer"
                    >
                      <span aria-hidden="true" className="w-1 rounded-full shrink-0" style={{ background: color }} />
                      <span className="flex-1 min-w-0">
                        <span className="block text-[13px] font-semibold text-[var(--gray-500)]">{a.heure_debut.substring(0, 5)} – {a.heure_fin.substring(0, 5)}</span>
                        <span className="block font-semibold text-[15px] text-[var(--dark)] truncate">{a.titre}</span>
                        {a.adresse && <span className="block text-[13px] text-[var(--gray-500)] truncate">{a.adresse}</span>}
                      </span>
                      <span className="self-center flex items-center gap-1.5 shrink-0 text-[13px] font-semibold text-[var(--dark)]">
                        <span className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[11px] font-bold" style={{ background: color }}>
                          {emp ? getInitials(emp.prenom, emp.nom) : '?'}
                        </span>
                      </span>
                    </button>
                  </li>
                )
              })}
              {items.length === 0 && dates.length === 1 && (
                <li className="text-center text-[14px] text-[var(--gray-500)] py-4">Aucune affectation ce jour-là.</li>
              )}
            </ul>
            <button
              type="button"
              onClick={() => onAdd(date)}
              className={`flex items-center gap-1.5 text-[14px] font-semibold text-[var(--orange)] bg-transparent border-none cursor-pointer p-0 ${items.length > 0 || dates.length === 1 ? 'mt-3' : ''}`}
            >
              <svg aria-hidden="true" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14" /></svg>
              Affecter quelqu’un
            </button>
          </section>
        )
      })}
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
