// ============================================================================
// invoice-pdf.ts — Génération PDF des devis / factures
// ============================================================================
// Approche zéro-dépendance : on construit un document HTML autonome (styles
// inline, pas de variables CSS — un iframe d'impression n'hérite pas du thème)
// puis on déclenche le moteur d'impression du navigateur. L'utilisateur choisit
// « Enregistrer au format PDF » → fichier nommé d'après le numéro du document.
//
// Avantages : rendu fidèle, fonctionne hors-ligne, aucune lib lourde (jsPDF…),
// et le moteur natif gère pagination + polices proprement.
// ============================================================================

import { escapeHtml } from '@/lib/supabase/helpers'
import { dateLongue, detailLigne, formatDateCH, formatNumeroTva, localiteDepuisAdresse, quantiteLisible, regrouperLignes } from '@/lib/facturation'
import type { Artisan } from '@/lib/supabase/helpers'

export type InvoiceLine = {
  description: string
  quantite: number
  unite: string
  prix_unitaire: number
  total: number
  categorie?: string
  heures?: number
  personnes?: number
}

export type InvoiceData = {
  type: 'devis' | 'facture'
  numero: string
  client_nom: string
  client_email?: string
  client_telephone?: string
  client_adresse?: string
  lignes: InvoiceLine[]
  sous_total: number
  taux_tva: number
  montant_tva: number
  montant_remise?: number | null
  remise_type?: string | null
  remise_valeur?: number | null
  total_ttc: number
  date_emission: string
  date_echeance?: string | null
  notes?: string
}

/** Réglages de l'artisan utiles au document (TVA). */
export type InvoiceOptions = {
  assujettiTva?: boolean
  numeroTva?: string
}

function formatCHF(n: number): string {
  const fixed = Math.abs(n).toFixed(2)
  const [int, dec] = fixed.split('.')
  const formatted = int.replace(/\B(?=(\d{3})+(?!\d))/g, "'")
  return `${n < 0 ? '−' : ''}${formatted}.${dec}`
}

const esc = (v: unknown) => escapeHtml(String(v ?? ''))
const lines = (raw: string | null | undefined) =>
  String(raw || '').split(/\r?\n|,\s*/).map(x => x.trim()).filter(Boolean)

/**
 * Construit le document HTML autonome (A4) d'un devis ou d'une facture.
 *
 * Mise en page suisse : adresse du client à droite, à la hauteur de la
 * fenêtre d'une enveloppe C5 ; lignes regroupées par main d'œuvre, matériel,
 * déplacements ; total arrondi aux 5 centimes ; mention TVA ou « non
 * assujetti » ; « bon pour accord » à signer sur les devis.
 *
 * Le même HTML sert à l'aperçu dans l'app (styles écran : pages sur fond gris)
 * et à l'impression / PDF. `qrSvg` : section QR-facture sur une page dédiée.
 */
export function buildInvoiceHTML(doc: InvoiceData, profile: Artisan | null, qrSvg?: string | null, options: InvoiceOptions = {}): string {
  const isDevis = doc.type === 'devis'
  const companyName = profile?.entreprise?.trim()
    || `${profile?.prenom || ''} ${profile?.nom || ''}`.trim()
    || 'Artisan'
  const contact = `${profile?.prenom || ''} ${profile?.nom || ''}`.trim()
  const adresse = lines(profile?.adresse)
  const localite = localiteDepuisAdresse(profile?.adresse)
  // Une facture avec TVA est forcément d'un assujetti ; sans TVA, on suit le réglage
  const assujetti = doc.taux_tva > 0 || (options.assujettiTva ?? false)
  const numeroTva = assujetti && options.numeroTva ? formatNumeroTva(options.numeroTva) : ''

  // --- En-tête : expéditeur ---
  const logo = profile?.avatar_url
    ? `<img class="logo" src="${esc(profile.avatar_url)}" alt="">`
    : `<div class="logo logo-txt">${esc(companyName.split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() || '').join(''))}</div>`
  const senderLines = [
    ...adresse,
    [profile?.telephone, profile?.email].filter(Boolean).join(' · '),
    profile?.site || '',
  ].filter(Boolean).map(esc).join('<br>')

  // --- Références ---
  const meta: [string, string][] = [
    [isDevis ? 'Devis n°' : 'Facture n°', doc.numero],
    ['Date', formatDateCH(doc.date_emission)],
  ]
  if (doc.date_echeance) meta.push([isDevis ? 'Valable jusqu’au' : 'Échéance', formatDateCH(doc.date_echeance)])
  if (contact) meta.push(['Votre contact', [contact, profile?.telephone].filter(Boolean).join(', ')])
  if (numeroTva) meta.push(['N° TVA', numeroTva])
  const metaRows = meta.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')

  // --- Destinataire (fenêtre d'enveloppe) ---
  const recipient = [
    `<strong>${esc(doc.client_nom) || '—'}</strong>`,
    ...lines(doc.client_adresse).map(esc),
  ].join('<br>')

  // --- Lignes, regroupées par catégorie ---
  const groupes = regrouperLignes(doc.lignes)
  const plusieurs = groupes.length > 1
  const body = groupes.map(g => {
    const rows = g.lignes.map(l => {
      const detail = detailLigne(l)
      return `<tr>
        <td>${esc(l.description) || '—'}${detail ? `<div class="sub">${esc(detail)}</div>` : ''}</td>
        <td class="r nw">${esc(quantiteLisible(l.quantite, l.unite))}</td>
        <td class="r nw">${formatCHF(l.prix_unitaire)}</td>
        <td class="r nw strong">${formatCHF(l.total)}</td>
      </tr>`
    }).join('')
    const sousTotal = g.lignes.reduce((s, l) => s + (Number(l.total) || 0), 0)
    // Sous-total d'un groupe seulement s'il compte plusieurs lignes
    return (plusieurs ? `<tr class="group"><td colspan="4">${esc(g.titre)}</td></tr>` : '')
      + rows
      + (plusieurs && g.lignes.length > 1 ? `<tr class="group-total"><td colspan="3">Total ${esc(g.titre.toLowerCase())}</td><td class="r nw">${formatCHF(sousTotal)}</td></tr>` : '')
  }).join('')

  // --- Totaux ---
  const remise = doc.montant_remise && doc.montant_remise > 0 ? doc.montant_remise : 0
  const base = Math.round((doc.sous_total - remise) * 100) / 100
  const brut = Math.round((base + doc.montant_tva) * 100) / 100
  const arrondi = Math.round((doc.total_ttc - brut) * 100) / 100
  const totalRows = [
    `<tr><td>${remise || doc.montant_tva ? 'Sous-total' : 'Total hors TVA'}</td><td class="r">${formatCHF(doc.sous_total)}</td></tr>`,
    remise ? `<tr><td>Remise${doc.remise_type === 'pourcentage' && doc.remise_valeur ? ` ${doc.remise_valeur} %` : ''}</td><td class="r">−${formatCHF(remise)}</td></tr>` : '',
    doc.taux_tva > 0 ? `<tr><td>TVA ${doc.taux_tva} %${remise ? ` sur ${formatCHF(base)}` : ''}</td><td class="r">${formatCHF(doc.montant_tva)}</td></tr>` : '',
    arrondi !== 0 && Math.abs(arrondi) < 0.05 ? `<tr><td>Arrondi</td><td class="r">${arrondi > 0 ? '+' : '−'}${formatCHF(Math.abs(arrondi))}</td></tr>` : '',
  ].join('')

  // --- Mentions ---
  const mentions: string[] = []
  if (!assujetti) mentions.push('Non assujetti à la TVA.')
  if (isDevis) {
    if (doc.date_echeance) mentions.push(`Offre valable jusqu’au ${formatDateCH(doc.date_echeance)}.`)
  } else if (doc.date_echeance) {
    const jours = Math.round((Date.parse(doc.date_echeance) - Date.parse(doc.date_emission)) / 86400000)
    mentions.push(`Payable net${jours > 0 ? ` à ${jours} jours` : ''}, soit jusqu’au ${formatDateCH(doc.date_echeance)}.`)
  }
  if (!isDevis && qrSvg) mentions.push('Merci d’utiliser la QR-facture jointe pour votre paiement.')

  const paymentBlock = (!isDevis && !qrSvg && profile?.bank_iban)
    ? `<div class="box">
         <div class="box-title">Coordonnées de paiement</div>
         ${esc(profile.bank_titulaire || companyName)}<br>
         IBAN ${esc(profile.bank_iban)}${profile.bank_bic ? `<br>BIC ${esc(profile.bank_bic)}` : ''}<br>
         Référence : ${esc(doc.numero)}
       </div>`
    : ''

  const notesBlock = doc.notes
    ? `<div class="notes">${esc(doc.notes).replace(/\n/g, '<br>')}</div>`
    : ''

  const signature = isDevis
    ? `<div class="sign">
         <div class="sign-title">Bon pour accord</div>
         <div class="sign-grid">
           <div><div class="sign-line"></div>Lieu et date</div>
           <div><div class="sign-line"></div>Signature du client</div>
         </div>
       </div>`
    : ''

  const footer = [companyName, adresse.join(', '), profile?.telephone, profile?.email, numeroTva]
    .filter(Boolean).map(esc).join(' · ')

  const intro = isDevis
    ? 'Suite à votre demande, nous avons le plaisir de vous remettre notre offre pour les travaux suivants :'
    : 'Nous vous remercions de votre confiance et vous adressons notre facture pour les travaux suivants :'

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(doc.numero || (isDevis ? 'Devis' : 'Facture'))}</title>
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; }
  body { font-family: -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1A2744; font-size: 10pt; line-height: 1.45; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .page { position: relative; width: 210mm; min-height: 297mm; padding: 12mm 15mm 20mm 18mm; background: #fff; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; height: 28mm; }
  .sender { display: flex; gap: 4mm; align-items: flex-start; }
  .logo { width: 14mm; height: 14mm; border-radius: 3mm; object-fit: cover; flex-shrink: 0; }
  .logo-txt { background: #1A2744; color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 12pt; }
  .company { font-size: 13pt; font-weight: 800; line-height: 1.2; }
  .muted { color: #6B6A66; font-size: 8.5pt; margin-top: 1mm; line-height: 1.35; }
  .kind { text-align: right; }
  .kind-label { font-size: 19pt; font-weight: 800; letter-spacing: .02em; color: #1A2744; line-height: 1; }
  .kind-bar { width: 14mm; height: 1.2mm; background: #E8700A; border-radius: 1mm; margin: 2.5mm 0 0 auto; }
  .band { height: 37mm; padding-top: 4mm; }
  .meta { border-collapse: collapse; font-size: 8.5pt; }
  .meta th { text-align: left; font-weight: 600; color: #6B6A66; padding: .5mm 5mm .5mm 0; white-space: nowrap; vertical-align: top; }
  .meta td { padding: .5mm 0; }
  /* Fenêtre à droite d'une enveloppe C5/C6 suisse */
  .recipient { position: absolute; top: 46mm; left: 118mm; width: 76mm; font-size: 10.5pt; line-height: 1.4; }
  .place { color: #6B6A66; font-size: 9pt; margin: 0 0 3mm; }
  h1 { font-size: 13.5pt; margin: 0 0 1.5mm; }
  .intro { margin: 0 0 3.5mm; color: #3B3A37; }
  table.lines { width: 100%; border-collapse: collapse; }
  .lines th { font-size: 7.5pt; text-transform: uppercase; letter-spacing: .04em; color: #6B6A66; text-align: left; padding: 1.6mm 2mm; border-bottom: .5mm solid #1A2744; }
  .lines td { padding: 1.7mm 2mm; border-bottom: .2mm solid #E5E3DE; vertical-align: top; }
  .lines .r { text-align: right; }
  .nw { white-space: nowrap; }
  .strong { font-weight: 700; }
  .sub { color: #6B6A66; font-size: 8.5pt; margin-top: .3mm; }
  .group td { background: #F7F6F3; font-weight: 700; font-size: 7.5pt; text-transform: uppercase; letter-spacing: .05em; color: #55524D; padding-top: 1.2mm; padding-bottom: 1.2mm; }
  .group-total td { color: #55524D; font-size: 8.5pt; border-bottom: .3mm solid #D1CEC7; }
  .totals { display: flex; justify-content: flex-end; margin-top: 3mm; break-inside: avoid; }
  .totals > div { width: 80mm; }
  .totals table { width: 100%; border-collapse: collapse; }
  .totals td { padding: .8mm 2mm; }
  .totals .r { text-align: right; white-space: nowrap; }
  .grand { display: flex; justify-content: space-between; margin-top: 1.5mm; padding: 2.4mm 3mm; background: #1A2744; color: #fff; border-radius: 2mm; font-weight: 800; font-size: 12pt; }
  .mentions { margin-top: 4mm; font-size: 9pt; color: #3B3A37; }
  .mentions p { margin: 0 0 .8mm; }
  .box { margin-top: 3mm; padding: 2.5mm 4mm; background: #F7F6F3; border-radius: 2mm; font-size: 9pt; break-inside: avoid; }
  .box-title { font-weight: 700; font-size: 7.5pt; text-transform: uppercase; letter-spacing: .04em; color: #6B6A66; margin-bottom: .8mm; }
  .notes { margin-top: 3mm; font-size: 9pt; color: #3B3A37; }
  .closing { margin-top: 5mm; font-size: 10pt; break-inside: avoid; }
  .sign { margin-top: 5mm; padding: 3.5mm 4mm; border: .3mm solid #D1CEC7; border-radius: 2mm; break-inside: avoid; }
  .sign-title { font-weight: 700; margin-bottom: 7mm; }
  .sign-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10mm; font-size: 8pt; color: #6B6A66; }
  .sign-line { border-bottom: .3mm solid #1A2744; margin-bottom: 1mm; height: 5mm; }
  .footer { position: absolute; left: 18mm; right: 15mm; bottom: 8mm; padding-top: 2mm; border-top: .2mm solid #E5E3DE; font-size: 7.5pt; color: #8A8680; text-align: center; }
  .qr-page { break-before: page; page-break-before: always; width: 210mm; height: 297mm; display: flex; flex-direction: column; justify-content: flex-end; background: #fff; }
  .qr-page svg { width: 210mm; height: 105mm; display: block; }
  @media screen {
    body { background: #E5E3DE; padding: 6mm 0; }
    .page, .qr-page { margin: 0 auto 6mm; box-shadow: 0 2mm 8mm rgba(0,0,0,.12); }
  }
</style>
</head>
<body>
<div class="page">
  <div class="head">
    <div class="sender">
      ${logo}
      <div>
        <div class="company">${esc(companyName)}</div>
        <div class="muted">${senderLines}</div>
      </div>
    </div>
    <div class="kind">
      <div class="kind-label">${isDevis ? 'DEVIS' : 'FACTURE'}</div>
      <div class="kind-bar"></div>
    </div>
  </div>

  <div class="band">
    <table class="meta">${metaRows}</table>
  </div>
  <div class="recipient">${recipient}</div>

  <div class="place">${esc(localite ? `${localite}, le ${dateLongue(doc.date_emission)}` : `Le ${dateLongue(doc.date_emission)}`)}</div>
  <h1>${isDevis ? 'Devis' : 'Facture'} ${esc(doc.numero)}</h1>
  <p class="intro">${intro}</p>

  <table class="lines">
    <thead><tr><th>Désignation</th><th class="r">Quantité</th><th class="r">Prix unit.</th><th class="r">Montant CHF</th></tr></thead>
    <tbody>${body || '<tr><td colspan="4">—</td></tr>'}</tbody>
  </table>

  <div class="totals">
    <div>
      <table>${totalRows}</table>
      <div class="grand"><span>Total CHF${doc.taux_tva > 0 ? ' TTC' : ''}</span><span>${formatCHF(doc.total_ttc)}</span></div>
    </div>
  </div>

  ${mentions.length ? `<div class="mentions">${mentions.map(m => `<p>${esc(m)}</p>`).join('')}</div>` : ''}
  ${paymentBlock}
  ${notesBlock}
  <div class="closing">Avec nos meilleures salutations.<br><strong>${esc(companyName)}</strong></div>
  ${signature}

  <div class="footer">${footer}</div>
</div>
${qrSvg ? `<div class="qr-page">${qrSvg}</div>` : ''}
</body>
</html>`
}

/**
 * Génère le PDF via le moteur d'impression du navigateur (iframe caché → print).
 * L'utilisateur choisit « Enregistrer au format PDF ». Pas de popup bloquée
 * (déclenché par un clic, dans un iframe same-origin).
 *
 * Pour les factures, tente d'ajouter la section QR-facture suisse (repli sur
 * le bloc IBAN texte si l'IBAN/adresse ne permettent pas un QR conforme).
 */
export async function printInvoice(doc: InvoiceData, profile: Artisan | null, options: InvoiceOptions = {}): Promise<void> {
  let qrSvg: string | null = null
  try {
    const { buildQrBillSvg } = await import('@/lib/swiss-qr')
    qrSvg = await buildQrBillSvg(doc, profile)
  } catch {
    qrSvg = null
  }
  const html = buildInvoiceHTML(doc, profile, qrSvg, options)
  const iframe = document.createElement('iframe')
  iframe.setAttribute('aria-hidden', 'true')
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;'
  document.body.appendChild(iframe)

  const cleanup = () => {
    // Laisse le temps au dialogue d'impression de s'ouvrir avant de retirer l'iframe.
    setTimeout(() => { try { document.body.removeChild(iframe) } catch { /* déjà retiré */ } }, 1000)
  }

  iframe.onload = () => {
    const win = iframe.contentWindow
    if (!win) { cleanup(); return }
    win.focus()
    win.print()
    cleanup()
  }

  const idoc = iframe.contentWindow?.document
  if (!idoc) { document.body.removeChild(iframe); return }
  idoc.open()
  idoc.write(html)
  idoc.close()
}
