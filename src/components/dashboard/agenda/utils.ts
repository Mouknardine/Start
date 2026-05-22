import type { TitleEntry } from './types'

export function getMonday(d: Date): Date {
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  const monday = new Date(d)
  monday.setDate(diff)
  monday.setHours(0, 0, 0, 0)
  return monday
}

export function formatWeekStart(monday: Date): string {
  const y = monday.getFullYear()
  const m = String(monday.getMonth() + 1).padStart(2, '0')
  const d = String(monday.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function formatDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function getMondayForOffset(offset: number): Date {
  const now = new Date()
  const monday = getMonday(now)
  monday.setDate(monday.getDate() + offset * 7)
  return monday
}

export function timeToMinutes(t: string): number {
  const parts = t.split(':')
  return parseInt(parts[0]) * 60 + parseInt(parts[1])
}

export function getTitleText(entry: TitleEntry | undefined): string {
  if (!entry) return ''
  if (typeof entry === 'string') return entry
  return entry.text || ''
}

export function getTitleColor(entry: TitleEntry | undefined): string {
  if (!entry || typeof entry === 'string') return ''
  return entry.color || ''
}

export function cellKey(col: number, row: number): string {
  return `${col}-${row}`
}
