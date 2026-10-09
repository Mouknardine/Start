import { createServiceClient } from '@/lib/supabase/service'
import { verifierLienDocument } from '@/lib/document-link'
import { buildInvoiceHTML, invoiceDataFromDocument } from '@/lib/invoice-pdf'
import { buildQrBillSvg } from '@/lib/swiss-qr'
import { escapeHtml, type Artisan } from '@/lib/supabase/helpers'
import { CLE_REGLAGES, formatDateCH, formatCHF, normaliserReglages } from '@/lib/facturation'

export const dynamic = 'force-dynamic'

const HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'private, no-store',
  'X-Robots-Tag': 'noindex, nofollow',
}

function pageMessage(titre: string, texte: string, status: number) {
  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${escapeHtml(titre)}</title>
<style>body{font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:#F9FAFB;color:#1A2744;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;padding:24px;text-align:center}h1{font-size:22px;margin:0 0 8px}p{color:#55524D;margin:0 0 20px}a{color:#E8700A;font-weight:700}</style></head>
<body><div><h1>${escapeHtml(titre)}</h1><p>${escapeHtml(texte)}</p><a href="/">Artisano</a></div></body></html>`
  return new Response(html, { status, headers: HEADERS })
}

/**
 * GET /f/:token — le devis ou la facture tel que le client le reçoit :
 * consultable sur téléphone, imprimable en PDF, payable avec la QR-facture,
 * et pour un devis, accepté en un clic.
 */
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const id = verifierLienDocument(token)
  if (!id) return pageMessage('Lien invalide', 'Ce lien n’est pas valable. Demandez un nouveau lien à votre artisan.', 404)
  const admin = createServiceClient()
  if (!admin) return pageMessage('Indisponible', 'Le document ne peut pas être affiché pour le moment.', 503)

  const { data: doc } = await admin.from('documents').select('*').eq('id', id).maybeSingle()
  if (!doc) return pageMessage('Document introuvable', 'Ce document a été supprimé par l’artisan.', 404)

  const [{ data: artisan }, { data: regl }] = await Promise.all([
    admin.from('artisans')
      .select('id, prenom, nom, entreprise, telephone, email, adresse, site, avatar_url, bank_iban, bank_titulaire, bank_adresse, bank_bic')
      .eq('id', doc.artisan_id).maybeSingle(),
    admin.from('agenda_data').select('data').eq('artisan_id', doc.artisan_id).eq('key', CLE_REGLAGES).maybeSingle(),
  ])
  const profile = artisan as Artisan | null
  const reglages = normaliserReglages(regl?.data)
  const data = invoiceDataFromDocument(doc)
  const qr = data.type === 'facture' && doc.statut !== 'payee' ? await buildQrBillSvg(data, profile).catch(() => null) : null
  let html = buildInvoiceHTML(data, profile, qr, { assujettiTva: reglages.assujetti_tva, numeroTva: reglages.numero_tva })

  const isDevis = data.type === 'devis'
  const entreprise = profile?.entreprise || `${profile?.prenom || ''} ${profile?.nom || ''}`.trim() || 'votre artisan'
  const accepteMaintenant = new URL(request.url).searchParams.get('accepte') === '1'
  let note = ''
  let action = ''
  if (isDevis) {
    if (accepteMaintenant) note = `Merci ! Votre accord a bien été transmis à ${entreprise}.`
    else if (doc.statut === 'accepte' || doc.statut === 'converti') note = `Devis accepté${doc.date_acceptation ? ` le ${formatDateCH(doc.date_acceptation)}` : ''}.`
    else if (doc.statut === 'envoye' || doc.statut === 'brouillon') {
      action = `<form method="post" action="/f/${escapeHtml(token)}/accepter"><button type="submit" class="ab-btn ab-primary">Accepter le devis</button></form>`
    }
  } else if (doc.statut === 'payee') {
    note = 'Facture payée. Merci !'
  } else if (qr) {
    action = `<a class="ab-btn ab-primary" href="#qr-facture">Payer</a>`
  }
  // Coordonnées à recopier dans l'e-banking (sur téléphone, on ne peut pas
  // scanner un QR affiché sur son propre écran)
  const paiement = !isDevis && doc.statut !== 'payee' && profile?.bank_iban
    ? `<div class="ab-pay"><div class="ab-pay-in">
        <span><b>IBAN</b> ${escapeHtml(profile.bank_iban)}</span>
        <span><b>En faveur de</b> ${escapeHtml(profile.bank_titulaire || entreprise)}</span>
        <span><b>Montant</b> CHF ${escapeHtml(formatCHF(data.total_ttc).replace(' CHF', ''))}</span>
        <span><b>Message</b> Facture ${escapeHtml(data.numero)}</span>
      </div><p>Scannez la QR-facture avec votre app bancaire, ou recopiez ces informations.</p></div>`
    : ''

  const barre = `<div class="ab-bar"><div class="ab-inner">
    <div class="ab-title"><strong>${isDevis ? 'Devis' : 'Facture'} ${escapeHtml(data.numero)} · ${escapeHtml(formatCHF(data.total_ttc))}</strong><span>${escapeHtml(entreprise)}</span></div>
    <div class="ab-actions">${action}<button type="button" class="ab-btn" onclick="window.print()">Télécharger / imprimer</button></div>
  </div>${note ? `<div class="ab-note">${escapeHtml(note)}</div>` : ''}${paiement}</div>
  <script>(function(){function z(){document.documentElement.style.setProperty('--z',String(Math.min(1,(window.innerWidth-16)/794)))}z();window.addEventListener('resize',z)})()</script>`

  const styles = `<style>
  .ab-bar{position:sticky;top:0;z-index:10;background:#1A2744;color:#fff;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;margin:-6mm 0 6mm}
  .ab-inner{max-width:820px;margin:0 auto;padding:12px 16px;display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap}
  .ab-title strong{display:block;font-size:16px}.ab-title span{font-size:13px;opacity:.75}
  .ab-actions{display:flex;gap:8px;flex-wrap:wrap}.ab-actions form{margin:0}
  .ab-btn{height:44px;padding:0 18px;border-radius:999px;border:0;font-weight:700;font-size:15px;cursor:pointer;background:#fff;color:#1A2744}
  .ab-primary{background:#E8700A;color:#fff}
  .ab-pay{background:#F7F6F3;color:#1A2744;font-size:13px;padding:10px 16px}
  .ab-pay-in{max-width:820px;margin:0 auto;display:flex;flex-wrap:wrap;gap:4px 16px}
  .ab-pay b{color:#6B6A66;font-weight:600;margin-right:4px}
  .ab-pay p{max-width:820px;margin:6px auto 0;color:#55524D}
  a.ab-btn{display:inline-flex;align-items:center;text-decoration:none}
  .ab-note{background:#E8F5E9;color:#1B5E20;text-align:center;font-weight:600;font-size:14px;padding:10px 16px}
  @media screen{.page,.qr-page{zoom:var(--z,1)}}
  @media print{.ab-bar{display:none}.page,.qr-page{zoom:1}}
  </style>`
  html = html.replace('</head>', `<meta name="robots" content="noindex">${styles}</head>`).replace('<body>', `<body>${barre}`)
  return new Response(html, { headers: HEADERS })
}
