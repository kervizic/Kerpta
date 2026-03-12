// Kerpta — Section Hero de la page vitrine
import { ArrowRight, Github, Star } from 'lucide-react'

interface Cta { label: string; href: string }
interface Stat { value: string; label: string }
interface HeroContent {
  title?: string
  subtitle?: string
  badge?: string
  cta_primary?: Cta
  cta_secondary?: Cta
  stats?: Stat[]
}

export function LandingHero({ content }: { content: Record<string, unknown> }) {
  const c = content as HeroContent

  const title = c.title ?? 'La comptabilité française,\nenfin open source'
  const subtitle = c.subtitle ?? 'Hébergez chez vous — vos données restent les vôtres.'
  const badge = c.badge ?? 'AGPL-3.0 · 100 % gratuit'
  const ctaPrimary = c.cta_primary ?? { label: 'Commencer', href: '#open-source' }
  const ctaSecondary = c.cta_secondary ?? { label: 'GitHub', href: 'https://github.com/kervizic/kerpta' }
  const stats: Stat[] = (c.stats as Stat[]) ?? []

  return (
    <section className="relative pt-32 pb-24 px-6 overflow-hidden">
      {/* Gradient de fond */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-orange-600/20 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-amber-600/10 rounded-full blur-3xl" />
      </div>

      {/* Grille de fond */}
      <div
        className="absolute inset-0 -z-10 opacity-20"
        style={{
          backgroundImage:
            'linear-gradient(rgba(99,102,241,0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(99,102,241,0.15) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }}
      />

      <div className="max-w-4xl mx-auto text-center">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-orange-500/30 bg-orange-500/10 text-orange-300 text-sm font-medium mb-8">
          <Star className="w-3.5 h-3.5 fill-orange-400 text-orange-400" />
          {badge}
        </div>

        {/* Titre */}
        <h1 className="text-5xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight text-white mb-6 leading-tight">
          {title.split('\n').map((line, i) => (
            <span key={i}>
              {i > 0 && <br />}
              {i === 1 ? (
                <span className="bg-gradient-to-r from-orange-400 to-amber-400 bg-clip-text text-transparent">
                  {line}
                </span>
              ) : (
                line
              )}
            </span>
          ))}
        </h1>

        {/* Sous-titre */}
        <p className="text-xl text-slate-400 max-w-2xl mx-auto mb-10 leading-relaxed">
          {subtitle}
        </p>

        {/* CTAs */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <a
            href={ctaPrimary.href}
            className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-semibold text-base transition-all shadow-lg shadow-orange-500/25 hover:shadow-orange-500/40"
          >
            {ctaPrimary.label}
            <ArrowRight className="w-4 h-4" />
          </a>
          <a
            href={ctaSecondary.href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-white font-semibold text-base transition-all"
          >
            <Github className="w-4 h-4" />
            {ctaSecondary.label}
          </a>
        </div>

        {/* Stats */}
        {stats.length > 0 && (
          <div className="mt-16 grid grid-cols-3 gap-8 max-w-lg mx-auto">
            {stats.map((stat, i) => (
              <div key={i} className="text-center">
                <div className="text-3xl font-bold text-white">{stat.value}</div>
                <div className="text-sm text-slate-500 mt-1">{stat.label}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
