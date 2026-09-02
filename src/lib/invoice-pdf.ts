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
import type { Artisan } from '@/lib/supabase/helpers'

export type InvoiceLine = {
  description: string
  quantite: number
  unite: string
  prix_unitaire: number
  total: number
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
  total_ttc: number
  date_emission: string
  date_echeance?: string | null
  notes?: string
}

const UNITE_LABELS: Record<string, string> = {
  heure: 'heure', forfait: 'forfait', m2: 'm²', ml: 'ml', unite: 'unité', lot: 'lot',
}

function formatCHF(n: number): string {
  const fixed = Math.abs(n).toFixed(2)
  const [int, dec] = fixed.split('.')
  const formatted = int.replace(/\B(?=(\d{3})+(?!\d))/g, "'")
  return `${n < 0 ? '-' : ''}${formatted}.${dec}`
}

function formatDate(dateStr: string): string {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return dateStr
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`
}

/** Construit le HTML autonome imprimable d'un devis/facture.
 *  `qrSvg` : section de paiement QR-facture suisse (SVG) à placer en bas de la
 *  dernière page A4. Si fournie, elle remplace le bloc IBAN texte. */
export function buildInvoiceHTML(doc: InvoiceData, profile: Artisan | null, qrSvg?: string | null): string {
  const isDevis = doc.type === 'devis'
  const accent = isDevis ? '#E8700A' : '#1565C0'
  const docLabel = isDevis ? 'DEVIS' : 'FACTURE'

  const companyName = profile?.entreprise?.trim()
    || `${profile?.prenom || ''} ${profile?.nom || ''}`.trim()
    || 'Artisan'

  const companyLines = [
    profile?.adresse,
    profile?.telephone,
    profile?.email,
    profile?.site,
    profile?.ide_number ? `IDE : ${profile.ide_number}` : '',
  ].filter(Boolean).map(l => escapeHtml(String(l))).join('<br>')

  const clientLines = [
    doc.client_adresse,
    doc.client_email,
    doc.client_telephone,
  ].filter(Boolean).map(l => escapeHtml(String(l))).join('<br>')

  const rows = doc.lignes.map(l => `
    <tr>
      <td style="padding:8px 6px;border-bottom:1px solid #eee;">${escapeHtml(l.description) || '—'}</td>
      <td style="padding:8px 6px;border-bottom:1px solid #eee;text-align:center;">${l.quantite}</td>
      <td style="padding:8px 6px;border-bottom:1px solid #eee;text-align:center;">${escapeHtml(UNITE_LABELS[l.unite] || l.unite)}</td>
      <td style="padding:8px 6px;border-bottom:1px solid #eee;text-align:right;">${formatCHF(l.prix_unitaire)}</td>
      <td style="padding:8px 6px;border-bottom:1px solid #eee;text-align:right;font-weight:600;">${formatCHF(l.total)}</td>
    </tr>`).join('')

  const remise = doc.montant_remise && doc.montant_remise > 0
    ? `<tr><td style="padding:4px 0;color:#666;">Remise</td><td style="padding:4px 0;text-align:right;color:#C62828;">-${formatCHF(doc.montant_remise)} CHF</td></tr>`
    : ''

  // Bloc paiement texte (factures uniquement, si IBAN renseigné).
  // Masqué quand un QR-facture est présent : le QR porte déjà ces infos.
  const paymentBlock = (!isDevis && !qrSvg && profile?.bank_iban)
    ? `<div style="margin-top:24px;padding:14px 16px;background:#F5F7FA;border-radius:8px;font-size:12px;color:#333;">
         <div style="font-weight:700;text-transform:uppercase;font-size:10px;color:#888;margin-bottom:4px;">Coordonnées de paiement</div>
         <div>${escapeHtml(profile.bank_titulaire || companyName)}</div>
         <div>IBAN : ${escapeHtml(profile.bank_iban)}</div>
         ${profile.bank_bic ? `<div>BIC : ${escapeHtml(profile.bank_bic)}</div>` : ''}
         ${doc.date_echeance ? `<div style="margin-top:4px;">Payable jusqu'au ${formatDate(doc.date_echeance)}</div>` : ''}
       </div>`
    : ''

  const notesBlock = doc.notes
    ? `<div style="margin-top:20px;padding:14px 16px;background:#F5F7FA;border-radius:8px;font-size:12px;color:#444;">
         <div style="font-weight:700;text-transform:uppercase;font-size:10px;color:#888;margin-bottom:4px;">Notes</div>
         ${escapeHtml(doc.notes).replace(/\n/g, '<br>')}
       </div>`
    : ''

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>${escapeHtml(doc.numero || docLabel)}</title>
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1A1A2E; margin: 0; font-size: 13px; line-height: 1.5; }
  table { border-collapse: collapse; width: 100%; }
  .doc-content { padding: 16mm; }
  /* La section QR-facture occupe le bas d'une page A4 dédiée, pleine largeur. */
  .qr-page { page-break-before: always; break-before: page; height: 297mm; display: flex; flex-direction: column; justify-content: flex-end; }
  .qr-page svg { width: 210mm; height: 105mm; display: block; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style>
</head>
<body>
<div class="doc-content">
  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:32px;">
    <div>
      <div style="font-size:20px;font-weight:800;">${escapeHtml(companyName)}</div>
      <div style="font-size:12px;color:#666;margin-top:4px;">${companyLines}</div>
    </div>
    <div style="text-align:right;">
      <div style="display:inline-block;padding:4px 12px;border-radius:4px;font-weight:700;font-size:13px;letter-spacing:.05em;background:${accent}1A;color:${accent};">${docLabel}</div>
      <div style="font-weight:700;font-size:15px;margin-top:8px;">${escapeHtml(doc.numero)}</div>
      <div style="font-size:11px;color:#666;margin-top:4px;">Date : ${formatDate(doc.date_emission)}</div>
      ${doc.date_echeance ? `<div style="font-size:11px;color:#666;">Échéance : ${formatDate(doc.date_echeance)}</div>` : ''}
    </div>
  </div>

  <div style="background:#F5F7FA;padding:14px 16px;border-radius:8px;margin-bottom:24px;">
    <div style="font-weight:700;text-transform:uppercase;font-size:10px;color:#888;margin-bottom:4px;">Client</div>
    <div style="font-weight:600;">${escapeHtml(doc.client_nom) || '—'}</div>
    ${clientLines ? `<div style="font-size:12px;color:#555;margin-top:2px;">${clientLines}</div>` : ''}
  </div>

  <table>
    <thead>
      <tr style="border-bottom:2px solid #1A1A2E;">
        <th style="text-align:left;padding:6px;font-size:10px;text-transform:uppercase;color:#888;">Description</th>
        <th style="text-align:center;padding:6px;font-size:10px;text-transform:uppercase;color:#888;width:50px;">Qté</th>
        <th style="text-align:center;padding:6px;font-size:10px;text-transform:uppercase;color:#888;width:60px;">Unité</th>
        <th style="text-align:right;padding:6px;font-size:10px;text-transform:uppercase;color:#888;width:90px;">Prix</th>
        <th style="text-align:right;padding:6px;font-size:10px;text-transform:uppercase;color:#888;width:90px;">Total</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>

  <div style="display:flex;justify-content:flex-end;margin-top:20px;">
    <table style="width:260px;">
      <tr><td style="padding:4px 0;color:#666;">Sous-total</td><td style="padding:4px 0;text-align:right;">${formatCHF(doc.sous_total)} CHF</td></tr>
      ${remise}
      <tr><td style="padding:4px 0;color:#666;">TVA ${doc.taux_tva}%</td><td style="padding:4px 0;text-align:right;">${formatCHF(doc.montant_tva)} CHF</td></tr>
      <tr style="border-top:2px solid #1A1A2E;"><td style="padding:8px 0;font-weight:800;font-size:15px;">Total TTC</td><td style="padding:8px 0;text-align:right;font-weight:800;font-size:15px;">${formatCHF(doc.total_ttc)} CHF</td></tr>
    </table>
  </div>

  ${paymentBlock}
  ${notesBlock}
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
export async function printInvoice(doc: InvoiceData, profile: Artisan | null): Promise<void> {
  let qrSvg: string | null = null
  try {
    const { buildQrBillSvg } = await import('@/lib/swiss-qr')
    qrSvg = await buildQrBillSvg(doc, profile)
  } catch {
    qrSvg = null
  }
  const html = buildInvoiceHTML(doc, profile, qrSvg)
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
