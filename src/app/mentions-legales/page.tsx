import type { Metadata } from 'next'
import Link from 'next/link'
import Logo from '@/components/Logo'
import { LEGAL, LEGAL_COMPLETE } from '@/lib/legal'

// Tant que les infos officielles (src/lib/legal.ts) ne sont pas remplies, on
// bloque l'indexation pour éviter une publication trompeuse (LCD art. 3 al. 1
// let. s). Le flag se lève tout seul quand les champs obligatoires sont saisis.
const MENTIONS_INCOMPLETES = !LEGAL_COMPLETE

export const metadata: Metadata = {
  title: 'Mentions légales',
  description: "Mentions légales de la plateforme Artisano : éditeur, hébergement, contact.",
  ...(MENTIONS_INCOMPLETES ? { robots: { index: false, follow: false } } : {}),
}

const TODO = ({ children }: { children: React.ReactNode }) => (
  <span className="inline-block bg-[var(--red-light)] text-[var(--red)] px-2 py-0.5 rounded text-[12px] font-bold uppercase tracking-wider align-middle">
    À compléter : {children}
  </span>
)

/** Affiche la valeur légale, ou le marqueur « À compléter » si elle manque. */
const Field = ({ value, hint, optional }: { value: string | null; hint: string; optional?: boolean }) => {
  if (value) return <>{value}</>
  if (optional) return <span className="text-[var(--gray-500)]">Non renseigné (facultatif)</span>
  return <TODO>{hint}</TODO>
}

/**
 * Page mentions légales — obligatoire en Suisse pour tout site commercial
 * (LCD art. 3 al. 1 let. s — Loi contre la concurrence déloyale).
 *
 * Toutes les valeurs viennent de src/lib/legal.ts : remplir ce fichier,
 * rien à changer ici.
 */
export default function MentionsLegalesPage() {
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

        <h1 className="font-sora text-[28px] font-extrabold text-[var(--dark)] mb-2 max-[900px]:text-[22px]">Mentions légales</h1>
        <p className="text-[13px] text-[var(--gray-500)] mb-4">Dernière mise à jour : {LEGAL.derniereMiseAJour}</p>

        {MENTIONS_INCOMPLETES && (
          <div className="mb-8 p-4 bg-[var(--red-light)] border border-[var(--red)] rounded-[var(--radius-sm)]">
            <div className="flex items-start gap-2 text-[var(--red)]">
              <svg className="w-5 h-5 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              <div className="text-sm leading-relaxed">
                <strong>Page en cours de rédaction.</strong> Les mentions légales définitives (raison sociale, IDE, RC, TVA) seront disponibles avant la mise en production publique. Le site est actuellement en bêta privée et non indexable.
              </div>
            </div>
          </div>
        )}

        <div className="[&_h2]:font-sora [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-[var(--dark)] [&_h2]:mt-7 [&_h2]:mb-3 [&_p]:text-sm [&_p]:text-[var(--gray-700)] [&_p]:leading-[1.7] [&_p]:mb-2.5 [&_li]:text-sm [&_li]:text-[var(--gray-700)] [&_li]:leading-[1.7] [&_li]:mb-2.5 [&_ul]:pl-5 [&_ul]:mb-4 [&_a]:text-[var(--orange)] [&_a]:no-underline hover:[&_a]:underline [&_dt]:font-semibold [&_dt]:text-[var(--dark)] [&_dt]:text-sm [&_dt]:mt-3 [&_dd]:text-sm [&_dd]:text-[var(--gray-700)] [&_dd]:ml-0 [&_dd]:leading-[1.7]">

          <h2>1. Éditeur du site</h2>
          <dl>
            <dt>Raison sociale</dt>
            <dd><Field value={LEGAL.raisonSociale} hint="raison sociale (ex. Artisano Sàrl)" /></dd>

            <dt>Forme juridique</dt>
            <dd><Field value={LEGAL.formeJuridique} hint="Sàrl, SA, raison individuelle…" /></dd>

            <dt>Siège social</dt>
            <dd><Field value={LEGAL.siege} hint="adresse complète, NPA, ville, Suisse" /></dd>

            <dt>Numéro IDE</dt>
            <dd><Field value={LEGAL.ide} hint="CHE-XXX.XXX.XXX" /></dd>

            <dt>Numéro TVA</dt>
            <dd><Field value={LEGAL.tva} hint="CHE-XXX.XXX.XXX TVA ou « Non assujetti »" /></dd>

            <dt>Inscription au Registre du Commerce</dt>
            <dd><Field value={LEGAL.registreCommerce} hint="canton et n° d'inscription" /></dd>

            <dt>Représentant légal</dt>
            <dd><Field value={LEGAL.representant} hint="prénom, nom, fonction" /></dd>
          </dl>

          <h2>2. Contact</h2>
          <dl>
            <dt>Email</dt>
            <dd><a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a></dd>

            <dt>Téléphone</dt>
            <dd><Field value={LEGAL.telephone} hint="" optional /></dd>
          </dl>

          <h2>3. Directeur de la publication</h2>
          <p><Field value={LEGAL.directeurPublication ?? LEGAL.representant} hint="nom du responsable éditorial" /></p>

          <h2>4. Hébergement</h2>
          <dl>
            <dt>Application web</dt>
            <dd>Vercel Inc., 340 S Lemon Ave #4133, Walnut, CA 91789, États-Unis — <a href="https://vercel.com" target="_blank" rel="noopener noreferrer">vercel.com</a></dd>

            <dt>Base de données et fichiers</dt>
            <dd>Supabase Inc., 970 Toa Payoh North #07-04, Singapour 318992 — <a href="https://supabase.com" target="_blank" rel="noopener noreferrer">supabase.com</a></dd>

            <dt>Service emails</dt>
            <dd>Resend Inc., 2261 Market Street #4677, San Francisco, CA 94114, États-Unis — <a href="https://resend.com" target="_blank" rel="noopener noreferrer">resend.com</a></dd>
          </dl>

          <h2>5. Propriété intellectuelle</h2>
          <p>L&apos;ensemble des contenus présents sur la plateforme Artisano (textes, logos, graphismes, photographies, code source, marques, base de données) sont la propriété exclusive d&apos;Artisano ou de ses partenaires, et sont protégés par les lois suisses et internationales relatives à la propriété intellectuelle.</p>
          <p>Toute reproduction, représentation, modification, publication, transmission, dénaturation, totale ou partielle de la plateforme ou de son contenu, par quelque procédé que ce soit, et sur quelque support que ce soit est interdite sans l&apos;autorisation écrite préalable d&apos;Artisano, à l&apos;exception des éléments expressément désignés comme libres de droits sur la plateforme.</p>
          <p>Les contenus publiés par les Artisans (descriptions, photos de réalisations, etc.) restent la propriété de leurs auteurs respectifs. En les publiant sur la plateforme, l&apos;Artisan accorde à Artisano une licence non exclusive, gratuite, mondiale et pour toute la durée des droits d&apos;auteur, lui permettant de reproduire, représenter et adapter ces contenus dans le cadre du fonctionnement et de la promotion de la plateforme.</p>

          <h2>6. Limitation de responsabilité</h2>
          <p>Artisano agit en qualité d&apos;intermédiaire technique entre Clients et Artisans. La plateforme ne fournit pas elle-même de prestations artisanales et ne peut être tenue responsable :</p>
          <ul>
            <li>De la qualité, du délai, du prix ou de la conformité des prestations réalisées par les Artisans</li>
            <li>Des litiges survenant entre Clients et Artisans</li>
            <li>De la véracité des informations publiées par les Artisans (qualifications, assurances, etc.)</li>
            <li>De la véracité des avis publiés par les Clients</li>
          </ul>
          <p>Artisano s&apos;efforce d&apos;assurer un fonctionnement continu de la plateforme mais ne peut garantir une disponibilité de 100%. Des interruptions pour maintenance ou des incidents techniques peuvent survenir.</p>

          <h2>7. Droit applicable et juridiction</h2>
          <p>Les présentes mentions légales sont régies par le droit suisse. Tout litige relatif à la plateforme sera soumis à la compétence exclusive des tribunaux du {LEGAL.forJuridique}, sous réserve des dispositions impératives en matière de protection des consommateurs.</p>

          <h2>8. Liens utiles</h2>
          <ul>
            <li><Link href="/cgu">Conditions générales d&apos;utilisation</Link></li>
            <li><Link href="/confidentialite">Politique de confidentialité</Link></li>
          </ul>
        </div>
      </div>
    </>
  )
}
