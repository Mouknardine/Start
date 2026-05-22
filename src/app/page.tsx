import Link from 'next/link'
import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'
import ScrollReveal from '@/components/ScrollReveal'
import HeroSearch from '@/components/HeroSearch'
import { createClient } from '@/lib/supabase/server'

// Stats hero calculées dynamiquement à chaque rendu (cache 5 min)
export const revalidate = 300

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

    // Compteurs par métier (insensible à la casse)
    const metierCounts: Record<string, number> = {}
    ;(metierRows || []).forEach((r) => {
      const m = (r.metier || '').toLowerCase().trim()
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
          Disponible dans le canton de Vaud
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
      </section>

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
              { name: 'Plombier', metierKey: 'plombier', href: '/recherche?metier=Plombier', icon: <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" /></svg> },
              { name: 'Électricien', metierKey: 'electricien', href: '/recherche?metier=Electricien', icon: <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg> },
              { name: 'Serrurier', metierKey: 'serrurier', href: '/recherche?metier=Serrurier', icon: <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" /></svg> },
              { name: 'Chauffagiste', metierKey: 'chauffagiste', href: '/recherche?metier=Chauffagiste', icon: <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2c1 3 4 6 4 10a4 4 0 11-8 0c0-4 3-7 4-10z" /></svg> },
            ].map((m) => {
              const count = stats.metierCounts[m.metierKey] || 0
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
        </section>
      </ScrollReveal>

      {/* ===== HOW IT WORKS ===== */}
      <ScrollReveal>
        <section id="how-it-works" className="py-[100px] px-10 max-w-[1200px] mx-auto max-[900px]:py-[60px] max-[900px]:px-5">
          <h2 className="font-sora text-4xl font-bold text-center mb-4 max-[900px]:text-[26px]">Simple comme bonjour</h2>
          <p className="text-center text-[var(--gray-500)] text-[17px] mb-16 max-[900px]:text-[15px] max-[900px]:mb-10">
            Pas de compte obligatoire, pas de prise de tête.
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

      {/* ===== CTA ARTISAN ===== */}
      <ScrollReveal>
        <section className="mx-10 mb-20 bg-[var(--dark)] rounded-3xl py-20 px-[60px] text-center relative overflow-hidden max-w-[1200px] max-[900px]:mx-5 max-[900px]:mb-[60px] max-[900px]:py-12 max-[900px]:px-6" style={{ marginLeft: 'auto', marginRight: 'auto' }}>
          <div className="absolute -top-[100px] -right-[100px] w-[400px] h-[400px] bg-[radial-gradient(circle,rgba(232,112,10,0.15)_0%,transparent_70%)] rounded-full" />
          <div className="absolute -bottom-20 -left-20 w-[300px] h-[300px] bg-[radial-gradient(circle,rgba(240,180,41,0.1)_0%,transparent_70%)] rounded-full" />

          <h2 className="font-sora text-[40px] font-extrabold text-white mb-4 relative z-[1] max-[900px]:text-2xl">
            T&apos;es artisan ?<br />Rejoins-nous.
          </h2>
          <p className="text-white/65 text-lg max-w-[480px] mx-auto mb-9 relative z-[1] max-[900px]:text-[15px]">
            Reçois des demandes locales, gère tes rendez-vous, et construis ta réputation en ligne. Dès 25 CHF/mois.
          </p>
          <div className="flex justify-center gap-4 relative z-[1] max-[900px]:flex-col max-[900px]:items-center">
            <Link
              href="/inscription"
              className="bg-[var(--orange)] text-white px-9 py-4 rounded-full font-sora font-bold text-base no-underline transition-all hover:bg-[var(--orange-light)] hover:-translate-y-0.5 hover:shadow-[0_12px_32px_rgba(232,112,10,0.4)] max-[900px]:px-7 max-[900px]:py-3.5 max-[900px]:text-sm max-[900px]:w-full max-[900px]:text-center"
            >
              Créer mon profil
            </Link>
            <Link
              href="/inscription"
              className="bg-transparent text-white px-9 py-4 rounded-full font-sora font-bold text-base no-underline border-2 border-white/25 transition-all hover:border-white hover:bg-white/5 hover:-translate-y-0.5 max-[900px]:px-7 max-[900px]:py-3.5 max-[900px]:text-sm max-[900px]:w-full max-[900px]:text-center"
            >
              En savoir plus
            </Link>
          </div>
        </section>
      </ScrollReveal>

      <Footer />
    </>
  )
}
