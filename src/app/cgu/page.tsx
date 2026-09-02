import type { Metadata } from 'next'
import Link from 'next/link'
import Logo from '@/components/Logo'

export const metadata: Metadata = {
  title: "Conditions Générales d'Utilisation",
  description: "Conditions générales d'utilisation de la plateforme Artisano, service de mise en relation avec des artisans en Suisse.",
}

export default function CGUPage() {
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

        <h1 className="font-sora text-[28px] font-extrabold text-[var(--dark)] mb-2 max-[900px]:text-[22px]">Conditions Générales d&apos;Utilisation</h1>
        <p className="text-[13px] text-[var(--gray-500)] mb-8">Dernière mise à jour : avril 2026</p>

        <div className="[&_h2]:font-sora [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-[var(--dark)] [&_h2]:mt-7 [&_h2]:mb-3 [&_p]:text-sm [&_p]:text-[var(--gray-700)] [&_p]:leading-[1.7] [&_p]:mb-2.5 [&_li]:text-sm [&_li]:text-[var(--gray-700)] [&_li]:leading-[1.7] [&_li]:mb-2.5 [&_ul]:pl-5 [&_ul]:mb-4 [&_a]:text-[var(--orange)] [&_a]:no-underline hover:[&_a]:underline">
          <h2>1. Objet</h2>
          <p>Les présentes Conditions Générales d&apos;Utilisation (ci-après « CGU ») définissent les modalités d&apos;accès et d&apos;utilisation de la plateforme Artisano (ci-après « la Plateforme »), accessible à l&apos;adresse artisano.ch, éditée et exploitée en Suisse.</p>
          <p>Artisano est une plateforme de mise en relation entre des artisans professionnels (ci-après « Artisans ») et des particuliers ou professionnels recherchant des services artisanaux (ci-après « Clients »).</p>

          <h2>2. Acceptation des CGU</h2>
          <p>L&apos;utilisation de la Plateforme implique l&apos;acceptation pleine et entière des présentes CGU. Si vous n&apos;acceptez pas ces conditions, veuillez ne pas utiliser la Plateforme.</p>

          <h2>3. Inscription et comptes</h2>
          <p>L&apos;inscription sur la Plateforme est gratuite pour les Clients. Les Artisans bénéficient d&apos;un accès par abonnement mensuel.</p>
          <ul>
            <li>Chaque utilisateur s&apos;engage à fournir des informations exactes et à jour.</li>
            <li>Les identifiants de connexion sont personnels et confidentiels.</li>
            <li>L&apos;utilisateur est responsable de toute activité effectuée depuis son compte.</li>
          </ul>

          <h2>4. Services proposés</h2>
          <p>La Plateforme permet aux Clients de :</p>
          <ul>
            <li>Rechercher des artisans par métier et localisation.</li>
            <li>Consulter les profils, avis et disponibilités des artisans.</li>
            <li>Envoyer des demandes de devis ou des messages aux artisans.</li>
            <li>Laisser un avis après la réalisation d&apos;une prestation.</li>
          </ul>
          <p>La Plateforme permet aux Artisans de :</p>
          <ul>
            <li>Créer et gérer leur profil professionnel.</li>
            <li>Recevoir et gérer les demandes de clients.</li>
            <li>Communiquer avec les clients via la messagerie intégrée.</li>
            <li>Gérer leur agenda, équipe et facturation.</li>
          </ul>

          <h2>5. Rôle d&apos;Artisano</h2>
          <p>Artisano agit exclusivement en tant qu&apos;intermédiaire technique. La Plateforme ne fournit aucune prestation artisanale et n&apos;intervient pas dans la relation contractuelle entre l&apos;Artisan et le Client. Artisano ne prélève aucune commission sur les transactions entre Artisans et Clients.</p>

          <h2>6. Abonnement Artisan</h2>
          <ul>
            <li><strong>Période de bêta</strong> : pendant la phase de bêta, l&apos;accès aux fonctionnalités Artisan est gratuit. Le passage à l&apos;abonnement payant sera annoncé aux Artisans inscrits avec un préavis d&apos;au moins 30 jours, et nécessitera leur accord explicite.</li>
            <li>À l&apos;issue de la bêta, l&apos;accès aux fonctionnalités Artisan est soumis à un abonnement mensuel payant.</li>
            <li>Le montant de l&apos;abonnement est indiqué lors de l&apos;inscription et peut être modifié avec un préavis de 30 jours.</li>
            <li>L&apos;abonnement se renouvelle automatiquement sauf résiliation.</li>
            <li>La résiliation prend effet à la fin de la période en cours.</li>
          </ul>

          <h2>7. Avis et contenus</h2>
          <ul>
            <li>Les avis sont soumis à vérification : seuls les Clients ayant une demande terminée peuvent en publier.</li>
            <li>Les avis doivent être honnêtes, respectueux et fondés sur une expérience réelle.</li>
            <li>Artisano se réserve le droit de supprimer tout contenu contraire aux présentes CGU ou à la législation applicable.</li>
            <li>Les Artisans peuvent répondre publiquement aux avis les concernant.</li>
          </ul>

          <h2>8. Responsabilités</h2>
          <p>Artisano met tout en œuvre pour assurer la disponibilité et la sécurité de la Plateforme, mais ne peut garantir une disponibilité continue. Artisano décline toute responsabilité en cas de :</p>
          <ul>
            <li>Litige entre un Client et un Artisan.</li>
            <li>Qualité ou conformité des prestations réalisées par les Artisans.</li>
            <li>Dommages résultant de l&apos;utilisation de la Plateforme.</li>
            <li>Inexactitude des informations fournies par les utilisateurs.</li>
          </ul>

          <h2>9. Données personnelles</h2>
          <p>Le traitement des données personnelles est détaillé dans notre <Link href="/confidentialite">Politique de Confidentialité</Link>.</p>

          <h2>10. Propriété intellectuelle</h2>
          <p>L&apos;ensemble des éléments de la Plateforme (design, logos, textes, code) sont la propriété exclusive d&apos;Artisano et sont protégés par le droit de la propriété intellectuelle.</p>

          <h2>11. Modification des CGU</h2>
          <p>Artisano se réserve le droit de modifier les présentes CGU à tout moment. Les utilisateurs seront informés par email en cas de modification substantielle. La poursuite de l&apos;utilisation de la Plateforme après modification vaut acceptation des nouvelles CGU.</p>

          <h2>12. Droit applicable et juridiction</h2>
          <p>Les présentes CGU sont soumises au droit suisse. Tout litige relatif à leur interprétation ou exécution sera soumis aux tribunaux compétents du canton de Vaud, Suisse.</p>

          <h2>13. Contact</h2>
          <p>Pour toute question relative aux présentes CGU, vous pouvez nous contacter à l&apos;adresse : <a href="mailto:contact@artisano.ch">contact@artisano.ch</a></p>
        </div>
      </div>
    </>
  )
}
