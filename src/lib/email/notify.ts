/**
 * Helpers côté client pour déclencher des emails transactionnels.
 * Tout passe par /api/email/send qui vérifie la session côté serveur.
 *
 * Ces fonctions ne lancent JAMAIS d'erreur — un email manqué ne doit pas
 * casser le flux métier (la demande / le message est déjà créé en base).
 */

async function trigger(type: string, params: Record<string, string> = {}) {
  try {
    await fetch('/api/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, ...params }),
    })
  } catch {
    // silencieux : pas de blocage UX si l'email échoue
  }
}

export const notify = {
  newDemande: (demandeId: string) => trigger('new_demande', { demandeId }),
  newMessage: (messageId: string) => trigger('new_message', { messageId }),
  demandeStatus: (demandeId: string) => trigger('demande_status', { demandeId }),
  welcomeArtisan: () => trigger('welcome_artisan'),
  welcomeClient: () => trigger('welcome_client'),
}
