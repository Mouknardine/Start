/**
 * Lien `tel:` au format international à partir d'un numéro suisse saisi
 * librement (« 021 123 45 67 », « +41 21 123 45 67 », « 0041 79 … »).
 *
 * Préfixer naïvement « +41 » donnait « +41021… », un numéro invalide.
 */
export function telHref(phone: string | null | undefined): string {
  const raw = (phone || '').trim()
  const digits = raw.replace(/\D/g, '')
  if (!digits) return ''
  if (raw.startsWith('+')) return `tel:+${digits}`
  if (digits.startsWith('00')) return `tel:+${digits.slice(2)}`
  if (digits.startsWith('0')) return `tel:+41${digits.slice(1)}`
  return `tel:+41${digits}`
}

/**
 * Numéro au format WhatsApp (chiffres seuls, indicatif sans « + ») :
 * « 079 123 45 67 » → « 41791234567 ». Vide si aucun chiffre.
 */
export function numeroWhatsApp(phone: string | null | undefined): string {
  return telHref(phone).replace(/^tel:\+/, '')
}
