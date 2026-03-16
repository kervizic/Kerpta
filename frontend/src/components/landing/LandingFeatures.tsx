// Kerpta — Section Fonctionnalités
import type { ComponentType } from 'react'
import {
  FileText, ShoppingCart, Landmark, Users, PenTool,
  BarChart3, Globe, HardDrive,
} from 'lucide-react'

const ICON_MAP: Record<string, ComponentType<{ className?: string }>> = {
  FileText, ShoppingCart, Landmark, Users, PenTool, BarChart3, Globe, HardDrive,
}

const COLOR_MAP: Record<string, { bg: string; text: string; ring: string }> = {
  blue:    { bg: 'bg-blue-50 dark:bg-blue-500/10',       text: 'text-blue-600 dark:text-blue-400',    ring: 'ring-blue-200 dark:ring-blue-500/20' },
  amber:   { bg: 'bg-amber-50 dark:bg-amber-500/10',     text: 'text-amber-600 dark:text-amber-400',  ring: 'ring-amber-200 dark:ring-amber-500/20' },
  emerald: { bg: 'bg-emerald-50 dark:bg-emerald-500/10', text: 'text-emerald-600 dark:text-emerald-400', ring: 'ring-emerald-200 dark:ring-emerald-500/20' },
  orange:  { bg: 'bg-kerpta-50 dark:bg-kerpta/10',   text: 'text-kerpta-600 dark:text-kerpta-400',  ring: 'ring-kerpta-200 dark:ring-kerpta/20' },
  pink:    { bg: 'bg-pink-50 dark:bg-pink-500/10',       text: 'text-pink-600 dark:text-pink-400',    ring: 'ring-pink-200 dark:ring-pink-500/20' },
  cyan:    { bg: 'bg-cyan-50 dark:bg-cyan-500/10',       text: 'text-cyan-600 dark:text-cyan-400',    ring: 'ring-cyan-200 dark:ring-cyan-500/20' },
  purple:  { bg: 'bg-purple-50 dark:bg-purple-500/10',   text: 'text-purple-600 dark:text-purple-400',  ring: 'ring-purple-200 dark:ring-purple-500/20' },
  slate:   { bg: 'bg-slate-100 dark:bg-slate-500/10',    text: 'text-slate-600 dark:text-slate-400',   ring: 'ring-slate-200 dark:ring-slate-500/20' },
}

interface FeatureItem {
  icon: string
  title: string
  description: string
  color: string
}

interface FeaturesContent {
  title?: string
  subtitle?: string
  items?: FeatureItem[]
}

export function LandingFeatures({ content }: { content: Record<string, unknown> }) {
  const c = content as FeaturesContent
  const title = c.title ?? 'Tout ce dont vous avez besoin'
  const subtitle = c.subtitle ?? ''
  const items: FeatureItem[] = (c.items as FeatureItem[]) ?? []

  return (
    <section id="features" className="py-24 px-6">
      <div className="max-w-6xl mx-auto">
        {/* En-tête */}
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">{title}</h2>
          {subtitle && <p className="text-lg text-gray-500 dark:text-slate-400 max-w-2xl mx-auto">{subtitle}</p>}
        </div>

        {/* Grille */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {items.map((item, i) => {
            const Icon = ICON_MAP[item.icon] ?? FileText
            const colors = COLOR_MAP[item.color] ?? COLOR_MAP.slate
            return (
              <div
                key={i}
                className="group relative rounded-2xl border border-gray-100 bg-white shadow-sm p-6 hover:shadow-md hover:border-gray-200 dark:border-white/5 dark:bg-white/[0.02] dark:hover:bg-white/[0.05] dark:hover:border-white/10 transition-all"
              >
                <div
                  className={`inline-flex items-center justify-center w-10 h-10 rounded-xl ${colors.bg} ring-1 ${colors.ring} mb-4`}
                >
                  <Icon className={`w-5 h-5 ${colors.text}`} />
                </div>
                <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-2">{item.title}</h3>
                <p className="text-sm text-gray-500 dark:text-slate-400 leading-relaxed">{item.description}</p>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
