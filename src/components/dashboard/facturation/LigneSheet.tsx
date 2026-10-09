'use client'

import { useState } from 'react'
import Dialog from '@/components/ui/Dialog'
import DecimalInput from '@/components/ui/DecimalInput'
import {
  CATEGORIES, UNITES, formatCHF, formatDuree, formatPrixCourt, parseDuree, prixDepuisAchat,
  resumeLigne, totalLigne, uniteCourte, uniteLongue, type ReglagesFacturation,
} from '@/lib/facturation'
import { btn, inputCls, LABEL, CatTile, Stepper, Segmented } from './ui'
import type { LineItem } from './lignes'

type Props = {
  ligne: LineItem
  isNew: boolean
  reglages: ReglagesFacturation
  /** `memoriser` : tarif à enregistrer comme valeur par défaut, si l'artisan l'a coché */
  onSave: (ligne: LineItem, memoriser: Partial<ReglagesFacturation> | null) => void
  onDelete?: () => void
  onClose: () => void
}

const DUREES = [
  { h: 0.5, label: '30 min' },
  { h: 1, label: '1 h' },
  { h: 2, label: '2 h' },
  { h: 4, label: '½ journée' },
  { h: 8, label: '1 journée' },
]
const UNITES_MATERIEL = UNITES.filter(u => u.value !== 'heure' && u.value !== 'forfait')
const PAS = 0.25 // 15 minutes

/**
 * Saisie d'une ligne pensée pour un artisan : on choisit d'abord ce qu'on
 * facture (main d'œuvre, matériel, déplacement, forfait), puis seulement
 * les champs utiles, avec ses tarifs habituels déjà remplis.
 */
export default function LigneSheet({ ligne, isNew, reglages, onSave, onDelete, onClose }: Props) {
  const [l, setL] = useState<LineItem>(ligne)
  const [modeAchat, setModeAchat] = useState(ligne.prix_achat !== undefined)
  const [dureeTexte, setDureeTexte] = useState<string | null>(null)
  const tarifRef = l.categorie === 'main_oeuvre' ? reglages.tarif_horaire : l.categorie === 'deplacement' ? reglages.tarif_deplacement : null
  // Premier tarif saisi : on propose de le mémoriser d'office
  const [memoriser, setMemoriser] = useState(tarifRef === 0)
  const [erreur, setErreur] = useState('')

  const cat = CATEGORIES.find(c => c.key === l.categorie) ?? CATEGORIES[3]
  const set = (p: Partial<LineItem>) => setL(x => ({ ...x, ...p }))

  const heures = l.heures ?? 1
  const personnes = l.personnes ?? 1
  const setMO = (p: { heures?: number; personnes?: number }) => {
    const h = Math.max(0, p.heures ?? heures)
    const n = Math.max(1, p.personnes ?? personnes)
    set({ heures: h, personnes: n, quantite: Math.round(h * n * 100) / 100 })
  }

  const marge = l.marge ?? reglages.marge_materiel
  const setAchat = (achat: number, m: number) => set({ prix_achat: achat, marge: m, prix_unitaire: prixDepuisAchat(achat, m) })

  const total = totalLigne(l.quantite, l.prix_unitaire)
  const prixCourt = formatPrixCourt(l.prix_unitaire)
  const calcul = resumeLigne(l)
  const proposeMemo = tarifRef !== null && l.prix_unitaire > 0 && l.prix_unitaire !== tarifRef

  function submit() {
    if ((l.categorie === 'materiel' || l.categorie === 'forfait') && !l.description.trim()) {
      setErreur(l.categorie === 'materiel' ? 'Indiquez l’article (ex. siphon, tuyau…).' : 'Décrivez la prestation.')
      document.getElementById('ligne-desc')?.focus()
      return
    }
    const propre: LineItem = { ...l, description: l.description.trim() }
    if (!modeAchat) { delete propre.prix_achat; delete propre.marge }
    const memo = proposeMemo && memoriser
      ? (l.categorie === 'main_oeuvre' ? { tarif_horaire: l.prix_unitaire } : { tarif_deplacement: l.prix_unitaire })
      : null
    onSave(propre, memo)
  }

  const placeholder = {
    main_oeuvre: 'Ex. Main d’œuvre',
    materiel: 'Ex. Siphon chromé 1¼"',
    deplacement: 'Ex. Déplacement',
    forfait: 'Ex. Remplacement complet du boiler',
  }[l.categorie]

  return (
    <Dialog onClose={onClose} labelledBy="ligne-titre" variant="sheet" className="max-w-[520px]">
      <div className="flex items-center gap-3 p-5 pb-4">
        <CatTile categorie={l.categorie} className="w-11 h-11" />
        <h3 id="ligne-titre" className="font-sora font-bold text-lg">{isNew ? cat.label : `Modifier : ${cat.label.toLowerCase()}`}</h3>
      </div>

      <div className="px-5 flex flex-col gap-4">
        <div>
          <label htmlFor="ligne-desc" className={LABEL}>{l.categorie === 'materiel' ? 'Article' : 'Description'}</label>
          <input id="ligne-desc" type="text" value={l.description} onChange={e => { set({ description: e.target.value }); setErreur('') }}
            placeholder={placeholder} autoComplete="off" autoFocus={isNew && (l.categorie === 'materiel' || l.categorie === 'forfait')}
            aria-invalid={!!erreur || undefined} className={inputCls({ invalid: !!erreur, extra: 'font-semibold' })} />
          {erreur && <p role="alert" className="text-[13px] text-[var(--red)] mt-1">{erreur}</p>}
        </div>

        {l.categorie === 'main_oeuvre' && (
          <>
            <div>
              <span id="ligne-duree-l" className={LABEL}>Durée{personnes > 1 ? ' par personne' : ''}</span>
              <div className="flex items-center gap-2">
                <button type="button" aria-label="Moins 15 minutes" onClick={() => setMO({ heures: Math.max(PAS, Math.round((heures - PAS) * 4) / 4) })}
                  className="w-14 h-14 shrink-0 rounded-2xl bg-[var(--gray-100)] text-2xl text-[var(--dark)] border-none cursor-pointer">−</button>
                <input aria-labelledby="ligne-duree-l" inputMode="text" autoComplete="off"
                  value={dureeTexte ?? formatDuree(heures)}
                  onFocus={e => { setDureeTexte(formatDuree(heures)); e.currentTarget.select() }}
                  onChange={e => { setDureeTexte(e.target.value); const h = parseDuree(e.target.value); if (h !== null) setMO({ heures: h }) }}
                  onBlur={() => setDureeTexte(null)}
                  className="flex-1 min-w-0 h-14 rounded-2xl border border-[var(--gray-200)] text-center font-sora text-[26px] font-extrabold text-[var(--dark)] outline-none focus:border-[var(--orange)]" />
                <button type="button" aria-label="Plus 15 minutes" onClick={() => setMO({ heures: Math.round((heures + PAS) * 4) / 4 })}
                  className="w-14 h-14 shrink-0 rounded-2xl bg-[var(--gray-100)] text-2xl text-[var(--dark)] border-none cursor-pointer">+</button>
              </div>
              <div className="flex flex-wrap gap-2 mt-2.5">
                {DUREES.map(d => (
                  <button key={d.h} type="button" aria-pressed={heures === d.h} onClick={() => setMO({ heures: d.h })}
                    className={`h-9 px-3.5 rounded-full text-[13px] font-semibold border cursor-pointer transition-colors ${heures === d.h ? 'bg-[var(--dark)] border-[var(--dark)] text-white' : 'bg-white border-[var(--gray-200)] text-[var(--dark)]'}`}>
                    {d.label}
                  </button>
                ))}
              </div>
              <p className="text-[12px] text-[var(--gray-500)] mt-2">Vous pouvez aussi taper « 2h30 » ou « 1,5 ».</p>
            </div>
            <div className="grid grid-cols-2 gap-3 [&>div]:min-w-0">
              <div>
                <span className={LABEL}>Personnes</span>
                <Stepper value={personnes} min={1} onChange={n => setMO({ personnes: n })} label="Nombre de personnes" />
              </div>
              <div>
                <label htmlFor="ligne-prix" className={LABEL}>Tarif CHF / heure</label>
                <DecimalInput id="ligne-prix" value={l.prix_unitaire} onValue={n => set({ prix_unitaire: n })} placeholder="95" className={inputCls({ extra: 'text-right font-bold text-[17px]' })} />
              </div>
            </div>
          </>
        )}

        {l.categorie === 'materiel' && (
          <>
            <div className="grid grid-cols-[minmax(0,1fr)_110px] gap-3">
              <div className="min-w-0">
                <span className={LABEL}>Quantité</span>
                <Stepper value={l.quantite} min={0} onChange={n => set({ quantite: n })} label="Quantité" editable />
              </div>
              <div>
                <label htmlFor="ligne-unite" className={LABEL}>Unité</label>
                <select id="ligne-unite" value={l.unite} onChange={e => set({ unite: e.target.value })} className={inputCls({ px: 'px-3' })}>
                  {UNITES_MATERIEL.map(u => <option key={u.value} value={u.value}>{u.court}</option>)}
                </select>
              </div>
            </div>
            <Segmented<'vente' | 'achat'> label="Comment fixer le prix" value={modeAchat ? 'achat' : 'vente'}
              onChange={v => { setModeAchat(v === 'achat'); if (v === 'achat') setAchat(l.prix_achat ?? 0, marge) }}
              options={[{ value: 'vente', label: 'Prix de vente' }, { value: 'achat', label: 'Achat + marge' }]} />
            {modeAchat ? (
              <div className="grid grid-cols-2 gap-3 [&>div]:min-w-0">
                <div>
                  <label htmlFor="ligne-achat" className={LABEL}>Prix d’achat / {uniteCourte(l.unite)}</label>
                  <DecimalInput id="ligne-achat" value={l.prix_achat ?? 0} onValue={n => setAchat(n, marge)} placeholder="0.00" className={inputCls({ extra: 'text-right font-semibold' })} />
                </div>
                <div>
                  <label htmlFor="ligne-marge" className={LABEL}>Marge %</label>
                  <DecimalInput id="ligne-marge" value={marge} onValue={m => setAchat(l.prix_achat ?? 0, m)} className={inputCls({ extra: 'text-right font-semibold' })} />
                </div>
                <p className="col-span-2 text-[14px] text-[var(--gray-700)] -mt-1">
                  Prix de vente : <strong className="text-[var(--dark)]">{formatCHF(l.prix_unitaire)}</strong> / {uniteCourte(l.unite)}
                </p>
              </div>
            ) : (
              <div>
                <label htmlFor="ligne-prix" className={LABEL}>Prix par {uniteLongue(l.unite)} (CHF)</label>
                <DecimalInput id="ligne-prix" value={l.prix_unitaire} onValue={n => set({ prix_unitaire: n })} placeholder="0.00" className={inputCls({ extra: 'text-right font-bold text-[17px]' })} />
              </div>
            )}
          </>
        )}

        {l.categorie === 'deplacement' && (
          <div className="grid grid-cols-2 gap-3 [&>div]:min-w-0">
            <div>
              <span className={LABEL}>Nombre</span>
              <Stepper value={l.quantite} min={1} onChange={n => set({ quantite: n })} label="Nombre de déplacements" />
            </div>
            <div>
              <label htmlFor="ligne-prix" className={LABEL}>CHF / déplacement</label>
              <DecimalInput id="ligne-prix" value={l.prix_unitaire} onValue={n => set({ prix_unitaire: n })} placeholder="60" className={inputCls({ extra: 'text-right font-bold text-[17px]' })} />
            </div>
          </div>
        )}

        {l.categorie === 'forfait' && (
          <div className="grid grid-cols-2 gap-3 [&>div]:min-w-0">
            <div>
              <label htmlFor="ligne-prix" className={LABEL}>Prix (CHF)</label>
              <DecimalInput id="ligne-prix" value={l.prix_unitaire} onValue={n => set({ prix_unitaire: n })} placeholder="0.00" className={inputCls({ extra: 'text-right font-bold text-[17px]' })} />
            </div>
            <div>
              <span className={LABEL}>Quantité</span>
              <Stepper value={l.quantite} min={1} onChange={n => set({ quantite: n })} label="Quantité" />
            </div>
          </div>
        )}

        {proposeMemo && (
          <label className="flex items-start gap-3 p-3 rounded-xl bg-[var(--gray-50)] cursor-pointer">
            <input type="checkbox" checked={memoriser} onChange={e => setMemoriser(e.target.checked)} className="w-5 h-5 mt-0.5 accent-[var(--orange)] shrink-0" />
            <span className="text-[14px] text-[var(--dark)]">
              Utiliser <strong>{prixCourt}</strong> comme {l.categorie === 'main_oeuvre' ? 'tarif horaire' : 'forfait déplacement'} par défaut
              {tarifRef ? <span className="text-[var(--gray-500)]"> (actuellement {formatPrixCourt(tarifRef)})</span> : null}
            </span>
          </label>
        )}
      </div>

      <div className="sticky bottom-0 bg-white border-t border-[var(--gray-100)] p-4 mt-5">
        <div className="flex items-baseline justify-between gap-3 mb-3">
          <span className="text-[14px] text-[var(--gray-500)] truncate">{calcul}</span>
          <span className="font-sora font-extrabold text-[20px] text-[var(--dark)] shrink-0">{formatCHF(total)}</span>
        </div>
        <button type="button" onClick={submit} className={`${btn('primary')} w-full`}>{isNew ? 'Ajouter la ligne' : 'Enregistrer la ligne'}</button>
        {!isNew && onDelete && (
          <button type="button" onClick={onDelete} className={`${btn('dangerSoft')} w-full mt-2`}>Supprimer la ligne</button>
        )}
      </div>
    </Dialog>
  )
}
