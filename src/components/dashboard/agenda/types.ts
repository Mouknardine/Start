import type { DevisPrefill } from '@/lib/facturation'
import type { Artisan } from '@/lib/supabase/helpers'

export type CellStatus = 'available' | 'unavailable'
export type Slots = Record<string, Record<string, CellStatus>>
export type TitleEntry = string | { text: string; color?: string }
export type Titles = Record<string, TitleEntry>
export type Notes = Record<string, string>
export type RecDay = { enabled: boolean; start: string; end: string }
export type Recurrence = Record<number, RecDay>
export type InterventionType = { id: string; name: string; duration: number; color: string }
export type Feedback = { type: 'success' | 'error'; msg: string } | null

export type AgendaProps = {
  userId: string
  profile: Artisan | null
  /** Facturer une intervention planifiée (ouvre l'éditeur de facture pré-rempli) */
  onFacturer?: (p: DevisPrefill) => void
}
