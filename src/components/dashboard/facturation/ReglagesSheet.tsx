'use client'

import { useEffect, useState } from 'react'
import Dialog from '@/components/ui/Dialog'
import DecimalInput from '@/components/ui/DecimalInput'
import { createClient } from '@/lib/supabase/client'
import { saveAgendaKey } from '@/lib/supabase/agenda'
import { loadMyBankDetails, saveMyBankDetails } from '@/lib/supabase/helpers'
import { CLE_REGLAGES, formatNumeroTva, ibanValide, formatIban, type ReglagesFacturation } from '@/lib/facturation'
import { parseSwissAddress } from '@/lib/swiss-qr'
import { btn, inputCls, LABEL, Segmented } from './ui'

export type BankDetails = { bank_iban: string; bank_bic: string; bank_titulaire: string; bank_adresse: string }

type Props = {
  userId: string
  reglages: ReglagesFacturation
  /** Adresse de l'entreprise (profil) : sert à la QR-facture si le titulaire n'en a pas */
  adresseEntreprise?: string
  /** Ouvre directement sur la section paiement (IBAN) */
  focus?: 'paiement'
  onSaved: (r: ReglagesFacturation, bank: BankDetails | null) => void
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
export default function ReglagesSheet({ userId, reglages, adresseEntreprise = '', focus, onSaved, onClose }: Props) {
  const [r, setR] = useState<ReglagesFacturation>(reglages)
  const [bank, setBank] = useState<BankDetails>({ bank_iban: '', bank_bic: '', bank_titulaire: '', bank_adresse: '' })
  const [bankInitial, setBankInitial] = useState('')
  const [saving, setSaving] = useState(false)
  const [erreur, setErreur] = useState('')
  const set = (p: Partial<ReglagesFacturation>) => setR(x => ({ ...x, ...p }))
  const setB = (p: Partial<BankDetails>) => setBank(x => ({ ...x, ...p }))

  // Coordonnées bancaires : privées, chargées à part (RPC sécurisée)
  useEffect(() => {
    loadMyBankDetails(createClient()).then(b => {
      if (!b) return
      setBank(b)
      setBankInitial(JSON.stringify(b))
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (focus === 'paiement') document.getElementById('reg-paiement')?.scrollIntoView({ block: 'start' })
  }, [focus])

  const ibanSaisi = bank.bank_iban.trim()
  const ibanErreur = ibanSaisi && !ibanValide(ibanSaisi) ? 'IBAN invalide : vérifiez les chiffres (IBAN suisse, 21 caractères).' : ''
  const adresseQr = parseSwissAddress(bank.bank_adresse) || parseSwissAddress(adresseEntreprise)
  const qrPret = !!ibanSaisi && !ibanErreur && !!adresseQr

  async function save() {
    if (ibanErreur) { setErreur(ibanErreur); document.getElementById('reg-iban')?.focus(); return }
    setSaving(true)
    setErreur('')
    const propre = { ...r, numero_tva: r.numero_tva ? formatNumeroTva(r.numero_tva) : '' }
    const bankPropre: BankDetails = {
      bank_iban: ibanSaisi ? formatIban(ibanSaisi) : '',
      bank_bic: bank.bank_bic.trim(),
      bank_titulaire: bank.bank_titulaire.trim(),
      bank_adresse: bank.bank_adresse.trim(),
    }
    try {
      const supabase = createClient()
      await saveAgendaKey(supabase, userId, CLE_REGLAGES, propre)
      const bankChange = JSON.stringify(bankPropre) !== bankInitial && (bankInitial || ibanSaisi)
      if (bankChange) await saveMyBankDetails(supabase, bankPropre)
      onSaved(propre, bankChange ? bankPropre : null)
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

        <section id="reg-paiement" aria-label="Paiement par QR-facture" className="flex flex-col gap-3 scroll-mt-4">
          <h4 className="text-[13px] font-bold uppercase tracking-wider text-[var(--gray-500)]">Paiement · QR-facture</h4>
          <div>
            <label htmlFor="reg-iban" className={LABEL}>IBAN</label>
            <input id="reg-iban" type="text" value={bank.bank_iban} onChange={e => setB({ bank_iban: e.target.value })}
              onBlur={() => ibanSaisi && ibanValide(ibanSaisi) && setB({ bank_iban: formatIban(ibanSaisi) })}
              placeholder="CH93 0076 2011 6238 5295 7" autoComplete="off" spellCheck={false} aria-invalid={!!ibanErreur || undefined}
              className={inputCls({ invalid: !!ibanErreur, extra: 'uppercase placeholder:normal-case tracking-wide' })} />
            {ibanErreur && <p className="text-[13px] text-[var(--red)] mt-1">{ibanErreur}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3 [&>div]:min-w-0">
            <div>
              <label htmlFor="reg-titulaire" className={LABEL}>Titulaire du compte</label>
              <input id="reg-titulaire" type="text" value={bank.bank_titulaire} onChange={e => setB({ bank_titulaire: e.target.value })} placeholder="Nom de l’entreprise" autoComplete="off" className={inputCls()} />
            </div>
            <div>
              <label htmlFor="reg-bic" className={LABEL}>BIC (facultatif)</label>
              <input id="reg-bic" type="text" value={bank.bank_bic} onChange={e => setB({ bank_bic: e.target.value })} autoComplete="off" className={inputCls({ extra: 'uppercase' })} />
            </div>
          </div>
          <div>
            <label htmlFor="reg-adresse" className={LABEL}>Adresse du titulaire {parseSwissAddress(adresseEntreprise) ? '(si différente)' : ''}</label>
            <input id="reg-adresse" type="text" value={bank.bank_adresse} onChange={e => setB({ bank_adresse: e.target.value })} placeholder={adresseEntreprise || 'Rue et n°, NPA Localité'} autoComplete="off" className={inputCls()} />
          </div>
          <p className={`text-[13px] p-3 rounded-xl ${qrPret ? 'bg-[var(--green-light)] text-[var(--green)]' : 'bg-[var(--gray-50)] text-[var(--gray-700)]'}`}>
            {qrPret
              ? '✓ Vos factures portent la QR-facture : votre client paie en scannant avec son app bancaire.'
              : !ibanSaisi
                ? 'Avec votre IBAN, chaque facture porte une QR-facture que le client scanne pour payer.'
                : !adresseQr ? 'Indiquez une adresse avec NPA (ex. Rue du Lac 15, 1003 Lausanne) pour la QR-facture.' : ''}
          </p>
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
