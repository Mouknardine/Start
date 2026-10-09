import Link from 'next/link'
import Image from 'next/image'
import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'
import ScrollReveal from '@/components/ScrollReveal'
import HeroSearch from '@/components/HeroSearch'
import { createClient } from '@/lib/supabase/server'
import { COVERAGE_BADGE } from '@/lib/site'
import { METIERS } from '@/lib/metiers'
import { normalizeText } from '@/lib/text'

// Stats hero calculées dynamiquement à chaque rendu (cache 5 min)
export const revalidate = 300

/** Métiers mis en avant avec une carte ; les autres de METIERS sont listés en dessous. */
const FEATURED_METIERS: readonly string[] = ['Plombier', 'Électricien', 'Serrurier', 'Chauffagiste']

async function getHeroStats() {
  try {
    const supabase = await createClient()
    const [{ count: artisanCount }, { data: avisRows }, { data: metierRows }] = await Promise.all([
      supabase.from('artisans_public').select('id', { count: 'exact', head: true }),
      supabase.from('avis').select('note'),
      supabase.from('artisans_public').select('metier'),
    ])
    const avisCount = avisRows?.length || 0
    const avg = avisCount > 0
      ? (avisRows!.reduce((s, a) => s + (a.note || 0), 0) / avisCount).toFixed(1)
      : '—'

    // Compteurs par métier, clés normalisées comme la recherche
    // (« Électricien » et « electricien » comptent ensemble)
    const metierCounts: Record<string, number> = {}
    ;(metierRows || []).forEach((r) => {
      const m = normalizeText(r.metier)
      if (m) metierCounts[m] = (metierCounts[m] || 0) + 1
    })

    return {
      artisans: artisanCount || 0,
      noteMoyenne: avg,
      avisCount,
      metierCounts,
    }
  } catch {
    return { artisans: 0, noteMoyenne: '—', avisCount: 0, metierCounts: {} as Record<string, number> }
  }
}


/** Captures réelles de l'app (données de démonstration). */
const APP_SCREENS = [
  { src: '/accueil/app-demandes.webp', alt: 'Tableau de bord artisan : demandes des clients', titre: 'Les demandes arrivent', texte: 'Accepte ou refuse en un geste' },
  { src: '/accueil/app-devis.webp', alt: 'Devis en cours : main d’œuvre, matériel, déplacement', titre: 'Un devis en 1 minute', texte: 'Tes tarifs sont déjà remplis' },
  { src: '/accueil/app-envoi.webp', alt: 'Envoi du devis par WhatsApp, SMS ou e-mail', titre: 'Envoyé en 2 touches', texte: 'Le client accepte en ligne' },
  { src: '/accueil/app-factures.webp', alt: 'Suivi des factures : à encaisser, en retard, payées', titre: 'Factures avec QR', texte: 'Tu vois ce qui reste à encaisser' },
]

const FEATURES = [
  { titre: 'Des demandes de ta région', texte: 'Les clients te trouvent par métier et par commune, et t’écrivent avec tous les détails. Tu réponds depuis l’app.', icon: <><path d="M22 12h-6l-2 3h-4l-2-3H2" /><path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z" /></> },
  { titre: 'Devis pensés artisan', texte: 'Main d’œuvre à l’heure ou à la journée, matériel avec ta marge, déplacement : tout est déjà calculé, TVA et arrondi compris.', icon: <><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="8" y1="13" x2="16" y2="13" /></> },
  { titre: 'Factures avec QR-facture', texte: 'Le devis accepté ou l’intervention devient une facture suisse conforme. Ton client paie en scannant le QR.', icon: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><path d="M14 14h3v3h-3zM20 14v.01M14 20h.01M17 20h4v-3" /></> },
  { titre: 'Relances sans y penser', texte: 'Les factures en retard remontent en haut de la liste. Une relance polie part en deux touches.', icon: <><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></> },
  { titre: 'Agenda et disponibilités', texte: 'Tes créneaux libres s’affichent sur ta page publique : les clients demandent un rendez-vous au bon moment.', icon: <><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></> },
  { titre: 'Ton équipe planifiée', texte: 'Qui va où, à quelle heure. Une intervention terminée se facture directement, heures comprises.', icon: <><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" /></> },
]

const FAQ = [
  { q: 'Combien ça coûte ?', r: 'Pour les particuliers, Artisano est gratuit. Pour les artisans, toutes les fonctionnalités sont gratuites pendant la bêta ; un éventuel abonnement sera annoncé au moins 30 jours à l’avance et ne démarrera qu’avec ton accord.' },
  { q: 'Comment les artisans sont-ils vérifiés ?', r: 'À l’inscription, l’artisan indique son numéro IDE (CHE-…). Il est contrôlé au registre du commerce : le badge « Vérifié » apparaît alors sur son profil.' },
  { q: 'Comment mon client reçoit-il un devis ou une facture ?', r: 'Par un lien envoyé par WhatsApp, SMS ou e-mail. Il le consulte sur son téléphone, l’accepte en un clic s’il s’agit d’un devis, le télécharge en PDF, et paie une facture avec la QR-facture.' },
  { q: 'Est-ce que ça marche sur mon téléphone ?', r: 'Oui, Artisano est pensé d’abord pour le téléphone. Tu peux aussi l’ajouter à ton écran d’accueil pour l’ouvrir comme une app.' },
]

export default async function Home() {
  const stats = await getHeroStats()
  return (
    <>
      <Navbar />

      {/* ===== HERO ===== */}
      <section className="min-h-screen flex flex-col justify-center items-center text-center px-6 pt-[140px] pb-20 relative overflow-hidden bg-[#FFFAF5] max-[900px]:pt-[120px] max-[900px]:pb-[60px] max-[900px]:px-5 max-[400px]:pt-[100px] max-[400px]:px-4 max-[400px]:min-h-0">
        {/* Decorative gradients */}
        <div className="absolute -top-[200px] -right-[200px] w-[600px] h-[600px] bg-[radial-gradient(circle,rgba(232,112,10,0.08)_0%,transparent_70%)] rounded-full pointer-events-none" />
        <div className="absolute -bottom-[150px] -left-[150px] w-[500px] h-[500px] bg-[radial-gradient(circle,rgba(240,180,41,0.06)_0%,transparent_70%)] rounded-full pointer-events-none" />

        {/* Badge */}
        <div className="inline-flex items-center gap-2 bg-[var(--gray-100)] border border-[var(--gray-200)] px-5 py-2 rounded-full text-sm font-medium text-[var(--gray-700)] mb-8 animate-fade-up delay-1 relative z-[2] max-[900px]:text-xs max-[900px]:px-3.5 max-[900px]:mb-5">
          <span className="bg-[var(--orange)] text-white px-2.5 py-0.5 rounded-full text-xs font-bold">Nouveau</span>
          {COVERAGE_BADGE}
        </div>

        {/* Title */}
        <h1 className="font-sora text-[clamp(40px,6vw,72px)] font-extrabold leading-[1.1] max-w-[800px] mb-6 animate-fade-up delay-2 relative z-[2] max-[900px]:text-[32px]">
          Ton artisan local,<br />
          <span className="text-[var(--orange)] relative">
            en 2 clics
            <span className="absolute bottom-1 left-0 right-0 h-1.5 bg-[var(--yellow)] rounded-sm opacity-50 -z-[1]" />
          </span>
        </h1>

        {/* Subtitle */}
        <p className="text-[19px] text-[var(--gray-700)] max-w-[520px] leading-relaxed mb-12 animate-fade-up delay-3 relative z-[2] max-[900px]:text-base max-[900px]:mb-8">
          Trouve un plombier, électricien ou serrurier près de chez toi. Des vrais avis, des vrais pros, zéro prise de tête.
        </p>

        <HeroSearch />

        {/* Stats — valeurs réelles depuis la DB (LCD : pas de mention trompeuse) */}
        <div className="flex gap-12 mt-14 animate-fade-up delay-7 relative z-[1] max-[900px]:flex-wrap max-[900px]:gap-8 max-[900px]:mt-10 max-[400px]:flex-col max-[400px]:gap-4">
          <div className="text-center">
            <div className="font-sora text-[28px] font-extrabold text-[var(--dark)] max-[900px]:text-2xl">{stats.artisans}</div>
            <div className="text-[13px] text-[var(--gray-500)] mt-1">artisans inscrits</div>
          </div>
          <div className="text-center">
            <div className="font-sora text-[28px] font-extrabold text-[var(--dark)] max-[900px]:text-2xl">{stats.noteMoyenne}</div>
            <div className="text-[13px] text-[var(--gray-500)] mt-1">{stats.avisCount > 0 ? `sur ${stats.avisCount} avis` : 'aucun avis encore'}</div>
          </div>
          <div className="text-center">
            <div className="font-sora text-[28px] font-extrabold text-[var(--dark)] max-[900px]:text-2xl">100%</div>
            <div className="text-[13px] text-[var(--gray-500)] mt-1">avis vérifiés</div>
          </div>
        </div>

        <a href="#artisans" className="mt-10 inline-flex items-center gap-2 text-[15px] font-semibold text-[var(--dark)] no-underline relative z-[1] hover:text-[var(--orange)] transition-colors max-[900px]:mt-8 max-[900px]:text-[14px]">
          T’es artisan ? Découvre l’app qui gère le reste
          <svg aria-hidden="true" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12l7 7 7-7" /></svg>
        </a>
      </section>

      {/* ===== HOW IT WORKS ===== */}
      <ScrollReveal>
        <section id="how-it-works" className="py-[90px] px-10 max-w-[1200px] mx-auto max-[900px]:py-[60px] max-[900px]:px-5 scroll-mt-20">
          <p className="text-center text-[13px] font-bold uppercase tracking-[0.12em] text-[var(--orange)] mb-3">Comment ça marche</p>
          <h2 className="font-sora text-4xl font-bold text-center mb-4 max-[900px]:text-[26px]">Un artisan de confiance, sans prise de tête</h2>
          <p className="text-center text-[var(--gray-500)] text-[17px] mb-16 max-[900px]:text-[15px] max-[900px]:mb-10">
            Artisano réunit les pros de ta région, leurs avis et leurs disponibilités, au même endroit.
          </p>
          <div className="grid grid-cols-4 gap-8 relative max-[900px]:grid-cols-2 max-[400px]:grid-cols-1">
            {/* Connecting line */}
            <div className="absolute top-11 left-[12%] right-[12%] h-0.5 bg-gradient-to-r from-[var(--orange)] via-[var(--yellow)] to-[var(--orange)] opacity-30 z-0 max-[900px]:hidden" />

            {[
              { num: '1', title: "Dis-nous ce qu'il te faut", desc: 'Choisis un métier ou décris ton problème en deux mots' },
              { num: '2', title: 'Compare les pros', desc: 'Avis vérifiés, spécialités, zones couvertes — tout est là' },
              { num: '3', title: 'Contacte direct', desc: 'Demande un rendez-vous ou un devis en 30 secondes' },
              { num: '4', title: 'Laisse ton avis', desc: 'Aide la communauté en partageant ton expérience' },
            ].map((step) => (
              <div key={step.num} className="group text-center relative z-[1]">
                <div className="w-14 h-14 bg-[var(--dark)] text-white rounded-full flex items-center justify-center font-sora font-extrabold text-xl mx-auto mb-5 transition-all group-hover:bg-[var(--orange)] group-hover:scale-[1.15] group-hover:shadow-[0_8px_24px_rgba(232,112,10,0.35)] max-[900px]:w-11 max-[900px]:h-11 max-[900px]:text-base">
                  {step.num}
                </div>
                <h3 className="font-sora text-base font-bold mb-2">{step.title}</h3>
                <p className="text-sm text-[var(--gray-500)] leading-relaxed">{step.desc}</p>
              </div>
            ))}
          </div>
        </section>
      </ScrollReveal>

      {/* ===== MÉTIERS ===== */}
      <ScrollReveal>
        <section className="py-20 px-10 max-w-[1200px] mx-auto max-[900px]:py-[60px] max-[900px]:px-5">
          <div className="flex justify-between items-end mb-10 max-[900px]:flex-col max-[900px]:items-start max-[900px]:gap-2">
            <h2 className="font-sora text-4xl font-bold max-[900px]:text-[26px]">Explore par métier</h2>
            <Link href="/recherche" className="text-[var(--orange)] no-underline font-semibold text-[15px] flex items-center gap-1.5 hover:gap-3 transition-all">
              Voir tout →
            </Link>
          </div>
          <div className="grid grid-cols-4 gap-5 max-[900px]:grid-cols-2 max-[900px]:gap-3 max-[400px]:grid-cols-1">
            {[
              { name: 'Plombier', href: '/recherche?metier=Plombier', icon: <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" /></svg> },
              { name: 'Électricien', href: '/recherche?metier=%C3%89lectricien', icon: <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg> },
              { name: 'Serrurier', href: '/recherche?metier=Serrurier', icon: <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" /></svg> },
              { name: 'Chauffagiste', href: '/recherche?metier=Chauffagiste', icon: <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2c1 3 4 6 4 10a4 4 0 11-8 0c0-4 3-7 4-10z" /></svg> },
            ].map((m) => {
              const count = stats.metierCounts[normalizeText(m.name)] || 0
              const countLabel = count === 0 ? 'Bientôt disponible' : count === 1 ? '1 pro disponible' : `${count} pros disponibles`
              return (
              <Link
                key={m.name}
                href={m.href}
                className="group block bg-white border border-[var(--gray-200)] rounded-[var(--radius)] py-8 px-6 text-center cursor-pointer transition-all duration-[350ms] ease-[cubic-bezier(0.25,0.46,0.45,0.94)] relative overflow-hidden no-underline text-inherit hover:-translate-y-1.5 hover:shadow-[0_16px_48px_rgba(0,0,0,0.08)] hover:border-transparent max-[900px]:py-5 max-[900px]:px-4"
              >
                <div className="absolute top-0 left-0 right-0 h-1 bg-[var(--orange)] scale-x-0 group-hover:scale-x-100 transition-transform duration-[350ms] origin-left" />
                <div className="w-16 h-16 bg-[var(--gray-100)] rounded-[16px] flex items-center justify-center text-[28px] mx-auto mb-4 transition-all duration-[450ms] ease-[cubic-bezier(0.25,0.46,0.45,0.94)] group-hover:bg-[var(--orange)] group-hover:scale-[1.15] group-hover:-rotate-[8deg] group-hover:shadow-[0_8px_24px_rgba(232,112,10,0.3)] max-[900px]:w-12 max-[900px]:h-12 [&_svg]:transition-all [&_svg]:duration-[450ms] group-hover:[&_svg]:stroke-white group-hover:[&_svg]:scale-110 group-hover:[&_svg]:rotate-[8deg]">
                  {m.icon}
                </div>
                <h3 className="font-sora text-[17px] font-semibold mb-1.5">{m.name}</h3>
                <p className="text-[13px] text-[var(--gray-500)]">{countLabel}</p>
              </Link>
              )
            })}
          </div>

          {/* Les autres métiers de la liste canonique */}
          <div className="flex flex-wrap items-center gap-2 mt-6 max-[900px]:mt-4">
            <span className="text-sm text-[var(--gray-500)] mr-1">Aussi sur Artisano :</span>
            {METIERS.filter((m) => !FEATURED_METIERS.includes(m)).map((m) => {
              const count = stats.metierCounts[normalizeText(m)] || 0
              return (
                <Link
                  key={m}
                  href={`/recherche?metier=${encodeURIComponent(m)}`}
                  className="inline-flex items-center gap-1.5 bg-white border border-[var(--gray-200)] rounded-full py-2 px-4 text-sm font-medium text-[var(--gray-700)] no-underline transition-all hover:border-[var(--orange)] hover:text-[var(--orange)]"
                >
                  {m}
                  {count > 0 && <span className="text-xs text-[var(--gray-500)]">{count}</span>}
                </Link>
              )
            })}
          </div>
        </section>
      </ScrollReveal>

      {/* ===== L'APP DES ARTISANS ===== */}
      <section id="artisans" className="scroll-mt-16 bg-[var(--dark)] text-white overflow-hidden">
        <div className="max-w-[1200px] mx-auto px-10 py-[100px] max-[900px]:px-5 max-[900px]:py-16">
          <ScrollReveal>
            <p className="text-[13px] font-bold uppercase tracking-[0.12em] text-[var(--orange-light)] mb-3">Pour les artisans</p>
            <h2 className="font-sora text-[44px] font-extrabold leading-[1.1] max-w-[760px] max-[900px]:text-[28px]">
              Ton métier, c’est le chantier.<br />
              <span className="text-[var(--orange-light)]">Le reste, Artisano s’en occupe.</span>
            </h2>
            <p className="text-[18px] text-white/70 max-w-[620px] mt-5 leading-relaxed max-[900px]:text-[16px]">
              Demandes, devis, factures avec QR, agenda et équipe : tout se gère depuis ton téléphone, entre deux interventions. Sans paperasse, sans tableur.
            </p>
          </ScrollReveal>

          {/* Captures de l'app */}
          <div className="mt-14 -mx-10 px-10 flex gap-6 overflow-x-auto snap-x snap-mandatory pb-4 [scrollbar-width:none] max-[900px]:-mx-5 max-[900px]:px-5 max-[900px]:gap-4 max-[900px]:mt-10 min-[1100px]:justify-center min-[1100px]:overflow-visible">
            {APP_SCREENS.map((sc, i) => (
              <figure key={sc.src} className={`snap-center shrink-0 w-[230px] m-0 max-[900px]:w-[62vw] max-[900px]:max-w-[260px] ${i % 2 ? 'min-[1100px]:translate-y-10' : ''}`}>
                <div className="rounded-[34px] bg-[#0E1729] p-[7px] shadow-[0_24px_60px_rgba(0,0,0,0.45)] ring-1 ring-white/10">
                  <div className="rounded-[28px] overflow-hidden bg-white">
                    <Image src={sc.src} alt={sc.alt} width={540} height={1080} sizes="(max-width: 900px) 62vw, 230px" className="w-full h-auto block" />
                  </div>
                </div>
                <figcaption className="mt-4 text-center">
                  <span className="block font-sora font-bold text-[15px]">{sc.titre}</span>
                  <span className="block text-[13px] text-white/60 mt-0.5">{sc.texte}</span>
                </figcaption>
              </figure>
            ))}
          </div>

          {/* En chiffres */}
          <div className="grid grid-cols-3 gap-4 mt-16 max-[900px]:grid-cols-1 max-[900px]:mt-10 max-[900px]:gap-3">
            {[
              { chiffre: '1 min', texte: 'pour un devis : tes tarifs, ta TVA et tes délais sont déjà remplis' },
              { chiffre: '2 touches', texte: 'pour l’envoyer par WhatsApp, SMS ou e-mail. Le client l’accepte en ligne' },
              { chiffre: '1 touche', texte: 'pour transformer le devis accepté ou l’intervention en facture avec QR' },
            ].map((c) => (
              <div key={c.chiffre} className="rounded-[20px] bg-white/[0.06] border border-white/10 p-6 max-[900px]:p-5">
                <div className="font-sora text-[34px] font-extrabold text-[var(--orange-light)] leading-none whitespace-nowrap max-[900px]:text-[28px]">{c.chiffre}</div>
                <p className="text-[15px] text-white/75 mt-2 leading-snug">{c.texte}</p>
              </div>
            ))}
          </div>

          {/* Fonctionnalités */}
          <div className="grid grid-cols-3 gap-5 mt-16 max-[900px]:grid-cols-1 max-[900px]:mt-12 max-[900px]:gap-3">
            {FEATURES.map((f) => (
              <div key={f.titre} className="rounded-[20px] bg-white text-[var(--dark)] p-6 max-[900px]:p-5">
                <div className="w-11 h-11 rounded-2xl bg-[rgba(232,112,10,0.12)] text-[var(--orange)] flex items-center justify-center mb-4">
                  <svg aria-hidden="true" className="w-[22px] h-[22px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{f.icon}</svg>
                </div>
                <h3 className="font-sora font-bold text-[17px] mb-1.5">{f.titre}</h3>
                <p className="text-[15px] text-[var(--gray-700)] leading-relaxed">{f.texte}</p>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-4 mt-14 flex-wrap max-[900px]:flex-col max-[900px]:items-stretch max-[900px]:mt-10">
            <Link href="/inscription" className="bg-[var(--orange)] text-white px-9 py-4 rounded-full font-sora font-bold text-base no-underline text-center transition-all hover:bg-[var(--orange-light)] hover:-translate-y-0.5">
              Créer mon profil artisan
            </Link>
            <span className="text-[15px] text-white/70 text-center">Gratuit pendant la bêta · sans engagement</span>
          </div>
        </div>
      </section>

      {/* ===== CONFIANCE ===== */}
      <ScrollReveal>
        <section className="py-[90px] px-10 max-w-[1200px] mx-auto max-[900px]:py-[60px] max-[900px]:px-5">
          <p className="text-center text-[13px] font-bold uppercase tracking-[0.12em] text-[var(--orange)] mb-3">La confiance d’abord</p>
          <h2 className="font-sora text-4xl font-bold text-center mb-12 max-[900px]:text-[26px] max-[900px]:mb-8">Des vrais pros, des vrais avis</h2>
          <div className="grid grid-cols-3 gap-5 max-[900px]:grid-cols-1 max-[900px]:gap-3">
            {[
              { titre: 'Entreprises vérifiées', texte: 'Le numéro IDE de l’artisan est contrôlé au registre du commerce : le badge « Vérifié » le montre sur son profil.', icon: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><polyline points="9 12 11 14 15 10" /></> },
              { titre: 'Avis de vrais clients', texte: 'Les avis viennent de clients passés par Artisano. L’artisan peut y répondre, publiquement.', icon: <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /> },
              { titre: 'Gratuit pour toi', texte: 'Chercher, comparer et contacter un artisan ne coûte rien. Tu paies l’artisan, directement, pour son travail.', icon: <><circle cx="12" cy="12" r="10" /><path d="M8 12h8M12 8v8" /></> },
            ].map((c) => (
              <div key={c.titre} className="rounded-[20px] border border-[var(--gray-200)] bg-white p-6 max-[900px]:p-5">
                <div className="w-11 h-11 rounded-2xl bg-[var(--gray-100)] text-[var(--dark)] flex items-center justify-center mb-4">
                  <svg aria-hidden="true" className="w-[22px] h-[22px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{c.icon}</svg>
                </div>
                <h3 className="font-sora font-bold text-[17px] mb-1.5">{c.titre}</h3>
                <p className="text-[15px] text-[var(--gray-700)] leading-relaxed">{c.texte}</p>
              </div>
            ))}
          </div>
        </section>
      </ScrollReveal>

      {/* ===== QUESTIONS ===== */}
      <ScrollReveal>
        <section className="pb-[90px] px-10 max-w-[820px] mx-auto max-[900px]:pb-[60px] max-[900px]:px-5">
          <h2 className="font-sora text-[32px] font-bold text-center mb-8 max-[900px]:text-[24px]">Questions fréquentes</h2>
          <div className="flex flex-col gap-3">
            {FAQ.map((q) => (
              <details key={q.q} className="group rounded-[16px] border border-[var(--gray-200)] bg-white px-5 open:pb-4">
                <summary className="flex items-center justify-between gap-4 py-4 cursor-pointer list-none font-semibold text-[16px] text-[var(--dark)] [&::-webkit-details-marker]:hidden">
                  {q.q}
                  <svg aria-hidden="true" className="w-5 h-5 shrink-0 text-[var(--gray-500)] transition-transform group-open:rotate-45" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14" /></svg>
                </summary>
                <p className="text-[15px] text-[var(--gray-700)] leading-relaxed">{q.r}</p>
              </details>
            ))}
          </div>
        </section>
      </ScrollReveal>

      {/* ===== CTA ARTISAN ===== */}
      <ScrollReveal>
        <section className="mx-10 mb-20 bg-[var(--dark)] rounded-3xl py-20 px-[60px] text-center relative overflow-hidden max-w-[1200px] max-[900px]:mx-5 max-[900px]:mb-[60px] max-[900px]:py-12 max-[900px]:px-6" style={{ marginLeft: 'auto', marginRight: 'auto' }}>
          <div className="absolute -top-[100px] -right-[100px] w-[400px] h-[400px] bg-[radial-gradient(circle,rgba(232,112,10,0.15)_0%,transparent_70%)] rounded-full" />
          <div className="absolute -bottom-20 -left-20 w-[300px] h-[300px] bg-[radial-gradient(circle,rgba(240,180,41,0.1)_0%,transparent_70%)] rounded-full" />

          <h2 className="font-sora text-[40px] font-extrabold text-white mb-4 relative z-[1] max-[900px]:text-2xl">
            T&apos;es artisan ?<br />Rejoins-nous.
          </h2>
          <p className="text-white/65 text-lg max-w-[480px] mx-auto mb-9 relative z-[1] max-[900px]:text-[15px]">
            Reçois des demandes de ta région, envoie tes devis et factures en deux touches, et construis ta réputation. Gratuit pendant la bêta.
          </p>
          <div className="flex justify-center gap-4 relative z-[1] max-[900px]:flex-col max-[900px]:items-center">
            <Link
              href="/inscription"
              className="bg-[var(--orange)] text-white px-9 py-4 rounded-full font-sora font-bold text-base no-underline transition-all hover:bg-[var(--orange-light)] hover:-translate-y-0.5 hover:shadow-[0_12px_32px_rgba(232,112,10,0.4)] max-[900px]:px-7 max-[900px]:py-3.5 max-[900px]:text-sm max-[900px]:w-full max-[900px]:text-center"
            >
              Créer mon profil
            </Link>
            <a
              href="#artisans"
              className="bg-transparent text-white px-9 py-4 rounded-full font-sora font-bold text-base no-underline border-2 border-white/25 transition-all hover:border-white hover:bg-white/5 hover:-translate-y-0.5 max-[900px]:px-7 max-[900px]:py-3.5 max-[900px]:text-sm max-[900px]:w-full max-[900px]:text-center"
            >
              Voir l’app en détail
            </a>
          </div>
        </section>
      </ScrollReveal>

      <Footer />
    </>
  )
}
