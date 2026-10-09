'use client'

import { useState, type InputHTMLAttributes } from 'react'
import { parseDecimal, formatDecimalInput } from '@/lib/facturation'

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> & {
  value: number
  onValue: (n: number) => void
}

/**
 * Champ numérique pour le mobile : clavier décimal, virgule acceptée
 * (« 1,5 »), apostrophes de milliers ignorées. Le texte tapé est conservé
 * tant que le champ a le focus, puis remis au propre à la sortie.
 */
export default function DecimalInput({ value, onValue, onFocus, onBlur, ...rest }: Props) {
  const [draft, setDraft] = useState<string | null>(null)
  return (
    <input
      {...rest}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      value={draft ?? formatDecimalInput(value)}
      onFocus={(e) => {
        setDraft(formatDecimalInput(value))
        e.currentTarget.select()
        onFocus?.(e)
      }}
      onChange={(e) => {
        const text = e.target.value.replace(/[^0-9.,'’\s]/g, '')
        setDraft(text)
        onValue(parseDecimal(text))
      }}
      onBlur={(e) => {
        setDraft(null)
        onBlur?.(e)
      }}
    />
  )
}
