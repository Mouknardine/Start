'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  saveArtisanProfile, getAffectations, getEmployes, loadDemandes,
  addAffectation, updateAffectation, deleteAffectation,
} from '@/lib/supabase/helpers'
import { loadAgendaKey, loadAgendaKeyCached, saveAgendaKey, debounce } from '@/lib/supabase/agenda'
import type { Affectation, Employe, Demande } from '@/lib/supabase/helpers'
import { logger } from '@/lib/logger'
import type {
  CellStatus, Slots, TitleEntry, Titles, Notes,
  RecDay, Recurrence, InterventionType, Feedback, AgendaProps,
} from './agenda/types'
import {
  DAY_NAMES, DAY_NAMES_SHORT, MONTH_NAMES, MONTH_NAMES_CAP,
  TOTAL_ROWS, GRID_START_MIN, TIME_LABELS,
} from './agenda/constants'
import {
  getMonday, formatWeekStart, formatDateStr, getMondayForOffset,
  timeToMinutes, getTitleText, getTitleColor, cellKey,
} from './agenda/utils'

// ===== COMPONENT =====

export default function DashAgenda({ userId, profile }: AgendaProps) {
  const supabase = useMemo(() => createClient(), [])

  // Week / view state
  const [weekOffset, setWeekOffset] = useState(0)
  const [view, setView] = useState<'week' | 'month'>('week')
  const [monthOffset, setMonthOffset] = useState(0)

  // Grid data
  const [slots, setSlots] = useState<Slots>({})
  const [titles, setTitles] = useState<Titles>({})
  const [notes, setNotes] = useState<Notes>({})

  // Selection / popup
  const [selectedCells, setSelectedCells] = useState<{ col: number; row: number }[]>([])
  const [popupPos, setPopupPos] = useState<{ x: number; y: number } | null>(null)
  const [popupTitle, setPopupTitle] = useState('')

  // Settings / modals
  const [showSettings, setShowSettings] = useState(false)
  const [showRecurrence, setShowRecurrence] = useState(false)
  const [showBlockDays, setShowBlockDays] = useState(false)
  const [showInterventionTypes, setShowInterventionTypes] = useState(false)

  // Recurrence
  const [recurrence, setRecurrence] = useState<Recurrence>({})

  // Blocked days
  const [blockedDays, setBlockedDays] = useState<string[]>([])
  const [tempBlockedDays, setTempBlockedDays] = useState<string[]>([])
  const [blockFrom, setBlockFrom] = useState('')
  const [blockTo, setBlockTo] = useState('')

  // Intervention types
  const [interventionTypes, setInterventionTypes] = useState<InterventionType[]>([])
  const [intName, setIntName] = useState('')
  const [intDuration, setIntDuration] = useState('60')
  const [intColor, setIntColor] = useState('#2E7D32')

  // Custom slot
  const [showCustomSlot, setShowCustomSlot] = useState(false)
  const [csDay, setCsDay] = useState('0')
  const [csStart, setCsStart] = useState('09:15')
  const [csEnd, setCsEnd] = useState('10:22')
  const [csStatus, setCsStatus] = useState<CellStatus>('available')
  const [csFeedback, setCsFeedback] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)

  // Notes
  const [noteTarget, setNoteTarget] = useState<{ col: number; row: number } | null>(null)
  const [noteText, setNoteText] = useState('')
  const [notePopupPos, setNotePopupPos] = useState<{ x: number; y: number } | null>(null)

  // Tooltip
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null)

  // Publishing / feedback
  const [publishing, setPublishing] = useState(false)
  const [feedback, setFeedback] = useState<Feedback>(null)

  // Affectations
  const [affectations, setAffectations] = useState<Affectation[]>([])
  const [employees, setEmployees] = useState<Employe[]>([])
  const [demandes, setDemandes] = useState<Demande[]>([])

  // Affectation popup (création / édition depuis le calendrier principal)
  type AffData = { titre: string; employe_id: string; date: string; heure_debut: string; heure_fin: string; adresse: string; notes: string; demande_id: string }
  const emptyAff = useMemo<AffData>(() => ({ titre: '', employe_id: '', date: '', heure_debut: '08:00', heure_fin: '10:00', adresse: '', notes: '', demande_id: '' }), [])
  const [affPopup, setAffPopup] = useState<{ open: boolean; editId: string | null; data: AffData }>({ open: false, editId: null, data: emptyAff })

  // Drag state refs
  const isDragging = useRef(false)
  const dragStartCol = useRef<number | null>(null)
  const dragStartRow = useRef<number | null>(null)
  const dragCurrentCol = useRef<number | null>(null)
  const dragCurrentRow = useRef<number | null>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)
  const settingsRef = useRef<HTMLDivElement>(null)
  const notePopupRef = useRef<HTMLDivElement>(null)

  // ===== WEEK COMPUTATION =====

  const monday = useMemo(() => getMondayForOffset(weekOffset), [weekOffset])
  // Clés de persistance dans agenda_data (par semaine pour slots/titles/notes)
  const weekKey = useMemo(() => `week-${formatWeekStart(monday)}`, [monday])
  const titlesKey = useMemo(() => `titles-${formatWeekStart(monday)}`, [monday])
  const notesKey = useMemo(() => `notes-${formatWeekStart(monday)}`, [monday])

  const weekLabel = useMemo(() => {
    const sunday = new Date(monday)
    sunday.setDate(monday.getDate() + 6)
    const mStart = MONTH_NAMES[monday.getMonth()]
    const mEnd = MONTH_NAMES[sunday.getMonth()]
    if (mStart === mEnd) {
      return `Semaine du ${monday.getDate()} au ${sunday.getDate()} ${mEnd} ${sunday.getFullYear()}`
    }
    return `Semaine du ${monday.getDate()} ${mStart} au ${sunday.getDate()} ${mEnd} ${sunday.getFullYear()}`
  }, [monday])

  const dayHeaders = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday)
      d.setDate(monday.getDate() + i)
      const dateStr = formatDateStr(d)
      return {
        name: DAY_NAMES[i],
        num: d.getDate(),
        isToday: d.getTime() === today.getTime(),
        isBlocked: blockedDays.includes(dateStr),
        dateStr,
      }
    })
  }, [monday, blockedDays])

  // ===== SUPABASE PERSISTENCE (avec cache localStorage pour UX immédiate) =====

  // Debounced savers — n'écrivent en DB qu'après 800ms d'inactivité, pour
  // éviter le spam lors d'un drag de sélection rapide.
  const saveSlotsDebounced = useMemo(
    () => debounce((data: Slots) => {
      if (!userId) return
      saveAgendaKey(supabase, userId, weekKey, { week_start: formatWeekStart(monday), slots: data }).catch(() => {})
    }, 800),
    [supabase, userId, weekKey, monday],
  )

  const saveTitlesDebounced = useMemo(
    () => debounce((data: Titles) => {
      if (!userId) return
      saveAgendaKey(supabase, userId, titlesKey, data).catch(() => {})
    }, 800),
    [supabase, userId, titlesKey],
  )

  const saveNotesDebounced = useMemo(
    () => debounce((data: Notes) => {
      if (!userId) return
      saveAgendaKey(supabase, userId, notesKey, data).catch(() => {})
    }, 800),
    [supabase, userId, notesKey],
  )

  // Load on mount and week change : lecture immédiate cache + remplacement DB
  useEffect(() => {
    if (!userId) return
    // 1. Lecture cache localStorage immédiate
    const cachedSlots = loadAgendaKeyCached<{ slots?: Slots }>(userId, weekKey, {})
    const cachedTitles = loadAgendaKeyCached<Titles>(userId, titlesKey, {})
    const cachedNotes = loadAgendaKeyCached<Notes>(userId, notesKey, {})
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSlots(cachedSlots?.slots || {})
    setTitles(cachedTitles)
    setNotes(cachedNotes)

    // 2. Remplacement par la source de vérité DB
    let cancelled = false
    Promise.all([
      loadAgendaKey<{ slots?: Slots }>(supabase, userId, weekKey, {}),
      loadAgendaKey<Titles>(supabase, userId, titlesKey, {}),
      loadAgendaKey<Notes>(supabase, userId, notesKey, {}),
    ]).then(([s, t, n]) => {
      if (cancelled) return
      setSlots(s?.slots || {})
      setTitles(t)
      setNotes(n)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [supabase, userId, weekKey, titlesKey, notesKey])

  // Charger les paramètres globaux (non liés à la semaine) une fois au mount
  useEffect(() => {
    if (!userId) return
    // Cache immédiat
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBlockedDays(loadAgendaKeyCached<string[]>(userId, 'blocked_days', []))
    setInterventionTypes(loadAgendaKeyCached<InterventionType[]>(userId, 'intervention_types', []))

    let cancelled = false
    Promise.all([
      loadAgendaKey<string[]>(supabase, userId, 'blocked_days', []),
      loadAgendaKey<InterventionType[]>(supabase, userId, 'intervention_types', []),
    ]).then(([bd, it]) => {
      if (cancelled) return
      setBlockedDays(bd)
      setInterventionTypes(it)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [supabase, userId])

  // Auto-save quand le state change (debounced 800ms)
  useEffect(() => {
    if (!userId) return
    saveSlotsDebounced(slots)
  }, [slots, saveSlotsDebounced, userId])

  useEffect(() => {
    if (!userId) return
    saveTitlesDebounced(titles)
  }, [titles, saveTitlesDebounced, userId])

  useEffect(() => {
    if (!userId) return
    saveNotesDebounced(notes)
  }, [notes, saveNotesDebounced, userId])

  // ===== AFFECTATIONS =====

  const reloadAffectations = useCallback(async () => {
    if (!userId) return
    try {
      const sunday = new Date(monday)
      sunday.setDate(monday.getDate() + 6)
      const data = await getAffectations(supabase, userId, formatWeekStart(monday), formatDateStr(sunday))
      setAffectations(data)
    } catch { setAffectations([]) }
  }, [supabase, userId, monday])

  // Recharge les affectations à chaque changement de semaine. Le setState se
  // fait après un await réseau (pas un cascading render synchrone).
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { reloadAffectations() }, [reloadAffectations])

  // Employés + demandes (pour le popup d'affectation) — chargés une fois.
  useEffect(() => {
    if (!userId) return
    getEmployes(supabase, userId).then(setEmployees).catch(() => setEmployees([]))
    loadDemandes(supabase, userId).then(setDemandes).catch(() => setDemandes([]))
  }, [supabase, userId])

  const activeDemandes = useMemo(
    () => demandes.filter(d => d.statut !== 'refusee').slice(0, 20),
    [demandes]
  )

  const closeAff = useCallback(() => setAffPopup({ open: false, editId: null, data: emptyAff }), [emptyAff])

  // Ouvre le popup « nouvelle affectation » pré-rempli depuis une cellule de la grille.
  const openNewAffect = useCallback((col: number, row: number) => {
    if (employees.length === 0) {
      setFeedback({ type: 'error', msg: 'Ajoutez d\'abord un employé dans l\'onglet Équipe.' })
      setTimeout(() => setFeedback(null), 4000)
      return
    }
    const cellDate = new Date(monday)
    cellDate.setDate(monday.getDate() + col)
    const startMin = GRID_START_MIN + row * 30
    const endMin = Math.min(startMin + 120, GRID_START_MIN + TOTAL_ROWS * 30)
    const toHM = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
    setAffPopup({
      open: true, editId: null,
      data: { ...emptyAff, date: formatDateStr(cellDate), heure_debut: toHM(startMin), heure_fin: toHM(endMin) },
    })
  }, [employees.length, monday, emptyAff])

  const openEditAffect = useCallback((aff: Affectation) => {
    setAffPopup({
      open: true, editId: aff.id,
      data: {
        titre: aff.titre || '', employe_id: aff.employe_id || '', date: aff.date_debut || '',
        heure_debut: aff.heure_debut ? aff.heure_debut.substring(0, 5) : '',
        heure_fin: aff.heure_fin ? aff.heure_fin.substring(0, 5) : '',
        adresse: aff.adresse || '', notes: aff.notes || '', demande_id: aff.demande_id || '',
      },
    })
  }, [])

  const checkAffOverlap = useCallback((empId: string, date: string, debut: string, fin: string, excludeId?: string | null) => {
    return affectations.find(a => {
      if (a.employe_id !== empId || a.date_debut !== date) return false
      if (excludeId && a.id === excludeId) return false
      return debut < a.heure_fin.substring(0, 5) && fin > a.heure_debut.substring(0, 5)
    })
  }, [affectations])

  const saveAff = useCallback(async () => {
    const { titre, employe_id, date, heure_debut, heure_fin, adresse, notes, demande_id } = affPopup.data
    if (!titre.trim()) { setFeedback({ type: 'error', msg: 'Le titre est requis.' }); return }
    if (!employe_id) { setFeedback({ type: 'error', msg: 'Sélectionnez un employé.' }); return }
    if (!date) { setFeedback({ type: 'error', msg: 'La date est requise.' }); return }
    if (!heure_debut || !heure_fin) { setFeedback({ type: 'error', msg: 'Heures de début et fin requises.' }); return }
    if (heure_fin <= heure_debut) { setFeedback({ type: 'error', msg: "L'heure de fin doit être après le début." }); return }
    const overlap = checkAffOverlap(employe_id, date, heure_debut, heure_fin, affPopup.editId)
    if (overlap) { setFeedback({ type: 'error', msg: 'Conflit : « ' + (overlap.titre || 'affectation') + ' » occupe déjà ce créneau pour cet employé.' }); return }

    const payload: Partial<Affectation> = {
      titre: titre.trim(), employe_id, date_debut: date, heure_debut, heure_fin,
      adresse: adresse.trim(), notes: notes.trim(), demande_id: demande_id || null,
    }
    try {
      if (affPopup.editId) await updateAffectation(supabase, affPopup.editId, payload)
      else await addAffectation(supabase, { ...payload, artisan_id: userId })
      closeAff()
      await reloadAffectations()
      setFeedback({ type: 'success', msg: 'Affectation enregistrée.' })
      setTimeout(() => setFeedback(null), 3000)
    } catch (e) {
      setFeedback({ type: 'error', msg: 'Erreur : ' + (e instanceof Error ? e.message : String(e)) })
    }
  }, [affPopup, checkAffOverlap, supabase, userId, closeAff, reloadAffectations])

  // Ouvre une nouvelle affectation à partir du créneau sélectionné par glissement.
  const openAffectFromSelection = useCallback(() => {
    if (selectedCells.length === 0) return
    const col = selectedCells[0].col
    const sameCol = selectedCells.filter(c => c.col === col)
    const minRow = Math.min(...sameCol.map(c => c.row))
    const maxRow = Math.max(...sameCol.map(c => c.row))
    setPopupPos(null)
    openNewAffect(col, minRow)
    // Étend l'heure de fin jusqu'au bas de la sélection.
    const endMin = Math.min(GRID_START_MIN + (maxRow + 1) * 30, GRID_START_MIN + TOTAL_ROWS * 30)
    const toHM = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
    setAffPopup(p => p.open ? { ...p, data: { ...p.data, heure_fin: toHM(endMin) } } : p)
  }, [selectedCells, openNewAffect])

  const removeAff = useCallback(async () => {
    if (!affPopup.editId) return
    try {
      await deleteAffectation(supabase, affPopup.editId)
      closeAff()
      await reloadAffectations()
      setFeedback({ type: 'success', msg: 'Affectation supprimée.' })
      setTimeout(() => setFeedback(null), 3000)
    } catch (e) {
      setFeedback({ type: 'error', msg: 'Erreur : ' + (e instanceof Error ? e.message : String(e)) })
    }
  }, [affPopup.editId, supabase, closeAff, reloadAffectations])

  // ===== WEEK NAVIGATION =====

  const navigateWeek = useCallback((dir: number) => {
    setSelectedCells([])
    setPopupPos(null)
    setWeekOffset(prev => prev + dir)
  }, [])

  // ===== CELL STATUS =====

  function getCellStatus(col: number, row: number): CellStatus | null {
    return slots[String(col)]?.[String(row)] || null
  }

  function isCellBlocked(col: number): boolean {
    return dayHeaders[col]?.isBlocked || false
  }

  function isCellSelected(col: number, row: number): boolean {
    return selectedCells.some(c => c.col === col && c.row === row)
  }

  // ===== POPUP ACTIONS =====

  function applyPopupState(state: 'available' | 'unavailable' | 'clear') {
    const titleVal = popupTitle.trim()
    setSlots(prev => {
      const next = { ...prev }
      for (const cell of selectedCells) {
        const c = String(cell.col)
        const r = String(cell.row)
        if (state === 'clear') {
          if (next[c]) {
            const colCopy = { ...next[c] }
            delete colCopy[r]
            if (Object.keys(colCopy).length === 0) {
              const { [c]: _, ...rest } = next
              Object.assign(next, rest)
              delete next[c]
            } else {
              next[c] = colCopy
            }
          }
        } else {
          if (!next[c]) next[c] = {}
          else next[c] = { ...next[c] }
          next[c][r] = state
        }
      }
      return next
    })

    setTitles(prev => {
      const next = { ...prev }
      for (const cell of selectedCells) {
        const key = cellKey(cell.col, cell.row)
        if (state === 'clear') {
          delete next[key]
        } else if (titleVal) {
          next[key] = titleVal
        }
      }
      return next
    })

    setPopupTitle('')
    setPopupPos(null)
    setSelectedCells([])
  }

  function applyIntervention(intervention: InterventionType) {
    if (selectedCells.length === 0) return
    const startCell = selectedCells.reduce((best, c) => c.row < best.row ? c : best, selectedCells[0])
    const col = startCell.col
    const startRow = startCell.row
    const slotsNeeded = Math.ceil(intervention.duration / 30)

    setSlots(prev => {
      const next = { ...prev }
      const c = String(col)
      if (!next[c]) next[c] = {}
      else next[c] = { ...next[c] }
      for (let i = 0; i < slotsNeeded; i++) {
        const row = startRow + i
        if (row >= TOTAL_ROWS) break
        next[c][String(row)] = 'unavailable'
      }
      return next
    })

    setTitles(prev => {
      const next = { ...prev }
      for (let i = 0; i < slotsNeeded; i++) {
        const row = startRow + i
        if (row >= TOTAL_ROWS) break
        next[cellKey(col, row)] = { text: intervention.name, color: intervention.color }
      }
      return next
    })

    setPopupPos(null)
    setSelectedCells([])
  }

  // ===== DRAG SELECTION =====

  function getCellFromEvent(e: React.MouseEvent | React.TouchEvent | MouseEvent | TouchEvent): { col: number; row: number } | null {
    const target = 'touches' in e ? document.elementFromPoint(
      (e as TouchEvent).touches[0].clientX,
      (e as TouchEvent).touches[0].clientY
    ) : (e.target as HTMLElement)
    const cell = (target as HTMLElement)?.closest?.('[data-col][data-row]') as HTMLElement | null
    if (!cell) return null
    return { col: parseInt(cell.dataset.col!), row: parseInt(cell.dataset.row!) }
  }

  function computeSelectedCells(
    startCol: number, startRow: number,
    endCol: number, endRow: number
  ): { col: number; row: number }[] {
    const minCol = Math.min(startCol, endCol)
    const maxCol = Math.max(startCol, endCol)
    const minRow = Math.min(startRow, endRow)
    const maxRow = Math.max(startRow, endRow)
    const cells: { col: number; row: number }[] = []
    for (let c = minCol; c <= maxCol; c++) {
      for (let r = minRow; r <= maxRow; r++) {
        if (!isCellBlocked(c)) cells.push({ col: c, row: r })
      }
    }
    return cells
  }

  function showPopupNear(col: number, row: number) {
    const cellEl = gridRef.current?.querySelector(`[data-col="${col}"][data-row="${row}"]`) as HTMLElement | null
    if (!cellEl) return
    const rect = cellEl.getBoundingClientRect()
    let left = rect.right + 10
    let top = rect.top + window.scrollY
    if (left + 240 > window.innerWidth - 16) left = rect.left - 250
    if (rect.top + 280 > window.innerHeight) top = rect.bottom + window.scrollY - 280
    if (left < 8) left = 8
    if (top < 8 + window.scrollY) top = 8 + window.scrollY

    // Pre-fill title from first selected cell
    const firstSelected = selectedCells.length > 0 ? selectedCells[0] : { col, row }
    const key = cellKey(firstSelected.col, firstSelected.row)
    setPopupTitle(getTitleText(titles[key]))
    setPopupPos({ x: left, y: top })
  }

  const onGridMouseDown = useCallback((e: React.MouseEvent) => {
    const info = getCellFromEvent(e)
    if (!info || isCellBlocked(info.col)) return
    e.preventDefault()

    setPopupPos(null)
    isDragging.current = true
    dragStartCol.current = info.col
    dragStartRow.current = info.row
    dragCurrentCol.current = info.col
    dragCurrentRow.current = info.row
    setSelectedCells([info])
  }, [dayHeaders])

  const onGridMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging.current) return
    const info = getCellFromEvent(e)
    if (!info) return
    if (info.col !== dragCurrentCol.current || info.row !== dragCurrentRow.current) {
      dragCurrentCol.current = info.col
      dragCurrentRow.current = info.row
      setSelectedCells(computeSelectedCells(
        dragStartCol.current!, dragStartRow.current!,
        info.col, info.row
      ))
    }
  }, [dayHeaders])

  useEffect(() => {
    function onMouseUp() {
      if (!isDragging.current) return
      isDragging.current = false
      // Show popup near last dragged cell
      if (dragCurrentCol.current !== null && dragCurrentRow.current !== null) {
        // We need to defer so selectedCells state is updated
        setTimeout(() => {
          if (dragCurrentCol.current !== null && dragCurrentRow.current !== null) {
            showPopupNear(dragCurrentCol.current, dragCurrentRow.current)
          }
        }, 0)
      }
    }

    function onDocMouseDown(e: MouseEvent) {
      if (popupRef.current && !popupRef.current.contains(e.target as Node) &&
          !(e.target as HTMLElement)?.closest?.('[data-col][data-row]')) {
        setPopupPos(null)
        setSelectedCells([])
      }
    }

    document.addEventListener('mouseup', onMouseUp)
    document.addEventListener('mousedown', onDocMouseDown)
    return () => {
      document.removeEventListener('mouseup', onMouseUp)
      document.removeEventListener('mousedown', onDocMouseDown)
    }
  }, [titles])

  // Touch support
  const onGridTouchStart = useCallback((e: React.TouchEvent) => {
    const info = getCellFromEvent(e)
    if (!info || isCellBlocked(info.col)) return

    setPopupPos(null)
    isDragging.current = true
    dragStartCol.current = info.col
    dragStartRow.current = info.row
    dragCurrentCol.current = info.col
    dragCurrentRow.current = info.row
    setSelectedCells([info])
  }, [dayHeaders])

  const onGridTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging.current) return
    e.preventDefault()
    const info = getCellFromEvent(e)
    if (!info) return
    if (info.col !== dragCurrentCol.current || info.row !== dragCurrentRow.current) {
      dragCurrentCol.current = info.col
      dragCurrentRow.current = info.row
      setSelectedCells(computeSelectedCells(
        dragStartCol.current!, dragStartRow.current!,
        info.col, info.row
      ))
    }
  }, [dayHeaders])

  const onGridTouchEnd = useCallback(() => {
    if (!isDragging.current) return
    isDragging.current = false
    if (dragCurrentCol.current !== null && dragCurrentRow.current !== null) {
      setTimeout(() => {
        if (dragCurrentCol.current !== null && dragCurrentRow.current !== null) {
          showPopupNear(dragCurrentCol.current, dragCurrentRow.current)
        }
      }, 0)
    }
  }, [titles])

  // ===== CONTEXT MENU (notes) =====

  function onCellContextMenu(e: React.MouseEvent, col: number, row: number) {
    e.preventDefault()
    const key = cellKey(col, row)
    setNoteTarget({ col, row })
    setNoteText(notes[key] || '')
    const rect = (e.target as HTMLElement).getBoundingClientRect()
    setNotePopupPos({
      x: Math.min(rect.right + 8, window.innerWidth - 240),
      y: Math.max(rect.top - 20, 10),
    })
  }

  function saveNoteAction() {
    if (!noteTarget) return
    const key = cellKey(noteTarget.col, noteTarget.row)
    setNotes(prev => {
      const next = { ...prev }
      if (noteText.trim()) next[key] = noteText.trim()
      else delete next[key]
      return next
    })
    setNoteTarget(null)
    setNotePopupPos(null)
  }

  function deleteNoteAction() {
    if (!noteTarget) return
    const key = cellKey(noteTarget.col, noteTarget.row)
    setNotes(prev => {
      const next = { ...prev }
      delete next[key]
      return next
    })
    setNoteTarget(null)
    setNotePopupPos(null)
  }

  // Close note popup on outside click
  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      if (notePopupRef.current && !notePopupRef.current.contains(e.target as Node)) {
        setNoteTarget(null)
        setNotePopupPos(null)
      }
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => document.removeEventListener('mousedown', onDocMouseDown)
  }, [])

  // ===== TOOLTIP =====

  function onCellMouseEnter(e: React.MouseEvent, col: number, row: number) {
    const key = cellKey(col, row)
    const titleT = getTitleText(titles[key])
    const noteT = notes[key] || ''
    if (!titleT && !noteT) return
    let text = ''
    if (titleT) text += titleT
    if (titleT && noteT) text += '\n'
    if (noteT) text += (titleT ? 'Note: ' : '') + noteT
    setTooltip({ x: e.clientX + 12, y: e.clientY + 12, text })
  }

  function onCellMouseLeave() {
    setTooltip(null)
  }

  // ===== PUBLISH =====

  async function publishDisponibilites() {
    setPublishing(true)
    try {
      // Recharge depuis Supabase pour avoir les versions actuelles
      const [rec, blocked, intTypes] = await Promise.all([
        loadAgendaKey<Recurrence>(supabase, userId, 'recurrence', {}),
        loadAgendaKey<string[]>(supabase, userId, 'blocked_days', []),
        loadAgendaKey<InterventionType[]>(supabase, userId, 'intervention_types', []),
      ])

      const v2Data = {
        version: 2,
        week_start: formatWeekStart(monday),
        slots,
        recurrence: rec,
        blocked_days: blocked,
        intervention_types: intTypes,
        notes,
        titles,
      }

      await saveArtisanProfile(supabase, userId, { disponibilites: v2Data as unknown as Record<string, unknown> })
      setFeedback({ type: 'success', msg: 'Disponibilites publiees ! Elles sont maintenant visibles sur votre profil.' })
    } catch (err) {
      logger.error('Erreur publication:', err)
      setFeedback({ type: 'error', msg: 'Erreur lors de la sauvegarde en ligne. Réessayez.' })
    }
    setPublishing(false)
  }

  // Auto-dismiss feedback
  useEffect(() => {
    if (!feedback) return
    const timer = setTimeout(() => setFeedback(null), 5000)
    return () => clearTimeout(timer)
  }, [feedback])

  // ===== CUSTOM SLOT =====

  function addCustomSlot() {
    if (!csStart || !csEnd) {
      setCsFeedback({ type: 'error', msg: 'Veuillez remplir les heures de debut et de fin.' })
      return
    }
    const startMin = timeToMinutes(csStart)
    const endMin = timeToMinutes(csEnd)
    if (endMin <= startMin) {
      setCsFeedback({ type: 'error', msg: "L'heure de fin doit etre apres l'heure de debut." })
      return
    }
    if (startMin < GRID_START_MIN || endMin > 18 * 60) {
      setCsFeedback({ type: 'error', msg: 'Les horaires doivent etre entre 8h00 et 18h00.' })
      return
    }

    const dayCol = parseInt(csDay)
    let affectedCount = 0

    setSlots(prev => {
      const next = { ...prev }
      const c = String(dayCol)
      if (!next[c]) next[c] = {}
      else next[c] = { ...next[c] }

      for (let row = 0; row < TOTAL_ROWS; row++) {
        const rowStart = GRID_START_MIN + row * 30
        const rowEnd = rowStart + 30
        if (rowStart < endMin && rowEnd > startMin) {
          if (!isCellBlocked(dayCol)) {
            next[c][String(row)] = csStatus
            affectedCount++
          }
        }
      }
      return next
    })

    const statusLabel = csStatus === 'available' ? 'disponible' : 'indisponible'
    setCsFeedback({
      type: 'success',
      msg: `${DAY_NAMES[dayCol]} ${csStart} - ${csEnd} : marque comme ${statusLabel} (${affectedCount} creneau${affectedCount > 1 ? 'x' : ''})`,
    })
    setTimeout(() => setCsFeedback(null), 4000)
  }

  // ===== RECURRENCE =====

  async function openRecurrenceModal() {
    let rec: Recurrence = {}
    if (userId) {
      // Cache immédiat puis DB
      rec = loadAgendaKeyCached<Recurrence>(userId, 'recurrence', {})
      try {
        rec = await loadAgendaKey<Recurrence>(supabase, userId, 'recurrence', rec)
      } catch { /* fallback cache */ }
    }
    for (let i = 0; i < 7; i++) {
      if (!rec[i]) rec[i] = { enabled: false, start: '08:00', end: '17:00' }
    }
    setRecurrence(rec)
    setShowRecurrence(true)
    setShowSettings(false)
  }

  function applyRecurrenceAction() {
    if (userId) saveAgendaKey(supabase, userId, 'recurrence', recurrence).catch(() => {})
    // Apply recurrence to current grid - only fill empty cells
    setSlots(prev => {
      const next = { ...prev }
      for (let col = 0; col < 7; col++) {
        const d = recurrence[col]
        if (!d?.enabled) continue
        const startMin = timeToMinutes(d.start)
        const endMin = timeToMinutes(d.end)
        const c = String(col)
        if (!next[c]) next[c] = {}
        else next[c] = { ...next[c] }

        for (let row = 0; row < TOTAL_ROWS; row++) {
          const rowStart = GRID_START_MIN + row * 30
          const rowEnd = rowStart + 30
          if (rowStart >= startMin && rowEnd <= endMin && !isCellBlocked(col)) {
            if (!next[c][String(row)]) {
              next[c][String(row)] = 'available'
            }
          }
        }
      }
      return next
    })

    setShowRecurrence(false)
    setFeedback({ type: 'success', msg: 'Horaires de base enregistres et appliques a la semaine courante.' })
  }

  // ===== BLOCKED DAYS =====

  function openBlockModal() {
    // blockedDays est déjà chargé depuis Supabase au mount, on l'utilise directement
    setTempBlockedDays([...blockedDays])
    setBlockFrom('')
    setBlockTo('')
    setShowBlockDays(true)
    setShowSettings(false)
  }

  function toggleTempBlocked(dateStr: string) {
    setTempBlockedDays(prev =>
      prev.includes(dateStr) ? prev.filter(d => d !== dateStr) : [...prev, dateStr]
    )
  }

  function blockAllWeek() {
    const dates: string[] = []
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday)
      d.setDate(monday.getDate() + i)
      dates.push(formatDateStr(d))
    }
    setTempBlockedDays(prev => {
      const set = new Set([...prev, ...dates])
      return Array.from(set)
    })
  }

  function blockDateRange() {
    if (!blockFrom || !blockTo) return
    const start = new Date(blockFrom + 'T00:00:00')
    const end = new Date(blockTo + 'T00:00:00')
    if (end < start) return
    const dates: string[] = []
    const d = new Date(start)
    while (d <= end) {
      dates.push(formatDateStr(d))
      d.setDate(d.getDate() + 1)
    }
    setTempBlockedDays(prev => {
      const set = new Set([...prev, ...dates])
      return Array.from(set)
    })
  }

  function saveBlockedDaysAction() {
    if (userId) saveAgendaKey(supabase, userId, 'blocked_days', tempBlockedDays).catch(() => {})
    setBlockedDays([...tempBlockedDays])
    // Clear cells in blocked days
    setSlots(prev => {
      const next = { ...prev }
      for (let i = 0; i < 7; i++) {
        const d = new Date(monday)
        d.setDate(monday.getDate() + i)
        if (tempBlockedDays.includes(formatDateStr(d))) {
          delete next[String(i)]
        }
      }
      return next
    })
    setShowBlockDays(false)
    setFeedback({ type: 'success', msg: 'Jours bloques enregistres.' })
  }

  // ===== INTERVENTION TYPES =====

  function openInterventionModal() {
    // interventionTypes est déjà chargé depuis Supabase au mount
    setShowInterventionTypes(true)
    setShowSettings(false)
  }

  function addInterventionTypeAction() {
    if (!intName.trim()) return
    setInterventionTypes(prev => [...prev, {
      id: `int_${Date.now()}`,
      name: intName.trim(),
      duration: parseInt(intDuration),
      color: intColor,
    }])
    setIntName('')
  }

  function removeInterventionTypeAction(idx: number) {
    setInterventionTypes(prev => prev.filter((_, i) => i !== idx))
  }

  function saveInterventionTypesAction() {
    if (userId) saveAgendaKey(supabase, userId, 'intervention_types', interventionTypes).catch(() => {})
    setShowInterventionTypes(false)
    setFeedback({ type: 'success', msg: "Types d'interventions enregistres." })
  }

  // ===== CLOSE SETTINGS DROPDOWN ON OUTSIDE CLICK =====

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setShowSettings(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // ===== TITLE BLOCKS (merged spans) =====

  const titleSpans = useMemo(() => {
    const colGroups: Record<string, { row: number; title: string; color: string }[]> = {}
    for (const key in titles) {
      if (!titles[key]) continue
      const parts = key.split('-')
      const col = parts[0]
      const row = parseInt(parts[1])
      const text = getTitleText(titles[key])
      const color = getTitleColor(titles[key])
      if (!text) continue
      if (!colGroups[col]) colGroups[col] = []
      colGroups[col].push({ row, title: text, color })
    }

    const spans: { col: number; startRow: number; endRow: number; title: string; color: string }[] = []
    for (const col in colGroups) {
      const entries = colGroups[col].sort((a, b) => a.row - b.row)
      let current: { startRow: number; endRow: number; title: string; color: string } | null = null
      for (const entry of entries) {
        if (current && entry.row === current.endRow + 1 && entry.title === current.title && entry.color === current.color) {
          current.endRow = entry.row
        } else {
          if (current) spans.push({ col: parseInt(col), ...current })
          current = { startRow: entry.row, endRow: entry.row, title: entry.title, color: entry.color }
        }
      }
      if (current) spans.push({ col: parseInt(col), ...current })
    }
    return spans
  }, [titles])

  // ===== AFFECTATION BLOCKS =====

  const affectationBlocks = useMemo(() => {
    return affectations.map(aff => {
      const affDate = new Date(aff.date_debut + 'T00:00:00')
      const col = Math.round((affDate.getTime() - monday.getTime()) / (1000 * 60 * 60 * 24))
      if (col < 0 || col > 6) return null
      const startMin = timeToMinutes(aff.heure_debut)
      const endMin = timeToMinutes(aff.heure_fin)
      let startRow = Math.floor((startMin - GRID_START_MIN) / 30)
      let endRow = Math.ceil((endMin - GRID_START_MIN) / 30) - 1
      if (startRow < 0) startRow = 0
      if (endRow > 19) endRow = 19
      if (startRow > 19 || endRow < 0) return null
      const empColor = aff.employes?.couleur || '#666'
      const empName = aff.employes?.prenom || ''
      return { aff, col, startRow, endRow, empColor, empName, rowSpan: endRow - startRow + 1 }
    }).filter(Boolean) as { aff: Affectation; col: number; startRow: number; endRow: number; empColor: string; empName: string; rowSpan: number }[]
  }, [affectations, monday])

  // ===== MONTH VIEW =====

  const monthData = useMemo(() => {
    const now = new Date()
    let year = now.getFullYear()
    let month = now.getMonth() + monthOffset
    while (month < 0) { month += 12; year-- }
    while (month > 11) { month -= 12; year++ }

    const label = `${MONTH_NAMES_CAP[month]} ${year}`
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)
    const startDow = (firstDay.getDay() + 6) % 7

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const prevMonth = new Date(year, month, 0)
    const leadingDays: { num: number; isOther: true; dateStr: string }[] = []
    for (let i = startDow - 1; i >= 0; i--) {
      const dayNum = prevMonth.getDate() - i
      const d = new Date(year, month - 1, dayNum)
      leadingDays.push({ num: dayNum, isOther: true, dateStr: formatDateStr(d) })
    }

    const days: { num: number; isOther: boolean; isToday: boolean; dateStr: string; status: string }[] = []
    for (const ld of leadingDays) {
      days.push({ ...ld, isToday: false, status: 'none' })
    }

    for (let d = 1; d <= lastDay.getDate(); d++) {
      const dateObj = new Date(year, month, d)
      const dateStr = formatDateStr(dateObj)
      days.push({
        num: d,
        isOther: false,
        isToday: dateObj.getTime() === today.getTime(),
        dateStr,
        status: getDaySummaryStatus(dateStr),
      })
    }

    const totalCells = startDow + lastDay.getDate()
    const remaining = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7)
    for (let i = 1; i <= remaining; i++) {
      const d = new Date(year, month + 1, i)
      days.push({ num: i, isOther: true, isToday: false, dateStr: formatDateStr(d), status: 'none' })
    }

    return { label, days }
  }, [monthOffset, blockedDays])

  function getDaySummaryStatus(dateStr: string): string {
    if (blockedDays.includes(dateStr)) return 'blocked'
    const d = new Date(dateStr + 'T00:00:00')
    const mon = getMonday(new Date(d))
    // Vue mensuelle : lecture cache localStorage (rapide, synchrone).
    // La DB est la source de vérité quand l'utilisateur navigue sur la semaine.
    const wKey = `week-${formatWeekStart(mon)}`
    const weekData = userId ? loadAgendaKeyCached<{ slots?: Slots }>(userId, wKey, {}) : null

    if (!weekData?.slots) {
      const rec = userId ? loadAgendaKeyCached<Recurrence>(userId, 'recurrence', {}) : {}
      const dow = (d.getDay() + 6) % 7
      if (rec[dow]?.enabled) return 'available'
      return 'none'
    }

    const dow = (d.getDay() + 6) % 7
    const colSlots = weekData.slots[String(dow)]
    if (!colSlots) return 'none'
    let avail = 0, unavail = 0
    for (const r in colSlots) {
      if (colSlots[r] === 'available') avail++
      else if (colSlots[r] === 'unavailable') unavail++
    }
    if (avail === 0 && unavail === 0) return 'none'
    return avail >= unavail ? 'available' : 'unavailable'
  }

  function jumpToWeek(dateStr: string) {
    const target = new Date(dateStr + 'T00:00:00')
    const currentMonday = getMonday(new Date())
    const targetMonday = getMonday(new Date(target))
    const diffDays = Math.round((targetMonday.getTime() - currentMonday.getTime()) / (1000 * 60 * 60 * 24))
    const weekDiff = Math.round(diffDays / 7)
    setWeekOffset(weekDiff)
    setView('week')
  }

  // ===== DURATION LABEL =====

  function durationLabel(d: number): string {
    if (d >= 60) {
      const h = Math.floor(d / 60)
      const m = d % 60
      return `${h}h${m > 0 ? m : ''}`
    }
    return `${d}min`
  }

  // ===== RENDER =====

  return (
    <div>
      <h2 className="font-sora text-[22px] font-extrabold mb-4" style={{ color: 'var(--dark)' }}>
        Agenda
      </h2>

      <div className="bg-white rounded-[var(--radius)] border border-[var(--gray-200)] p-5 max-[600px]:p-3">
        {/* HEADER */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          {/* Week navigation */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigateWeek(-1)}
              className="w-9 h-9 flex items-center justify-center rounded-[var(--radius-sm)] border border-[var(--gray-200)] bg-white hover:bg-[var(--gray-100)] transition-colors"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
            </button>
            <span className="font-sora text-sm font-semibold whitespace-nowrap" style={{ color: 'var(--dark)' }}>
              {weekLabel}
            </span>
            <button
              onClick={() => navigateWeek(1)}
              className="w-9 h-9 flex items-center justify-center rounded-[var(--radius-sm)] border border-[var(--gray-200)] bg-white hover:bg-[var(--gray-100)] transition-colors"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6" /></svg>
            </button>
          </div>

          {/* View toggle */}
          <div className="flex rounded-[var(--radius-sm)] border border-[var(--gray-200)] overflow-hidden">
            <button
              onClick={() => setView('week')}
              className={`px-3 py-1.5 text-xs font-semibold transition-colors ${view === 'week' ? 'bg-[var(--orange)] text-white' : 'bg-white text-[var(--gray-500)] hover:bg-[var(--gray-100)]'}`}
            >
              Semaine
            </button>
            <button
              onClick={() => { setView('month'); setMonthOffset(0) }}
              className={`px-3 py-1.5 text-xs font-semibold transition-colors ${view === 'month' ? 'bg-[var(--orange)] text-white' : 'bg-white text-[var(--gray-500)] hover:bg-[var(--gray-100)]'}`}
            >
              Mois
            </button>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            {/* Settings */}
            <div className="relative" ref={settingsRef}>
              <button
                onClick={() => setShowSettings(p => !p)}
                className="w-9 h-9 flex items-center justify-center rounded-[var(--radius-sm)] border border-[var(--gray-200)] bg-white hover:bg-[var(--gray-100)] transition-colors"
                title="Parametres"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
                </svg>
              </button>
              {showSettings && (
                <div className="absolute right-0 top-full mt-1 bg-white rounded-[var(--radius-sm)] border border-[var(--gray-200)] shadow-lg z-50 min-w-[200px]">
                  <button
                    onClick={openRecurrenceModal}
                    className="flex items-center gap-2 w-full px-4 py-2.5 text-sm hover:bg-[var(--gray-100)] transition-colors text-left"
                    style={{ color: 'var(--dark)' }}
                  >
                    <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 1l4 4-4 4" /><path d="M3 11V9a4 4 0 014-4h14" /><path d="M7 23l-4-4 4-4" /><path d="M21 13v2a4 4 0 01-4 4H3" /></svg>
                    Horaires de base
                  </button>
                  <button
                    onClick={openBlockModal}
                    className="flex items-center gap-2 w-full px-4 py-2.5 text-sm hover:bg-[var(--gray-100)] transition-colors text-left"
                    style={{ color: 'var(--dark)' }}
                  >
                    <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="9" y1="10" x2="15" y2="16" /><line x1="15" y1="10" x2="9" y2="16" /></svg>
                    Bloquer des jours
                  </button>
                  <button
                    onClick={openInterventionModal}
                    className="flex items-center gap-2 w-full px-4 py-2.5 text-sm hover:bg-[var(--gray-100)] transition-colors text-left"
                    style={{ color: 'var(--dark)' }}
                  >
                    <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3" /><path d="M12 1v6m0 6v6m-7-3.5l5.2-3m1.6-.9L17 3.5M5 3.5l5.2 3m1.6.9L17 10.5" /></svg>
                    Types d&apos;interventions
                  </button>
                </div>
              )}
            </div>

            {/* Affecter un employé */}
            <button
              onClick={() => {
                const today = new Date(); today.setHours(0, 0, 0, 0)
                const diff = Math.round((today.getTime() - monday.getTime()) / 86400000)
                openNewAffect(diff >= 0 && diff <= 6 ? diff : 0, 0)
              }}
              className="flex items-center gap-1.5 px-4 py-2 rounded-[var(--radius-sm)] text-sm font-semibold border border-[var(--gray-200)] bg-white hover:bg-[var(--gray-100)] transition-colors"
              style={{ color: 'var(--dark)' }}
              title="Affecter un employé à un chantier"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><line x1="19" y1="8" x2="19" y2="14" /><line x1="22" y1="11" x2="16" y2="11" /></svg>
              <span className="max-[600px]:hidden">Affecter</span>
            </button>

            {/* Publish */}
            <button
              onClick={publishDisponibilites}
              disabled={publishing}
              className="flex items-center gap-1.5 px-4 py-2 rounded-[var(--radius-sm)] text-white text-sm font-semibold transition-opacity disabled:opacity-60"
              style={{ background: 'var(--green)' }}
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12" /></svg>
              {publishing ? 'Publication...' : 'Publier'}
            </button>
          </div>
        </div>

        {/* INFO BAR */}
        {view === 'week' && (
          <div className="flex items-start gap-2 px-3 py-2.5 rounded-[var(--radius-sm)] mb-3 text-xs" style={{ background: 'var(--gray-100)', color: 'var(--gray-500)' }}>
            <svg className="w-4 h-4 flex-shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>
            Cliquez sur un creneau ou glissez pour selectionner plusieurs creneaux, puis choisissez le statut dans le menu contextuel. Clic droit pour ajouter une note.
          </div>
        )}

        {/* FEEDBACK */}
        {feedback && (
          <div
            className={`flex items-center gap-2 px-3 py-2.5 rounded-[var(--radius-sm)] mb-3 text-sm font-medium transition-all ${feedback.type === 'success' ? 'text-[var(--green)]' : 'text-[var(--red)]'}`}
            style={{ background: feedback.type === 'success' ? 'var(--green-light)' : 'var(--red-light)' }}
          >
            {feedback.type === 'success' ? (
              <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>
            ) : (
              <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>
            )}
            {feedback.msg}
          </div>
        )}

        {/* ===== WEEK VIEW ===== */}
        {view === 'week' && (
          <>
            <div className="overflow-x-auto -mx-5 px-5 max-[600px]:-mx-3 max-[600px]:px-3">
              <div
                ref={gridRef}
                className="grid select-none"
                style={{
                  gridTemplateColumns: '56px repeat(7, 1fr)',
                  minWidth: 600,
                }}
                onMouseDown={onGridMouseDown}
                onMouseMove={onGridMouseMove}
                onTouchStart={onGridTouchStart}
                onTouchMove={onGridTouchMove}
                onTouchEnd={onGridTouchEnd}
              >
                {/* Header row */}
                <div className="sticky top-0 z-10 bg-white border-b border-[var(--gray-200)]" />
                {dayHeaders.map((dh, i) => (
                  <div
                    key={i}
                    className={`sticky top-0 z-10 text-center py-2 border-b border-[var(--gray-200)] bg-white text-xs font-semibold
                      ${dh.isToday ? 'text-[var(--orange)]' : ''}
                      ${dh.isBlocked ? 'opacity-50' : ''}
                    `}
                    style={{ color: dh.isToday ? 'var(--orange)' : 'var(--dark)' }}
                  >
                    <span className="max-[500px]:hidden">{dh.name}</span>
                    <span className="hidden max-[500px]:inline">{DAY_NAMES_SHORT[i]}</span>
                    <div className={`text-base font-bold ${dh.isToday ? 'bg-[var(--orange)] text-white w-7 h-7 rounded-full flex items-center justify-center mx-auto mt-0.5' : 'mt-0.5'}`}>
                      {dh.num}
                    </div>
                  </div>
                ))}

                {/* Grid rows */}
                {Array.from({ length: TOTAL_ROWS }, (_, row) => {
                  const tl = TIME_LABELS[row]
                  const isHourStart = row % 2 === 0 && row > 0

                  return (
                    <React.Fragment key={row}>
                      {/* Time label */}
                      <div
                        className={`flex items-center justify-end pr-2 text-[11px] max-[500px]:text-[10px] border-r border-[var(--gray-200)] ${tl.isHalf ? 'border-b border-b-[var(--gray-100)]' : 'border-b border-b-[var(--gray-200)]'}`}
                        style={{ color: 'var(--gray-500)', height: 32 }}
                      >
                        {tl.label}
                      </div>
                      {/* Cells */}
                      {Array.from({ length: 7 }, (_, col) => {
                        const status = getCellStatus(col, row)
                        const blocked = isCellBlocked(col)
                        const selected = isCellSelected(col, row)
                        const key = cellKey(col, row)
                        const hasNote = !!notes[key]

                        // Find title span that starts on this cell
                        const titleSpan = titleSpans.find(s => s.col === col && s.startRow === row)
                        // Find affectation block that starts on this cell
                        const affBlock = affectationBlocks.find(a => a.col === col && a.startRow === row)

                        return (
                          <div
                            key={`${col}-${row}`}
                            data-col={col}
                            data-row={row}
                            className={`relative cursor-pointer transition-colors
                              ${isHourStart ? 'border-t border-t-[var(--gray-200)]' : ''}
                              ${tl.isHalf ? 'border-b border-b-[var(--gray-100)]' : 'border-b border-b-[var(--gray-200)]'}
                              border-r border-r-[var(--gray-100)]
                              ${status === 'available' && !blocked ? 'bg-[var(--green-light)]' : ''}
                              ${status === 'unavailable' && !blocked ? 'bg-[var(--red-light)]' : ''}
                              ${blocked ? 'bg-[repeating-linear-gradient(45deg,var(--gray-100),var(--gray-100)_4px,var(--gray-200)_4px,var(--gray-200)_8px)] pointer-events-none opacity-60' : ''}
                              ${selected ? 'ring-2 ring-inset ring-[var(--orange)] bg-[rgba(232,112,10,0.1)] z-[5]' : ''}
                              hover:bg-[var(--gray-100)]
                            `}
                            style={{ height: 32 }}
                            onContextMenu={(e) => onCellContextMenu(e, col, row)}
                            onMouseEnter={(e) => onCellMouseEnter(e, col, row)}
                            onMouseLeave={onCellMouseLeave}
                          >
                            {/* Note icon */}
                            {hasNote && (
                              <div className="absolute top-0.5 right-0.5 w-3 h-3 opacity-50" style={{ color: 'var(--orange)' }}>
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                              </div>
                            )}

                            {/* Title block (merged span) */}
                            {titleSpan && (
                              <div
                                className="absolute left-0.5 right-0.5 top-0 rounded-[3px] px-1 overflow-hidden pointer-events-none z-[3] border-l-[3px]"
                                style={{
                                  height: (titleSpan.endRow - titleSpan.startRow + 1) * 32,
                                  background: titleSpan.color ? `${titleSpan.color}20` : (status === 'available' ? 'rgba(46,125,50,0.15)' : status === 'unavailable' ? 'rgba(198,40,40,0.15)' : 'rgba(232,112,10,0.1)'),
                                  borderLeftColor: titleSpan.color || (status === 'available' ? 'var(--green)' : status === 'unavailable' ? 'var(--red)' : 'var(--orange)'),
                                }}
                                title={titleSpan.title}
                              >
                                <span
                                  className="text-[10px] font-semibold leading-tight block truncate pt-0.5"
                                  style={{ color: titleSpan.color || (status === 'available' ? 'var(--green)' : status === 'unavailable' ? 'var(--red)' : 'var(--orange)') }}
                                >
                                  {titleSpan.title}
                                </span>
                              </div>
                            )}

                            {/* Affectation overlay */}
                            {affBlock && (
                              <div
                                className="absolute left-0.5 right-0.5 top-0 rounded-[3px] px-1 overflow-hidden z-[4] border-l-[3px] cursor-pointer"
                                style={{
                                  height: affBlock.rowSpan * 32,
                                  background: `${affBlock.empColor}18`,
                                  borderLeftColor: affBlock.empColor,
                                }}
                                title={`${affBlock.aff.titre} - ${affBlock.empName} (${affBlock.aff.heure_debut.substring(0, 5)}-${affBlock.aff.heure_fin.substring(0, 5)}) — cliquez pour modifier`}
                                onClick={(e) => { e.stopPropagation(); openEditAffect(affBlock.aff) }}
                                onMouseDown={(e) => e.stopPropagation()}
                              >
                                <span
                                  className="text-[10px] font-semibold leading-tight block truncate pt-0.5"
                                  style={{ color: affBlock.empColor }}
                                >
                                  {affBlock.empName[0] || ''}. {affBlock.aff.titre}
                                </span>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </React.Fragment>
                  )
                })}
              </div>
            </div>

            {/* LEGEND */}
            <div className="flex flex-wrap gap-4 mt-3 text-xs" style={{ color: 'var(--gray-500)' }}>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm" style={{ background: 'var(--green-light)', border: '1px solid var(--green)' }} />
                Disponible
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm" style={{ background: 'var(--red-light)', border: '1px solid var(--red)' }} />
                Indisponible
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm border border-[var(--gray-200)]" />
                Non defini
              </div>
            </div>

            {/* CUSTOM SLOT FORM */}
            <div className="mt-4">
              <button
                onClick={() => setShowCustomSlot(p => !p)}
                className="flex items-center gap-2 text-sm font-semibold transition-colors hover:opacity-80"
                style={{ color: 'var(--orange)' }}
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                Ajouter un creneau personnalise
              </button>
              {showCustomSlot && (
                <div className="mt-3 p-4 rounded-[var(--radius-sm)] border border-[var(--gray-200)]" style={{ background: 'var(--gray-100)' }}>
                  <div className="text-sm font-semibold mb-3" style={{ color: 'var(--dark)' }}>Creneau personnalise</div>
                  <div className="flex flex-wrap items-end gap-3">
                    <div>
                      <label className="block text-xs mb-1" style={{ color: 'var(--gray-500)' }}>Jour</label>
                      <select value={csDay} onChange={e => setCsDay(e.target.value)} className="h-9 px-2 rounded-[var(--radius-sm)] border border-[var(--gray-200)] text-sm">
                        {DAY_NAMES.map((n, i) => <option key={i} value={i}>{n}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs mb-1" style={{ color: 'var(--gray-500)' }}>Debut</label>
                      <input type="time" value={csStart} onChange={e => setCsStart(e.target.value)} min="08:00" max="17:30" className="h-9 px-2 rounded-[var(--radius-sm)] border border-[var(--gray-200)] text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs mb-1" style={{ color: 'var(--gray-500)' }}>Fin</label>
                      <input type="time" value={csEnd} onChange={e => setCsEnd(e.target.value)} min="08:00" max="18:00" className="h-9 px-2 rounded-[var(--radius-sm)] border border-[var(--gray-200)] text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs mb-1" style={{ color: 'var(--gray-500)' }}>Statut</label>
                      <div className="flex rounded-[var(--radius-sm)] overflow-hidden border border-[var(--gray-200)]">
                        <button
                          onClick={() => setCsStatus('available')}
                          className={`px-3 py-1.5 text-xs font-semibold transition-colors ${csStatus === 'available' ? 'text-white' : 'bg-white text-[var(--gray-500)]'}`}
                          style={csStatus === 'available' ? { background: 'var(--green)' } : {}}
                        >
                          Disponible
                        </button>
                        <button
                          onClick={() => setCsStatus('unavailable')}
                          className={`px-3 py-1.5 text-xs font-semibold transition-colors ${csStatus === 'unavailable' ? 'text-white' : 'bg-white text-[var(--gray-500)]'}`}
                          style={csStatus === 'unavailable' ? { background: 'var(--red)' } : {}}
                        >
                          Indisponible
                        </button>
                      </div>
                    </div>
                    <button
                      onClick={addCustomSlot}
                      className="h-9 px-4 rounded-[var(--radius-sm)] text-white text-sm font-semibold"
                      style={{ background: 'var(--orange)' }}
                    >
                      Appliquer
                    </button>
                  </div>
                  {csFeedback && (
                    <div className={`mt-2 text-xs font-medium ${csFeedback.type === 'success' ? 'text-[var(--green)]' : 'text-[var(--red)]'}`}>
                      {csFeedback.msg}
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}

        {/* ===== MONTH VIEW ===== */}
        {view === 'month' && (
          <div>
            <div className="flex items-center justify-center gap-3 mb-4">
              <button
                onClick={() => setMonthOffset(p => p - 1)}
                className="w-9 h-9 flex items-center justify-center rounded-[var(--radius-sm)] border border-[var(--gray-200)] bg-white hover:bg-[var(--gray-100)] transition-colors"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
              </button>
              <span className="font-sora text-base font-semibold" style={{ color: 'var(--dark)' }}>
                {monthData.label}
              </span>
              <button
                onClick={() => setMonthOffset(p => p + 1)}
                className="w-9 h-9 flex items-center justify-center rounded-[var(--radius-sm)] border border-[var(--gray-200)] bg-white hover:bg-[var(--gray-100)] transition-colors"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6" /></svg>
              </button>
            </div>

            <div className="grid grid-cols-7 gap-px" style={{ background: 'var(--gray-200)' }}>
              {DAY_NAMES_SHORT.map(d => (
                <div key={d} className="bg-white py-2 text-center text-xs font-semibold" style={{ color: 'var(--gray-500)' }}>
                  {d}
                </div>
              ))}
              {monthData.days.map((day, i) => (
                <div
                  key={i}
                  onClick={() => !day.isOther && jumpToWeek(day.dateStr)}
                  className={`bg-white p-2 min-h-[48px] cursor-pointer hover:bg-[var(--gray-100)] transition-colors
                    ${day.isOther ? 'opacity-40' : ''}
                    ${day.isToday ? 'ring-2 ring-inset ring-[var(--orange)]' : ''}
                  `}
                >
                  <div className={`text-xs font-medium ${day.isToday ? 'text-[var(--orange)] font-bold' : ''}`} style={{ color: day.isToday ? 'var(--orange)' : 'var(--dark)' }}>
                    {day.num}
                  </div>
                  {!day.isOther && (
                    <div className="flex gap-0.5 mt-1">
                      {day.status === 'available' && <div className="w-2 h-2 rounded-full" style={{ background: 'var(--green)' }} />}
                      {day.status === 'unavailable' && <div className="w-2 h-2 rounded-full" style={{ background: 'var(--red)' }} />}
                      {day.status === 'blocked' && <div className="w-2 h-2 rounded-full" style={{ background: 'var(--gray-500)' }} />}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ===== CELL POPUP ===== */}
      {popupPos && (
        <div
          ref={popupRef}
          className="fixed z-50 bg-white rounded-[var(--radius)] border border-[var(--gray-200)] shadow-xl p-3 w-[240px]"
          style={{ left: popupPos.x, top: popupPos.y, position: 'absolute' }}
        >
          <div className="flex items-center gap-1.5 text-xs font-semibold mb-2" style={{ color: 'var(--dark)' }}>
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
            Definir le creneau
          </div>
          <input
            type="text"
            value={popupTitle}
            onChange={e => setPopupTitle(e.target.value)}
            placeholder="Titre (ex: RDV M. Dupont)"
            className="w-full h-8 px-2 text-xs border border-[var(--gray-200)] rounded-[var(--radius-sm)] mb-2 outline-none focus:border-[var(--orange)]"
          />
          <button
            onClick={() => applyPopupState('available')}
            className="flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded-[var(--radius-sm)] hover:bg-[var(--green-light)] transition-colors"
            style={{ color: 'var(--green)' }}
          >
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: 'var(--green)' }} />
            Disponible
          </button>
          <button
            onClick={() => applyPopupState('unavailable')}
            className="flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded-[var(--radius-sm)] hover:bg-[var(--red-light)] transition-colors"
            style={{ color: 'var(--red)' }}
          >
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: 'var(--red)' }} />
            Indisponible
          </button>

          {/* Intervention types */}
          {interventionTypes.length > 0 && (
            <>
              <div className="border-t border-[var(--gray-200)] my-1.5" />
              <div className="text-[10px] font-semibold mb-1 px-1" style={{ color: 'var(--gray-500)' }}>Interventions</div>
              {interventionTypes.map(t => (
                <button
                  key={t.id}
                  onClick={() => applyIntervention(t)}
                  className="flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded-[var(--radius-sm)] hover:bg-[var(--gray-100)] transition-colors"
                  style={{ color: 'var(--dark)' }}
                >
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: t.color }} />
                  <span className="truncate">{t.name}</span>
                  <span className="ml-auto text-[10px]" style={{ color: 'var(--gray-500)' }}>{durationLabel(t.duration)}</span>
                </button>
              ))}
            </>
          )}

          <div className="border-t border-[var(--gray-200)] my-1.5" />
          <button
            onClick={openAffectFromSelection}
            className="flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded-[var(--radius-sm)] hover:bg-[var(--gray-100)] transition-colors"
            style={{ color: 'var(--orange)' }}
          >
            <svg className="w-3 h-3 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><line x1="19" y1="8" x2="19" y2="14" /><line x1="22" y1="11" x2="16" y2="11" /></svg>
            Affecter un employé
          </button>
          <div className="border-t border-[var(--gray-200)] my-1.5" />
          <button
            onClick={() => applyPopupState('clear')}
            className="flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded-[var(--radius-sm)] hover:bg-[var(--gray-100)] transition-colors"
            style={{ color: 'var(--gray-500)' }}
          >
            <span className="w-2.5 h-2.5 rounded-full border border-[var(--gray-300)]" />
            Effacer
          </button>
        </div>
      )}

      {/* ===== NOTE POPUP ===== */}
      {notePopupPos && noteTarget && (
        <div
          ref={notePopupRef}
          className="fixed z-50 bg-white rounded-[var(--radius)] border border-[var(--gray-200)] shadow-xl p-3 w-[220px]"
          style={{ left: notePopupPos.x, top: notePopupPos.y }}
        >
          <textarea
            value={noteText}
            onChange={e => setNoteText(e.target.value)}
            placeholder="Ajouter une note..."
            className="w-full h-20 px-2 py-1.5 text-xs border border-[var(--gray-200)] rounded-[var(--radius-sm)] outline-none resize-none focus:border-[var(--orange)]"
            autoFocus
          />
          <div className="flex justify-between mt-2">
            <button onClick={deleteNoteAction} className="text-xs text-[var(--red)] hover:underline">Supprimer</button>
            <button onClick={saveNoteAction} className="text-xs text-white px-3 py-1 rounded-[var(--radius-sm)]" style={{ background: 'var(--green)' }}>Enregistrer</button>
          </div>
        </div>
      )}

      {/* ===== AFFECTATION POPUP ===== */}
      {affPopup.open && (
        <div className="fixed inset-0 bg-black/40 z-[200] flex items-center justify-center" onMouseDown={e => { if (e.target === e.currentTarget) closeAff() }}>
          <div className="bg-white rounded-2xl p-7 w-[440px] max-w-[90vw] max-h-[85vh] overflow-y-auto shadow-[0_20px_60px_rgba(0,0,0,0.15)] max-[600px]:p-5 max-[600px]:w-[95vw]">
            <div className="font-sora text-lg font-bold mb-5 flex items-center gap-2.5">
              <svg className="w-5 h-5 text-[var(--orange)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
              {affPopup.editId ? "Modifier l'affectation" : 'Nouvelle affectation'}
            </div>

            <label className="block text-xs font-semibold text-[var(--gray-600)] mb-1">Titre du chantier *</label>
            <input type="text" placeholder="Ex: Rénovation salle de bain" value={affPopup.data.titre}
              onChange={e => setAffPopup(p => ({ ...p, data: { ...p.data, titre: e.target.value } }))}
              className="w-full px-3.5 py-2.5 border border-[var(--gray-200)] rounded-[10px] text-[13px] mb-3.5 focus:outline-none focus:border-[var(--orange)] focus:shadow-[0_0_0_3px_rgba(232,112,10,0.08)]" />

            <label className="block text-xs font-semibold text-[var(--gray-600)] mb-1">Employé *</label>
            <select value={affPopup.data.employe_id}
              onChange={e => setAffPopup(p => ({ ...p, data: { ...p.data, employe_id: e.target.value } }))}
              className="w-full px-3.5 py-2.5 border border-[var(--gray-200)] rounded-[10px] text-[13px] mb-3.5 focus:outline-none focus:border-[var(--orange)] focus:shadow-[0_0_0_3px_rgba(232,112,10,0.08)]">
              <option value="">Sélectionner un employé</option>
              {employees.map(emp => (
                <option key={emp.id} value={emp.id}>{emp.prenom}{emp.nom ? ' ' + emp.nom : ''}</option>
              ))}
            </select>

            <div className="grid grid-cols-2 gap-3 max-[600px]:grid-cols-1">
              <div>
                <label className="block text-xs font-semibold text-[var(--gray-600)] mb-1">Date</label>
                <input type="date" value={affPopup.data.date}
                  onChange={e => setAffPopup(p => ({ ...p, data: { ...p.data, date: e.target.value } }))}
                  className="w-full px-3.5 py-2.5 border border-[var(--gray-200)] rounded-[10px] text-[13px] mb-3.5 focus:outline-none focus:border-[var(--orange)] focus:shadow-[0_0_0_3px_rgba(232,112,10,0.08)]" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-[var(--gray-600)] mb-1">Début</label>
                  <input type="time" value={affPopup.data.heure_debut}
                    onChange={e => setAffPopup(p => ({ ...p, data: { ...p.data, heure_debut: e.target.value } }))}
                    className="w-full px-3.5 py-2.5 border border-[var(--gray-200)] rounded-[10px] text-[13px] mb-3.5 focus:outline-none focus:border-[var(--orange)] focus:shadow-[0_0_0_3px_rgba(232,112,10,0.08)]" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--gray-600)] mb-1">Fin</label>
                  <input type="time" value={affPopup.data.heure_fin}
                    onChange={e => setAffPopup(p => ({ ...p, data: { ...p.data, heure_fin: e.target.value } }))}
                    className="w-full px-3.5 py-2.5 border border-[var(--gray-200)] rounded-[10px] text-[13px] mb-3.5 focus:outline-none focus:border-[var(--orange)] focus:shadow-[0_0_0_3px_rgba(232,112,10,0.08)]" />
                </div>
              </div>
            </div>

            <label className="block text-xs font-semibold text-[var(--gray-600)] mb-1">Adresse</label>
            <input type="text" placeholder="Rue, ville (optionnel)" value={affPopup.data.adresse}
              onChange={e => setAffPopup(p => ({ ...p, data: { ...p.data, adresse: e.target.value } }))}
              className="w-full px-3.5 py-2.5 border border-[var(--gray-200)] rounded-[10px] text-[13px] mb-3.5 focus:outline-none focus:border-[var(--orange)] focus:shadow-[0_0_0_3px_rgba(232,112,10,0.08)]" />

            <label className="block text-xs font-semibold text-[var(--gray-600)] mb-1">Notes</label>
            <textarea placeholder="Instructions, matériel nécessaire..." value={affPopup.data.notes}
              onChange={e => setAffPopup(p => ({ ...p, data: { ...p.data, notes: e.target.value } }))}
              className="w-full px-3.5 py-2.5 border border-[var(--gray-200)] rounded-[10px] text-[13px] mb-3.5 resize-y min-h-[60px] focus:outline-none focus:border-[var(--orange)] focus:shadow-[0_0_0_3px_rgba(232,112,10,0.08)]" />

            <label className="block text-xs font-semibold text-[var(--gray-600)] mb-1">Lier à une demande</label>
            <select value={affPopup.data.demande_id}
              onChange={e => setAffPopup(p => ({ ...p, data: { ...p.data, demande_id: e.target.value } }))}
              className="w-full px-3.5 py-2.5 border border-[var(--gray-200)] rounded-[10px] text-[13px] mb-3.5 focus:outline-none focus:border-[var(--orange)] focus:shadow-[0_0_0_3px_rgba(232,112,10,0.08)]">
              <option value="">Aucune demande liée</option>
              {activeDemandes.map(d => (
                <option key={d.id} value={d.id}>{(d.client_nom || 'Client') + ' — ' + (d.message || '').substring(0, 30)}</option>
              ))}
            </select>

            <div className="flex justify-between mt-2">
              {affPopup.editId ? (
                <button onClick={removeAff} className="bg-transparent border-none text-[var(--red)] py-2.5 px-0 font-bold text-[13px] cursor-pointer font-sora hover:underline">Supprimer</button>
              ) : <div />}
              <div className="flex gap-2">
                <button onClick={closeAff} className="px-5 py-2.5 rounded-full font-bold text-[13px] cursor-pointer border-none bg-[var(--gray-200)] text-[var(--gray-700)] font-sora transition-all hover:bg-[var(--gray-300)]">Annuler</button>
                <button onClick={saveAff} className="px-5 py-2.5 rounded-full font-bold text-[13px] cursor-pointer border-none bg-[var(--orange)] text-white font-sora transition-all hover:bg-[var(--orange-dark)]">Enregistrer</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== TOOLTIP ===== */}
      {tooltip && (
        <div
          className="fixed z-[60] bg-[var(--dark)] text-white text-[11px] px-2.5 py-1.5 rounded-[var(--radius-sm)] pointer-events-none max-w-[200px] whitespace-pre-line"
          style={{ left: tooltip.x, top: tooltip.y }}
        >
          {tooltip.text}
        </div>
      )}

      {/* ===== RECURRENCE MODAL ===== */}
      {showRecurrence && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40"
          onClick={e => { if (e.target === e.currentTarget) setShowRecurrence(false) }}
        >
          <div className="bg-white rounded-[var(--radius)] p-6 w-full max-w-[520px] mx-4 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="font-sora text-lg font-bold mb-1" style={{ color: 'var(--dark)' }}>Horaires de base</div>
            <div className="text-xs mb-4" style={{ color: 'var(--gray-500)' }}>
              Definissez vos horaires recurrents. Ils seront appliques automatiquement aux nouvelles semaines.
            </div>

            {Array.from({ length: 7 }, (_, i) => {
              const d = recurrence[i] || { enabled: false, start: '08:00', end: '17:00' }
              return (
                <div key={i} className="flex items-center gap-3 py-2 border-b border-[var(--gray-100)]">
                  <span className="text-sm font-medium w-20" style={{ color: 'var(--dark)' }}>{DAY_NAMES[i]}</span>
                  <button
                    onClick={() => setRecurrence(prev => ({
                      ...prev,
                      [i]: { ...prev[i], enabled: !prev[i]?.enabled }
                    }))}
                    className={`w-10 h-5 rounded-full transition-colors relative ${d.enabled ? 'bg-[var(--green)]' : 'bg-[var(--gray-300)]'}`}
                  >
                    <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${d.enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
                  </button>
                  <div className="flex items-center gap-1.5 ml-2">
                    <input
                      type="time"
                      value={d.start || '08:00'}
                      disabled={!d.enabled}
                      onChange={e => setRecurrence(prev => ({
                        ...prev,
                        [i]: { ...prev[i], start: e.target.value }
                      }))}
                      className="h-8 px-2 text-xs border border-[var(--gray-200)] rounded-[var(--radius-sm)] disabled:opacity-40"
                    />
                    <span className="text-xs" style={{ color: 'var(--gray-500)' }}>a</span>
                    <input
                      type="time"
                      value={d.end || '17:00'}
                      disabled={!d.enabled}
                      onChange={e => setRecurrence(prev => ({
                        ...prev,
                        [i]: { ...prev[i], end: e.target.value }
                      }))}
                      className="h-8 px-2 text-xs border border-[var(--gray-200)] rounded-[var(--radius-sm)] disabled:opacity-40"
                    />
                  </div>
                </div>
              )
            })}

            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={() => setShowRecurrence(false)}
                className="px-4 py-2 text-sm rounded-[var(--radius-sm)] border border-[var(--gray-200)]"
                style={{ color: 'var(--gray-500)' }}
              >
                Annuler
              </button>
              <button
                onClick={applyRecurrenceAction}
                className="px-4 py-2 text-sm rounded-[var(--radius-sm)] text-white font-semibold"
                style={{ background: 'var(--green)' }}
              >
                Enregistrer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== BLOCK DAYS MODAL ===== */}
      {showBlockDays && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40"
          onClick={e => { if (e.target === e.currentTarget) setShowBlockDays(false) }}
        >
          <div className="bg-white rounded-[var(--radius)] p-6 w-full max-w-[520px] mx-4 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="font-sora text-lg font-bold mb-1" style={{ color: 'var(--dark)' }}>Bloquer des jours</div>
            <div className="text-xs mb-4" style={{ color: 'var(--gray-500)' }}>
              Selectionnez les jours de la semaine en cours a bloquer, ou definissez une plage de dates.
            </div>

            {/* Week days grid */}
            <div className="grid grid-cols-7 gap-1.5 mb-3">
              {Array.from({ length: 7 }, (_, i) => {
                const d = new Date(monday)
                d.setDate(monday.getDate() + i)
                const dateStr = formatDateStr(d)
                const isBlocked = tempBlockedDays.includes(dateStr)
                return (
                  <button
                    key={i}
                    onClick={() => toggleTempBlocked(dateStr)}
                    className={`py-2 rounded-[var(--radius-sm)] text-center text-xs font-medium transition-colors border
                      ${isBlocked
                        ? 'border-[var(--red)] text-white'
                        : 'border-[var(--gray-200)] hover:border-[var(--orange)]'
                      }`}
                    style={isBlocked ? { background: 'var(--red)', color: 'white' } : { color: 'var(--dark)' }}
                  >
                    {DAY_NAMES[i].substring(0, 3)}<br />{d.getDate()}
                  </button>
                )
              })}
            </div>

            <button
              onClick={blockAllWeek}
              className="w-full py-2 rounded-[var(--radius-sm)] text-white text-sm font-semibold mb-3"
              style={{ background: 'var(--red)' }}
            >
              Bloquer toute la semaine
            </button>

            {/* Date range */}
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <label className="text-xs" style={{ color: 'var(--gray-500)' }}>Du</label>
              <input type="date" value={blockFrom} onChange={e => setBlockFrom(e.target.value)} className="h-8 px-2 text-xs border border-[var(--gray-200)] rounded-[var(--radius-sm)]" />
              <label className="text-xs" style={{ color: 'var(--gray-500)' }}>Au</label>
              <input type="date" value={blockTo} onChange={e => setBlockTo(e.target.value)} className="h-8 px-2 text-xs border border-[var(--gray-200)] rounded-[var(--radius-sm)]" />
              <button onClick={blockDateRange} className="h-8 px-3 text-xs rounded-[var(--radius-sm)] text-white font-semibold" style={{ background: 'var(--orange)' }}>
                Bloquer la plage
              </button>
            </div>

            <div className="text-xs mb-3" style={{ color: 'var(--gray-500)' }}>
              {tempBlockedDays.length === 0 ? 'Aucun jour bloque.' : `${tempBlockedDays.length} jour(s) bloque(s) au total.`}
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowBlockDays(false)}
                className="px-4 py-2 text-sm rounded-[var(--radius-sm)] border border-[var(--gray-200)]"
                style={{ color: 'var(--gray-500)' }}
              >
                Annuler
              </button>
              <button
                onClick={saveBlockedDaysAction}
                className="px-4 py-2 text-sm rounded-[var(--radius-sm)] text-white font-semibold"
                style={{ background: 'var(--green)' }}
              >
                Enregistrer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== INTERVENTION TYPES MODAL ===== */}
      {showInterventionTypes && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40"
          onClick={e => { if (e.target === e.currentTarget) setShowInterventionTypes(false) }}
        >
          <div className="bg-white rounded-[var(--radius)] p-6 w-full max-w-[520px] mx-4 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="font-sora text-lg font-bold mb-1" style={{ color: 'var(--dark)' }}>Types d&apos;interventions</div>
            <div className="text-xs mb-4" style={{ color: 'var(--gray-500)' }}>
              Definissez les types d&apos;interventions que vous proposez.
            </div>

            {/* List */}
            {interventionTypes.length === 0 ? (
              <div className="text-center py-5 text-xs" style={{ color: 'var(--gray-500)' }}>Aucun type d&apos;intervention defini.</div>
            ) : (
              <div className="space-y-1 mb-4">
                {interventionTypes.map((t, idx) => (
                  <div key={t.id} className="flex items-center gap-2 px-2 py-1.5 rounded-[var(--radius-sm)] border border-[var(--gray-100)]">
                    <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: t.color }} />
                    <span className="text-sm flex-1 truncate" style={{ color: 'var(--dark)' }}>{t.name}</span>
                    <span className="text-xs" style={{ color: 'var(--gray-500)' }}>{durationLabel(t.duration)}</span>
                    <button onClick={() => removeInterventionTypeAction(idx)} className="text-[var(--red)] text-lg leading-none hover:opacity-70">&times;</button>
                  </div>
                ))}
              </div>
            )}

            {/* Add form */}
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <input
                type="text"
                value={intName}
                onChange={e => setIntName(e.target.value)}
                placeholder="Nom (ex: Depannage)"
                className="flex-1 min-w-[120px] h-9 px-2 text-sm border border-[var(--gray-200)] rounded-[var(--radius-sm)] outline-none focus:border-[var(--orange)]"
              />
              <select value={intDuration} onChange={e => setIntDuration(e.target.value)} className="h-9 px-2 text-sm border border-[var(--gray-200)] rounded-[var(--radius-sm)]">
                <option value="30">30 min</option>
                <option value="60">1h</option>
                <option value="90">1h30</option>
                <option value="120">2h</option>
                <option value="180">3h</option>
                <option value="240">4h</option>
              </select>
              <input
                type="color"
                value={intColor}
                onChange={e => setIntColor(e.target.value)}
                className="w-9 h-9 border-none cursor-pointer rounded"
              />
              <button
                onClick={addInterventionTypeAction}
                className="h-9 px-4 text-sm rounded-[var(--radius-sm)] text-white font-semibold"
                style={{ background: 'var(--orange)' }}
              >
                Ajouter
              </button>
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowInterventionTypes(false)}
                className="px-4 py-2 text-sm rounded-[var(--radius-sm)] border border-[var(--gray-200)]"
                style={{ color: 'var(--gray-500)' }}
              >
                Annuler
              </button>
              <button
                onClick={saveInterventionTypesAction}
                className="px-4 py-2 text-sm rounded-[var(--radius-sm)] text-white font-semibold"
                style={{ background: 'var(--green)' }}
              >
                Enregistrer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Need React import for JSX fragments
import React from 'react'
