/**
 * Disponibilités publiées par un artisan (colonne artisans.disponibilites,
 * écrite par l'agenda du dashboard).
 *
 * Une seule semaine est publiée à la fois :
 *   week_start = lundi de la semaine publiée (YYYY-MM-DD)
 *   slots[jour][ligne] = 'available'
 *     jour  : 0 = lundi … 6 = dimanche
 *     ligne : créneau de 30 min à partir de 8h00
 *   blocked_days = dates (YYYY-MM-DD) bloquées
 *
 * Ces fonctions ne connaissent pas les créneaux déjà réservés (RPC
 * get_booked_slots, par artisan) : elles décrivent ce que l'artisan a publié.
 */

export type DispoData = {
  version?: number
  slots?: Record<string, Record<string, string>>
  week_start?: string
  blocked_days?: string[]
  intervention_types?: unknown[]
}

export const AGENDA_START_MINUTES = 8 * 60
export const SLOT_MINUTES = 30

const JOURS_COURTS = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.']
const MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']

export function getMonday(d: Date): Date {
  const day = d.getDay()
  const monday = new Date(d)
  monday.setDate(d.getDate() - day + (day === 0 ? -6 : 1))
  monday.setHours(0, 0, 0, 0)
  return monday
}

export function formatDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function formatMinutes(total: number): string {
  const h = Math.floor(total / 60)
  const m = total % 60
  return `${h}h${String(m).padStart(2, '0')}`
}

export type NextSlot = { date: Date; dayIndex: number; startMinutes: number }

export type WeekAvailability = {
  /** L'artisan a publié des créneaux pour la semaine en cours. */
  published: boolean
  /** Jours restants de la semaine (aujourd'hui compris) avec au moins un créneau à venir. */
  availableDays: number
  /** Premier créneau publié à venir, ou null. */
  next: NextSlot | null
}

/**
 * Résume les créneaux publiés encore à venir pour la semaine en cours.
 * `now` est injectable pour les tests.
 */
export function summarizeWeekAvailability(dispo: unknown, now: Date = new Date()): WeekAvailability {
  const empty: WeekAvailability = { published: false, availableDays: 0, next: null }
  if (!dispo || typeof dispo !== 'object') return empty
  const d = dispo as DispoData
  const monday = getMonday(now)
  if (!d.slots || d.week_start !== formatDateStr(monday)) return empty

  const blocked = new Set(d.blocked_days || [])
  const todayIndex = (now.getDay() + 6) % 7
  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  let availableDays = 0
  let next: NextSlot | null = null

  for (let dayIndex = todayIndex; dayIndex < 7; dayIndex++) {
    const date = new Date(monday)
    date.setDate(monday.getDate() + dayIndex)
    if (blocked.has(formatDateStr(date))) continue

    const rows = d.slots[String(dayIndex)]
    if (!rows) continue
    const starts = Object.keys(rows)
      .filter((row) => rows[row] === 'available')
      .map((row) => AGENDA_START_MINUTES + Number(row) * SLOT_MINUTES)
      .filter((start) => Number.isFinite(start) && (dayIndex > todayIndex || start > nowMinutes))
      .sort((a, b) => a - b)
    if (starts.length === 0) continue

    availableDays++
    if (!next) next = { date, dayIndex, startMinutes: starts[0] }
  }

  return { published: true, availableDays, next }
}

/** « Aujourd'hui · 14h00 », « Demain · 9h30 », « jeu. 10 oct. · 8h00 ». */
export function formatNextSlot(slot: NextSlot, now: Date = new Date()): string {
  const todayIndex = (now.getDay() + 6) % 7
  const time = formatMinutes(slot.startMinutes)
  if (slot.dayIndex === todayIndex) return `Aujourd’hui · ${time}`
  if (slot.dayIndex === todayIndex + 1) return `Demain · ${time}`
  return `${JOURS_COURTS[slot.dayIndex]} ${slot.date.getDate()} ${MOIS_COURTS[slot.date.getMonth()]} · ${time}`
}
