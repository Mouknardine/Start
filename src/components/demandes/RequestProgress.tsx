import { etapesDemande } from '@/lib/demandes'

/**
 * Avancement d'une demande en étapes (Envoyée → Acceptée → Terminée, ou
 * Envoyée → Déclinée) — modèle « Track Order » de Fiverr, via Mobbin.
 */
export default function RequestProgress({ statut, className = '' }: { statut: string; className?: string }) {
  const etapes = etapesDemande(statut)
  return (
    <ol aria-label="Avancement de la demande" className={`flex items-start list-none p-0 m-0 ${className}`}>
      {etapes.map((e, i) => {
        const done = e.etat === 'fait'
        const current = e.etat === 'actuel'
        const failed = e.etat === 'echec'
        return (
          <li key={e.label} className="flex-1 flex flex-col items-center relative min-w-0">
            {i > 0 && (
              <span
                aria-hidden="true"
                className={`absolute top-[11px] right-1/2 w-full h-0.5 ${done || failed || current ? 'bg-[var(--green)]' : 'bg-[var(--gray-200)]'} ${failed ? '!bg-[var(--red)]' : ''}`}
              />
            )}
            <span
              aria-hidden="true"
              className={`relative z-[1] w-6 h-6 rounded-full flex items-center justify-center text-white text-[11px] font-bold border-2 ${
                failed
                  ? 'bg-[var(--red)] border-[var(--red)]'
                  : done
                    ? 'bg-[var(--green)] border-[var(--green)]'
                    : current
                      ? 'bg-white border-[var(--green)]'
                      : 'bg-white border-[var(--gray-300)]'
              }`}
            >
              {failed ? (
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5"><path d="M18 6L6 18M6 6l12 12" /></svg>
              ) : done ? (
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5"><polyline points="20 6 9 17 4 12" /></svg>
              ) : current ? (
                <span className="w-2 h-2 rounded-full bg-[var(--green)] animate-pulse" />
              ) : null}
            </span>
            <span className={`mt-1.5 text-[11px] font-semibold text-center ${failed ? 'text-[var(--red)]' : done || current ? 'text-[var(--dark)]' : 'text-[var(--gray-500)]'}`}>
              {e.label}
              <span className="sr-only">
                {failed ? ' (déclinée)' : done ? ' (fait)' : current ? ' (en cours)' : ' (à venir)'}
              </span>
            </span>
          </li>
        )
      })}
    </ol>
  )
}
