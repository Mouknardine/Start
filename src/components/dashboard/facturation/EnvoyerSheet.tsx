'use client'

import { useEffect, useState } from 'react'
import Dialog from '@/components/ui/Dialog'
import type { Document } from '@/lib/supabase/helpers'
import { formatCHF, formatDateCH } from '@/lib/facturation'
import { numeroWhatsApp } from '@/lib/phone'
import { btn, Ico, IconCopy, IconDownload } from './ui'

type Props = {
  doc: Document
  entreprise: string
  /** Relance d'une facture impayée : message adapté */
  relance?: boolean
  /** Appelé dès que le document est parti (pour le marquer « envoyé ») */
  onSent: () => void
  onPdf: () => void
  onClose: () => void
}

/**
 * Envoi d'un devis / d'une facture en un geste : un lien que le client ouvre
 * sur son téléphone (consultation, PDF, QR-facture, acceptation du devis),
 * transmis par WhatsApp, SMS, e-mail ou n'importe quelle app.
 */
export default function EnvoyerSheet({ doc, entreprise, relance = false, onSent, onPdf, onClose }: Props) {
  const [url, setUrl] = useState<string | null>(null)
  const [erreur, setErreur] = useState('')
  const [copie, setCopie] = useState(false)

  useEffect(() => {
    let annule = false
    fetch(`/api/documents/${doc.id}/lien`, { method: 'POST' })
      .then(async r => {
        const j = await r.json().catch(() => ({}))
        if (annule) return
        if (r.ok && j.url) setUrl(j.url)
        else setErreur(j.error || 'Le lien n’a pas pu être créé.')
      })
      .catch(() => { if (!annule) setErreur('Pas de connexion : réessayez dans un instant.') })
    return () => { annule = true }
  }, [doc.id])

  const isDevis = doc.type === 'devis'
  const salut = doc.client_nom ? `Bonjour ${doc.client_nom.split(/\s+/)[0]},` : 'Bonjour,'
  const montant = formatCHF(doc.total_ttc)
  const corps = relance
    ? `${salut}\nSauf erreur de notre part, la facture ${doc.numero} de ${montant}${doc.date_echeance ? `, échue le ${formatDateCH(doc.date_echeance)},` : ''} n’est pas encore réglée. La voici, avec la QR-facture pour payer :\n${url}\nMerci d’avance,\n${entreprise}`
    : isDevis
      ? `${salut}\nVoici notre devis ${doc.numero} (${montant}). Vous pouvez le consulter et l’accepter ici :\n${url}\nMeilleures salutations,\n${entreprise}`
      : `${salut}\nVoici la facture ${doc.numero} de ${montant}${doc.date_echeance ? `, payable jusqu’au ${formatDateCH(doc.date_echeance)}` : ''}. Vous pouvez la consulter et la payer avec la QR-facture :\n${url}\nMerci de votre confiance,\n${entreprise}`
  const sujet = `${relance ? 'Rappel : ' : ''}${isDevis ? 'Devis' : 'Facture'} ${doc.numero} — ${entreprise}`
  const tel = numeroWhatsApp(doc.client_telephone)
  const enc = encodeURIComponent

  const liens = url ? [
    { label: 'WhatsApp', href: `https://wa.me/${tel}?text=${enc(corps)}`, couleur: 'bg-[#25D366] text-white', icone: <Ico className="w-6 h-6"><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" /></Ico> },
    { label: 'SMS', href: `sms:${tel ? '+' + tel : ''}?&body=${enc(corps)}`, couleur: 'bg-[var(--blue)] text-white', icone: <Ico className="w-6 h-6"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></Ico> },
    { label: 'E-mail', href: `mailto:${doc.client_email || ''}?subject=${enc(sujet)}&body=${enc(corps)}`, couleur: 'bg-[var(--dark)] text-white', icone: <Ico className="w-6 h-6"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" /></Ico> },
  ] : []

  async function copier() {
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      setCopie(true)
      onSent()
    } catch { /* presse-papiers refusé */ }
  }

  async function autre() {
    if (!url || !navigator.share) return
    try {
      await navigator.share({ title: sujet, text: corps.replace(url, '').trim(), url })
      onSent()
    } catch { /* partage annulé */ }
  }

  return (
    <Dialog onClose={onClose} labelledBy="envoyer-titre" variant="sheet" className="max-w-[460px]">
      <div className="p-5">
        <h3 id="envoyer-titre" className="font-sora font-bold text-lg">{relance ? 'Relancer le client' : `Envoyer ${isDevis ? 'le devis' : 'la facture'}`}</h3>
        <p className="text-[14px] text-[var(--gray-500)] mt-0.5">
          {doc.client_nom || 'Votre client'} reçoit un lien pour {isDevis ? 'consulter et accepter le devis' : 'consulter la facture et payer avec la QR-facture'}.
        </p>

        {!url && !erreur && <div className="skeleton h-[88px] mt-4 rounded-2xl" aria-label="Préparation du lien" />}

        {url && (
          <>
            <div className="grid grid-cols-3 gap-2 mt-4">
              {liens.map(l => (
                <a key={l.label} href={l.href} target={l.label === 'WhatsApp' ? '_blank' : undefined} rel="noopener noreferrer" onClick={() => onSent()}
                  className={`flex flex-col items-center justify-center gap-1.5 h-[88px] rounded-2xl no-underline text-[14px] font-semibold ${l.couleur}`}>
                  {l.icone}{l.label}
                </a>
              ))}
            </div>
            <div className="flex gap-2 mt-2">
              <button type="button" onClick={copier} className={`${btn('secondary')} flex-1`}>
                <IconCopy className="w-[18px] h-[18px]" /> {copie ? 'Lien copié' : 'Copier le lien'}
              </button>
              {typeof navigator !== 'undefined' && 'share' in navigator && (
                <button type="button" onClick={autre} className={`${btn('secondary')} flex-1`}>Autre app…</button>
              )}
            </div>
          </>
        )}

        {erreur && (
          <p role="alert" className="mt-4 p-3 rounded-xl bg-[var(--red-light)] text-[14px] text-[var(--red)]">
            {erreur} Vous pouvez télécharger le PDF et le joindre à votre message.
          </p>
        )}

        <button type="button" onClick={onPdf} className="mt-4 w-full flex items-center justify-center gap-2 h-11 text-[14px] font-semibold text-[var(--gray-700)] bg-transparent border-none cursor-pointer">
          <IconDownload className="w-4 h-4" /> Télécharger le PDF
        </button>
      </div>
    </Dialog>
  )
}
