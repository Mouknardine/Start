'use client'

/**
 * Indicateur visuel de robustesse de mot de passe.
 * Vérifie en temps réel les critères et affiche une checklist.
 */

type Criterion = { key: string; label: string; test: (pwd: string) => boolean }

const CRITERIA: Criterion[] = [
  { key: 'length', label: 'Au moins 8 caractères', test: (p) => p.length >= 8 },
  { key: 'upper', label: 'Une majuscule (A-Z)', test: (p) => /[A-Z]/.test(p) },
  { key: 'lower', label: 'Une minuscule (a-z)', test: (p) => /[a-z]/.test(p) },
  { key: 'digit', label: 'Un chiffre (0-9)', test: (p) => /[0-9]/.test(p) },
]

/**
 * Vérifie si un mot de passe satisfait tous les critères de robustesse.
 * Doit rester aligné avec le schéma Zod côté serveur (signupArtisanSchema).
 */
export function isPasswordValid(password: string): boolean {
  return CRITERIA.every((c) => c.test(password))
}

export default function PasswordStrength({ password }: { password: string }) {
  if (!password) return null

  const validCount = CRITERIA.filter((c) => c.test(password)).length
  const strength = validCount / CRITERIA.length // 0..1
  const barColor =
    strength < 0.5 ? 'bg-[var(--red)]'
    : strength < 1 ? 'bg-[var(--orange)]'
    : 'bg-[var(--green)]'
  const label =
    strength < 0.5 ? 'Faible'
    : strength < 1 ? 'Moyen'
    : 'Fort'

  return (
    <div className="mt-2">
      {/* Barre de progression */}
      <div className="flex items-center gap-2 mb-2">
        <div className="flex-1 h-1.5 bg-[var(--gray-200)] rounded-full overflow-hidden">
          <div
            className={`h-full transition-all ${barColor}`}
            style={{ width: `${strength * 100}%` }}
          />
        </div>
        <span className={`text-xs font-semibold ${
          strength < 0.5 ? 'text-[var(--red)]'
          : strength < 1 ? 'text-[var(--orange)]'
          : 'text-[var(--green)]'
        }`}>{label}</span>
      </div>

      {/* Checklist */}
      <ul className="space-y-1">
        {CRITERIA.map((c) => {
          const ok = c.test(password)
          return (
            <li key={c.key} className={`flex items-center gap-1.5 text-[12px] ${ok ? 'text-[var(--green)]' : 'text-[var(--gray-500)]'}`}>
              {ok ? (
                <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
                <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                </svg>
              )}
              {c.label}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
