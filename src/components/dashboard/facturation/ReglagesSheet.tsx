'use client'

import { useState } from 'react'
import Dialog from '@/components/ui/Dialog'
import DecimalInput from '@/components/ui/DecimalInput'
import { createClient } from '@/lib/supabase/client'
import { saveAgendaKey } from '@/lib/supabase/agenda'
import { CLE_REGLAGES, formatNumeroTva, type ReglagesFacturation } from '@/lib/facturation'
import { btn, inputCls, LABEL, Segmented } from './ui'

type Props = {
  userId: string
  reglages: ReglagesFacturation
  onSaved: (r: ReglagesFacturation) => void
  onClose: () => void
}

function Choix({ valeurs, valeur, onChange, suffixe, label }: { valeurs: number[]; valeur: number; onChange: (n: number) => void; suffixe: string; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
      {valeurs.map(v => (
        <button key={v} type="button" role="radio" aria-checked={valeur === v} onClick={() => onChange(v)}
          className={`h-10 px-4 rounded-full text-[14px] font-semibold border cursor-pointer transition-colors ${valeur === v ? 'bg-[var(--dark)] border-[var(--dark)] text-white' : 'bg-white border-[var(--gray-200)] text-[var(--dark)]'}`}>
          {v} {suffixe}
        </button>
      ))}
    </div>
  )
}

/** Réglages de facturation : tarifs habituels, TVA, délais, texte par défaut. */
export default function ReglagesSheet({ userId, reglages, onSaved, onClose }: Props) {
  const [r, setR] = useState<ReglagesFacturation>(reglages)
  const [saving, setSaving] = useState(false)
  const [erreur, setErreur] = useState('')
  const set = (p: Partial<ReglagesFacturation>) => setR(x => ({ ...x, ...p }))

  async function save() {
    setSaving(true)
    setErreur('')
    const propre = { ...r, numero_tva: r.numero_tva ? formatNumeroTva(r.numero_tva) : '' }
    try {
      await saveAgendaKey(createClient(), userId, CLE_REGLAGES, propre)
      onSaved(propre)
    } catch {
      setErreur('Enregistrement impossible. Vérifiez votre connexion et réessayez.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog onClose={onClose} labelledBy="reglages-titre" variant="sheet" className="max-w-[520px]">
      <div className="p-5 pb-2">
        <h3 id="reglages-titre" className="font-sora font-bold text-lg">Réglages de facturation</h3>
        <p className="text-[14px] text-[var(--gray-500)]">Repris automatiquement dans vos nouveaux devis et factures.</p>
      </div>

      <div className="px-5 flex flex-col gap-5">
        <section aria-label="Vos tarifs" className="flex flex-col gap-3">
          <h4 className="text-[13px] font-bold uppercase tracking-wider text-[var(--gray-500)]">Vos tarifs (hors TVA)</h4>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="reg-horaire" className={LABEL}>Tarif horaire (CHF/h)</label>
              <DecimalInput id="reg-horaire" value={r.tarif_horaire} onValue={n => set({ tarif_horaire: n })} placeholder="95" className={inputCls({ extra: 'text-right font-semibold' })} />
            </div>
            <div>
              <label htmlFor="reg-deplacement" className={LABEL}>Déplacement (CHF)</label>
              <DecimalInput id="reg-deplacement" value={r.tarif_deplacement} onValue={n => set({ tarif_deplacement: n })} placeholder="60" className={inputCls({ extra: 'text-right font-semibold' })} />
            </div>
            <div>
              <label htmlFor="reg-marge" className={LABEL}>Marge matériel (%)</label>
              <DecimalInput id="reg-marge" value={r.marge_materiel} onValue={n => set({ marge_materiel: n })} placeholder="20" className={inputCls({ extra: 'text-right font-semibold' })} />
            </div>
          </div>
        </section>

        <section aria-label="TVA" className="flex flex-col gap-3">
          <h4 className="text-[13px] font-bold uppercase tracking-wider text-[var(--gray-500)]">TVA</h4>
          <Segmented<'oui' | 'non'> label="Assujettissement à la TVA" value={r.assujetti_tva ? 'oui' : 'non'}
            onChange={v => set({ assujetti_tva: v === 'oui' })}
            options={[{ value: 'oui', label: 'Assujetti' }, { value: 'non', label: 'Non assujetti' }]} />
          {r.assujetti_tva ? (
            <>
              <div>
                <label htmlFor="reg-tva" className={LABEL}>Numéro TVA</label>
                <input id="reg-tva" type="text" value={r.numero_tva} onChange={e => set({ numero_tva: e.target.value })}
                  onBlur={() => r.numero_tva && set({ numero_tva: formatNumeroTva(r.numero_tva) })}
                  placeholder="CHE-123.456.789 TVA" autoComplete="off" className={INPUT_UPPER} />
                <p className="text-[12px] text-[var(--gray-500)] mt-1">Obligatoire sur une facture avec TVA.</p>
              </div>
              <div>
                <span className={LABEL}>Taux habituel</span>
                <Segmented<number> label="Taux de TVA habituel" value={r.taux_tva} onChange={v => set({ taux_tva: v })}
                  options={[{ value: 8.1, label: '8.1 % (normal)' }, { value: 2.6, label: '2.6 % (réduit)' }]} />
              </div>
            </>
          ) : (
            <p className="text-[14px] text-[var(--gray-700)] p-3 rounded-xl bg-[var(--gray-50)]">
              Vos documents porteront la mention « Non assujetti à la TVA » (chiffre d’affaires inférieur à 100 000 CHF).
            </p>
          )}
        </section>

        <section aria-label="Délais" className="flex flex-col gap-3">
          <h4 className="text-[13px] font-bold uppercase tracking-wider text-[var(--gray-500)]">Délais</h4>
          <div>
            <span className={LABEL}>Paiement des factures</span>
            <Choix label="Délai de paiement" valeurs={[10, 20, 30, 60]} valeur={r.delai_paiement} onChange={n => set({ delai_paiement: n })} suffixe="jours" />
          </div>
          <div>
            <span className={LABEL}>Validité des devis</span>
            <Choix label="Validité des devis" valeurs={[15, 30, 60, 90]} valeur={r.validite_devis} onChange={n => set({ validite_devis: n })} suffixe="jours" />
          </div>
        </section>

        <section aria-label="Texte par défaut">
          <label htmlFor="reg-conditions" className="text-[13px] font-bold uppercase tracking-wider text-[var(--gray-500)] block mb-2">Texte en bas de vos documents</label>
          <textarea id="reg-conditions" value={r.conditions} onChange={e => set({ conditions: e.target.value })} rows={3}
            placeholder="Ex. Travaux garantis 2 ans. Merci de votre confiance."
            className={inputCls({ h: 'h-auto py-3', extra: 'resize-y' })} />
        </section>

        {erreur && <p role="alert" className="text-[14px] text-[var(--red)] font-semibold">{erreur}</p>}
      </div>

      <div className="sticky bottom-0 bg-white border-t border-[var(--gray-100)] p-4 mt-5">
        <button type="button" onClick={save} disabled={saving} className={`${btn('primary')} w-full`}>{saving ? 'Enregistrement…' : 'Enregistrer les réglages'}</button>
      </div>
    </Dialog>
  )
}

const INPUT_UPPER = inputCls({ extra: 'uppercase placeholder:normal-case' })
