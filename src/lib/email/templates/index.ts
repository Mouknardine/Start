import { emailLayout, escape } from './layout'
import { getSiteUrl } from '@/lib/site'

const base = () => getSiteUrl()

// ============================================================================
// NOUVELLE DEMANDE REÇUE (→ artisan)
// ============================================================================

export function newDemandeEmail(opts: {
  artisanPrenom: string
  clientNom: string
  metier?: string
  type: string
  messagePreview: string
  demandeId: string
}) {
  const { artisanPrenom, clientNom, type, messagePreview, demandeId } = opts
  const subject = `📬 Nouvelle ${type === 'devis' ? 'demande de devis' : 'demande'} de ${clientNom}`
  const html = emailLayout({
    title: `Bonjour ${escape(artisanPrenom)}, vous avez une nouvelle demande`,
    body: `
      <p><strong>${escape(clientNom)}</strong> vient de vous envoyer ${type === 'devis' ? 'une demande de devis' : 'un message'}.</p>
      <div style="margin:16px 0;padding:16px;background:#f9f9f7;border-radius:12px;border-left:3px solid #E8700A;">
        <p style="margin:0;font-style:italic;color:#3a3a3a;">${escape(messagePreview.slice(0, 200))}${messagePreview.length > 200 ? '…' : ''}</p>
      </div>
      <p>Connectez-vous à votre tableau de bord pour répondre.</p>
    `,
    ctaLabel: 'Voir la demande',
    ctaUrl: `${base()}/dashboard?demande=${demandeId}`,
    footerNote: 'Astuce : répondez rapidement, les clients choisissent souvent le premier artisan disponible.',
  })
  return { subject, html }
}

// ============================================================================
// NOUVEAU MESSAGE DANS LE CHAT (→ destinataire)
// ============================================================================

export function newMessageEmail(opts: {
  recipientName: string
  senderName: string
  senderType: 'client' | 'artisan'
  messagePreview: string
  demandeId: string
  recipientType: 'client' | 'artisan'
}) {
  const { recipientName, senderName, messagePreview, demandeId, recipientType } = opts
  const subject = `💬 Nouveau message de ${senderName}`
  const ctaUrl = recipientType === 'artisan'
    ? `${base()}/dashboard?demande=${demandeId}`
    : `${base()}/client?demande=${demandeId}`

  const html = emailLayout({
    title: `${escape(recipientName)}, ${escape(senderName)} vous a répondu`,
    body: `
      <div style="margin:16px 0;padding:16px;background:#f9f9f7;border-radius:12px;border-left:3px solid #E8700A;">
        <p style="margin:0;color:#3a3a3a;">${escape(messagePreview.slice(0, 200))}${messagePreview.length > 200 ? '…' : ''}</p>
      </div>
    `,
    ctaLabel: 'Lire et répondre',
    ctaUrl,
  })
  return { subject, html }
}

// ============================================================================
// DEMANDE ACCEPTÉE / REFUSÉE (→ client)
// ============================================================================

export function demandeStatusEmail(opts: {
  clientNom: string
  artisanName: string
  newStatus: 'acceptee' | 'refusee' | 'terminee'
  demandeId: string
}) {
  const { clientNom, artisanName, newStatus, demandeId } = opts
  const statusLabel = newStatus === 'acceptee' ? 'acceptée'
    : newStatus === 'refusee' ? 'refusée'
    : 'terminée'
  const emoji = newStatus === 'acceptee' ? '✅' : newStatus === 'refusee' ? '❌' : '🎉'

  const body = newStatus === 'acceptee'
    ? `<p>Bonne nouvelle ! <strong>${escape(artisanName)}</strong> a <strong>accepté</strong> votre demande.</p><p>Il/elle va vous recontacter rapidement pour les détails de l'intervention.</p>`
    : newStatus === 'refusee'
    ? `<p>Malheureusement, <strong>${escape(artisanName)}</strong> n'est pas disponible pour votre demande.</p><p>Pas de panique, vous pouvez trouver un autre artisan en quelques clics.</p>`
    : `<p>Votre intervention avec <strong>${escape(artisanName)}</strong> est marquée comme terminée.</p><p>Si tout s'est bien passé, n'oubliez pas de laisser un avis !</p>`

  const subject = `${emoji} Votre demande a été ${statusLabel}`
  const html = emailLayout({
    title: `${escape(clientNom)}, votre demande est ${statusLabel}`,
    body,
    ctaLabel: newStatus === 'refusee' ? 'Trouver un autre artisan' : newStatus === 'terminee' ? 'Laisser un avis' : 'Voir la demande',
    ctaUrl: newStatus === 'refusee'
      ? `${base()}/recherche`
      : newStatus === 'terminee'
      ? `${base()}/client?demande=${demandeId}#avis`
      : `${base()}/client?demande=${demandeId}`,
  })
  return { subject, html }
}

// ============================================================================
// BIENVENUE ARTISAN (→ artisan à l'inscription)
// ============================================================================

export function welcomeArtisanEmail(opts: { prenom: string }) {
  const { prenom } = opts
  const subject = `🎉 Bienvenue sur Artisano, ${prenom} !`
  const html = emailLayout({
    title: `Bienvenue ${escape(prenom)} !`,
    body: `
      <p>Votre compte artisan Artisano est créé. Vous êtes prêt à recevoir vos premières demandes de clients de votre région.</p>
      <p style="margin-top:16px;"><strong>Pour bien démarrer :</strong></p>
      <ul style="padding-left:20px;line-height:1.7;">
        <li>Complétez votre profil (photo, description, galerie de réalisations)</li>
        <li>Configurez vos disponibilités dans l'agenda</li>
        <li>Activez le mode urgence si vous êtes disponible 24/7</li>
      </ul>
    `,
    ctaLabel: 'Compléter mon profil',
    ctaUrl: `${base()}/mon-profil`,
  })
  return { subject, html }
}

// ============================================================================
// BIENVENUE CLIENT (→ client à l'inscription)
// ============================================================================

export function welcomeClientEmail(opts: { prenom: string }) {
  const { prenom } = opts
  const subject = `🛠️ Bienvenue sur Artisano !`
  const html = emailLayout({
    title: `Bienvenue ${escape(prenom)} !`,
    body: `
      <p>Votre compte Artisano est créé. Vous pouvez maintenant trouver le bon artisan en quelques clics.</p>
      <p>Plombiers, électriciens, serruriers, chauffagistes... tous sont vérifiés et notés par d'autres clients comme vous.</p>
    `,
    ctaLabel: 'Trouver un artisan',
    ctaUrl: `${base()}/recherche`,
  })
  return { subject, html }
}
