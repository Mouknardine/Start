import type { Metadata } from 'next'
import Link from 'next/link'
import Logo from '@/components/Logo'

export const metadata: Metadata = {
  title: 'Politique de Confidentialité',
  description: "Politique de confidentialité d'Artisano. Découvrez comment nous protégeons vos données personnelles.",
}

export default function ConfidentialitePage() {
  return (
    <>
      <nav className="fixed top-0 left-0 right-0 z-[100] px-10 py-4 flex items-center justify-center bg-[rgba(250,250,250,0.9)] backdrop-blur-[20px] border-b border-black/5 max-[900px]:px-4 max-[900px]:py-3">
        <Logo />
      </nav>

      <div className="max-w-[720px] mx-auto pt-[100px] px-6 pb-[60px] max-[900px]:pt-20 max-[900px]:px-4 max-[900px]:pb-10">
        <Link href="/" className="inline-flex items-center gap-1.5 text-[13px] text-[var(--gray-500)] no-underline mb-5 hover:text-[var(--orange)]">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
          Retour
        </Link>

        <h1 className="font-sora text-[28px] font-extrabold text-[var(--dark)] mb-2 max-[900px]:text-[22px]">Politique de Confidentialité</h1>
        <p className="text-[13px] text-[var(--gray-500)] mb-8">Dernière mise à jour : avril 2026</p>

        <div className="[&_h2]:font-sora [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-[var(--dark)] [&_h2]:mt-7 [&_h2]:mb-3 [&_h3]:font-sora [&_h3]:text-[15px] [&_h3]:font-semibold [&_h3]:text-[var(--dark)] [&_h3]:mt-4 [&_h3]:mb-2 [&_p]:text-sm [&_p]:text-[var(--gray-700)] [&_p]:leading-[1.7] [&_p]:mb-2.5 [&_li]:text-sm [&_li]:text-[var(--gray-700)] [&_li]:leading-[1.7] [&_li]:mb-2.5 [&_ul]:pl-5 [&_ul]:mb-4 [&_a]:text-[var(--orange)] [&_a]:no-underline hover:[&_a]:underline">
          <h2>1. Responsable du traitement</h2>
          <p>Le responsable du traitement des données personnelles est Artisano, plateforme de mise en relation artisanale exploitée en Suisse. Contact : <a href="mailto:contact@artisano.ch">contact@artisano.ch</a></p>

          <h2>2. Données collectées</h2>
          <p>Nous collectons les données suivantes selon le type d&apos;utilisateur :</p>

          <h3>Clients</h3>
          <ul>
            <li>Adresse email (inscription et contact)</li>
            <li>Nom et prénom</li>
            <li>Numéro de téléphone (optionnel, lors d&apos;une demande)</li>
            <li>Adresse (lors d&apos;une demande de service)</li>
            <li>Contenu des messages et demandes</li>
            <li>Avis et notes laissés</li>
          </ul>

          <h3>Artisans</h3>
          <ul>
            <li>Adresse email et mot de passe (inscription)</li>
            <li>Nom, prénom, nom d&apos;entreprise</li>
            <li>Numéro de téléphone, adresse professionnelle</li>
            <li>Métier, spécialités, zones d&apos;intervention</li>
            <li>Horaires de travail</li>
            <li>Photo de profil et galerie</li>
            <li>Coordonnées bancaires (IBAN, pour la facturation)</li>
            <li>Données relatives aux employés (si module équipe utilisé)</li>
          </ul>

          <h2>3. Finalités du traitement</h2>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse my-3 mb-5 text-[13px] max-[900px]:text-[11px]">
              <thead>
                <tr>
                  <th className="p-2.5 px-3 border border-[var(--gray-200)] text-left bg-[var(--gray-100)] font-bold text-[var(--dark)]">Finalité</th>
                  <th className="p-2.5 px-3 border border-[var(--gray-200)] text-left bg-[var(--gray-100)] font-bold text-[var(--dark)]">Base légale</th>
                </tr>
              </thead>
              <tbody className="[&_td]:p-2.5 [&_td]:px-3 [&_td]:border [&_td]:border-[var(--gray-200)] [&_td]:text-[var(--gray-700)]">
                <tr><td>Création et gestion du compte utilisateur</td><td>Exécution du contrat</td></tr>
                <tr><td>Mise en relation Client-Artisan</td><td>Exécution du contrat</td></tr>
                <tr><td>Envoi de notifications par email</td><td>Intérêt légitime</td></tr>
                <tr><td>Gestion des abonnements et paiements</td><td>Exécution du contrat</td></tr>
                <tr><td>Publication et modération des avis</td><td>Intérêt légitime</td></tr>
                <tr><td>Amélioration de la Plateforme</td><td>Intérêt légitime</td></tr>
              </tbody>
            </table>
          </div>

          <h2>4. Partage des données</h2>
          <p>Vos données personnelles ne sont jamais vendues. Elles peuvent être partagées avec :</p>
          <ul>
            <li><strong>Supabase</strong> (hébergement et base de données) — serveurs en Europe</li>
            <li><strong>Resend</strong> (service d&apos;envoi d&apos;emails transactionnels)</li>
            <li><strong>Stripe</strong> (traitement des paiements, le cas échéant)</li>
          </ul>
          <p>Ces prestataires sont tenus par des obligations contractuelles de confidentialité et de sécurité.</p>

          <h2>5. Durée de conservation</h2>
          <ul>
            <li><strong>Données de compte :</strong> conservées tant que le compte est actif, puis supprimées dans les 30 jours suivant la suppression du compte.</li>
            <li><strong>Demandes et messages :</strong> conservés 24 mois après la dernière interaction.</li>
            <li><strong>Avis :</strong> conservés tant que le profil de l&apos;artisan est actif.</li>
            <li><strong>Données de facturation :</strong> conservées 10 ans (obligation légale suisse).</li>
          </ul>

          <h2>6. Vos droits</h2>
          <p>Conformément à la Loi fédérale sur la protection des données (LPD) et au RGPD (pour les résidents de l&apos;UE/EEE), vous disposez des droits suivants :</p>
          <ul>
            <li><strong>Droit d&apos;accès :</strong> obtenir une copie de vos données personnelles.</li>
            <li><strong>Droit de rectification :</strong> corriger des données inexactes.</li>
            <li><strong>Droit à l&apos;effacement :</strong> demander la suppression de vos données (sauf obligations légales).</li>
            <li><strong>Droit à la portabilité :</strong> recevoir vos données dans un format structuré.</li>
            <li><strong>Droit d&apos;opposition :</strong> vous opposer au traitement de vos données.</li>
          </ul>
          <p>Pour exercer ces droits, contactez-nous à <a href="mailto:contact@artisano.ch">contact@artisano.ch</a>. Nous répondrons dans un délai de 30 jours.</p>

          <h2>7. Sécurité</h2>
          <p>Nous mettons en œuvre les mesures techniques et organisationnelles suivantes :</p>
          <ul>
            <li>Chiffrement des données en transit (HTTPS/TLS)</li>
            <li>Authentification sécurisée via Supabase Auth</li>
            <li>Politiques de sécurité au niveau des lignes (Row Level Security)</li>
            <li>Protection contre les injections XSS</li>
            <li>Accès restreint aux données selon le rôle de l&apos;utilisateur</li>
          </ul>

          <h2>8. Cookies</h2>
          <p>Artisano utilise uniquement des cookies techniques nécessaires au fonctionnement de la Plateforme (session d&apos;authentification). Nous n&apos;utilisons pas de cookies publicitaires ou de traçage.</p>

          <h2>9. Modifications</h2>
          <p>Nous nous réservons le droit de modifier cette politique. Toute modification sera publiée sur cette page avec la date de mise à jour. Les utilisateurs seront informés par email en cas de changement substantiel.</p>

          <h2>10. Contact</h2>
          <p>Pour toute question relative à la protection de vos données, contactez-nous :</p>
          <p><a href="mailto:contact@artisano.ch">contact@artisano.ch</a></p>
        </div>
      </div>
    </>
  )
}
