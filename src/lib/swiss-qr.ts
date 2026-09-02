// ============================================================================
// swiss-qr.ts — Génération de la section de paiement QR-facture suisse
// ============================================================================
// Produit le « Récépissé + Section paiement » conforme au Swiss Payment
// Standard (croix suisse, scannable par toutes les apps bancaires suisses),
// via la lib `swissqrbill`. Sortie SVG (210mm × 105mm) embarquée dans le PDF.
//
// Repli silencieux (retourne null) si les données nécessaires manquent ou sont
// invalides — l'appelant garde alors le bloc IBAN texte. On ne génère JAMAIS
// un QR non conforme qui ferait échouer le scan en banque.
// ============================================================================

import type { Artisan } from '@/lib/supabase/helpers'
import type { InvoiceData } from '@/lib/invoice-pdf'

type ParsedAddress = { street: string; zip: string; city: string }

/** Extrait rue / NPA / localité d'une adresse suisse en texte libre. */
function parseSwissAddress(raw: string | undefined | null): ParsedAddress | null {
  if (!raw) return null
  const text = String(raw).replace(/\r?\n/g, ', ').replace(/\s+/g, ' ').trim()
  // NPA suisse = 4 chiffres, suivi de la localité.
  const m = text.match(/(\d{4})\s+([A-Za-zÀ-ÿ.\-'\s]+)/)
  if (!m || m.index === undefined) return null
  const zip = m[1]
  const city = m[2].trim().replace(/[,;]+$/, '').trim()
  let street = text.slice(0, m.index).replace(/[,;]\s*$/, '').trim()
  if (!street) street = city
  if (!city) return null
  return { street, zip, city }
}

/** Nettoie un IBAN (sans espaces, majuscules). */
function cleanIban(iban: string): string {
  return iban.replace(/\s+/g, '').toUpperCase()
}

/** Un QR-IBAN a son IID (positions 5–9) entre 30000 et 31999. */
function isQrIban(iban: string): boolean {
  const iid = iban.substring(4, 9)
  if (!/^\d{5}$/.test(iid)) return false
  const n = parseInt(iid, 10)
  return n >= 30000 && n <= 31999
}

// Modulo 10 récursif (norme ESR/QRR) pour le chiffre de contrôle.
const MOD10_TABLE = [0, 9, 4, 6, 8, 2, 7, 1, 3, 5]
function mod10Recursive(input: string): number {
  let carry = 0
  for (const ch of input) carry = MOD10_TABLE[(carry + parseInt(ch, 10)) % 10]
  return (10 - carry) % 10
}

/** Génère une référence QRR (27 chiffres) à partir du numéro de document. */
function buildQrReference(numero: string): string {
  const digits = (numero.replace(/\D/g, '') || '0').slice(-26)
  const base = digits.padStart(26, '0')
  return base + String(mod10Recursive(base))
}

/**
 * Construit la section de paiement QR-facture en SVG, ou null si impossible.
 * Factures uniquement (un devis ne se paie pas).
 */
export async function buildQrBillSvg(doc: InvoiceData, profile: Artisan | null): Promise<string | null> {
  if (doc.type !== 'facture') return null
  if (!profile?.bank_iban) return null
  if (!(doc.total_ttc > 0)) return null

  const account = cleanIban(profile.bank_iban)
  if (!/^(CH|LI)\d{19}$/.test(account)) return null // IBAN suisse/liechtensteinois 21 car.

  const creditorAddr = parseSwissAddress(profile.bank_adresse) || parseSwissAddress(profile.adresse)
  if (!creditorAddr) return null // adresse créancier incomplète → repli texte

  const creditorName = (profile.bank_titulaire?.trim()
    || profile.entreprise?.trim()
    || `${profile.prenom || ''} ${profile.nom || ''}`.trim()).slice(0, 70)
  if (!creditorName) return null

  // Référence : QRR obligatoire pour un QR-IBAN, sinon aucune (message libre).
  const useQrr = isQrIban(account)

  type QrData = {
    amount: number
    currency: 'CHF'
    creditor: { account: string; name: string; address: string; zip: string; city: string; country: string }
    reference?: string
    message?: string
    debtor?: { name: string; address: string; zip: string; city: string; country: string }
  }

  const data: QrData = {
    amount: Math.round(doc.total_ttc * 100) / 100,
    currency: 'CHF',
    creditor: {
      account,
      name: creditorName,
      address: creditorAddr.street.slice(0, 70),
      zip: creditorAddr.zip,
      city: creditorAddr.city.slice(0, 35),
      country: 'CH',
    },
  }
  if (useQrr) data.reference = buildQrReference(doc.numero)
  if (doc.numero) data.message = `Facture ${doc.numero}`.slice(0, 140)

  // Débiteur (client) — uniquement si l'adresse est exploitable.
  const debtorAddr = parseSwissAddress(doc.client_adresse)
  if (debtorAddr && doc.client_nom) {
    data.debtor = {
      name: doc.client_nom.slice(0, 70),
      address: debtorAddr.street.slice(0, 70),
      zip: debtorAddr.zip,
      city: debtorAddr.city.slice(0, 35),
      country: 'CH',
    }
  }

  try {
    // Import dynamique : la lib (~200 ko) n'est chargée qu'à la génération PDF.
    const { SwissQRBill } = await import('swissqrbill/svg')
    const bill = new SwissQRBill(data, { language: 'FR' })
    return bill.toString()
  } catch {
    // Données refusées par la validation stricte du standard → repli texte.
    return null
  }
}
