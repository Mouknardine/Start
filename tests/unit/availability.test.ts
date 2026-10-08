import { describe, it, expect } from 'vitest'
import { summarizeWeekAvailability, formatNextSlot, getMonday, formatDateStr } from '@/lib/availability'

// Mercredi 8 octobre 2025, 10h15 (heure locale) — lundi = 6 octobre
const NOW = new Date(2025, 9, 8, 10, 15)
const WEEK = formatDateStr(getMonday(NOW))

// ligne = créneau de 30 min depuis 8h00 : 0 → 8h00, 4 → 10h00, 6 → 11h00
const dispo = (slots: Record<string, Record<string, string>>, extra: object = {}) => ({
  version: 2, week_start: WEEK, slots, ...extra,
})

describe('summarizeWeekAvailability', () => {
  it('semaine du lundi', () => {
    expect(WEEK).toBe('2025-10-06')
  })

  it('non publié : données absentes, invalides ou semaine passée', () => {
    expect(summarizeWeekAvailability(null, NOW).published).toBe(false)
    expect(summarizeWeekAvailability('x', NOW).published).toBe(false)
    expect(summarizeWeekAvailability({ week_start: '2025-09-29', slots: { 3: { 0: 'available' } } }, NOW).published).toBe(false)
  })

  it('ignore les jours passés et les créneaux déjà passés aujourd’hui', () => {
    const res = summarizeWeekAvailability(dispo({
      0: { 2: 'available' },                    // lundi : passé
      2: { 4: 'available', 6: 'available' },    // mercredi 10h00 (passé), 11h00 (à venir)
    }), NOW)
    expect(res.published).toBe(true)
    expect(res.availableDays).toBe(1)
    expect(res.next?.dayIndex).toBe(2)
    expect(res.next?.startMinutes).toBe(11 * 60)
  })

  it('ignore les jours bloqués et les cases non disponibles', () => {
    const res = summarizeWeekAvailability(dispo(
      { 3: { 0: 'available' }, 4: { 0: 'blocked' }, 5: { 2: 'available' } },
      { blocked_days: ['2025-10-09'] },          // jeudi
    ), NOW)
    expect(res.availableDays).toBe(1)
    expect(res.next?.dayIndex).toBe(5)
    expect(res.next?.startMinutes).toBe(9 * 60)
  })

  it('publié mais plus rien à venir', () => {
    const res = summarizeWeekAvailability(dispo({ 1: { 0: 'available' } }), NOW)
    expect(res).toEqual({ published: true, availableDays: 0, next: null })
  })
})

describe('formatNextSlot', () => {
  it('aujourd’hui, demain, puis date courte', () => {
    const at = (dayIndex: number, startMinutes: number) => {
      const date = getMonday(NOW)
      date.setDate(date.getDate() + dayIndex)
      return { date, dayIndex, startMinutes }
    }
    expect(formatNextSlot(at(2, 11 * 60), NOW)).toBe('Aujourd’hui · 11h00')
    expect(formatNextSlot(at(3, 9 * 60 + 30), NOW)).toBe('Demain · 9h30')
    expect(formatNextSlot(at(5, 8 * 60), NOW)).toBe('sam. 11 oct. · 8h00')
  })
})
