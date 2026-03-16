// Kerpta — Section Tarifs
import { Check, X, Zap } from 'lucide-react'

interface PlanFeature {
  label: string
  included: boolean
  detail?: string
}

interface PlanCta {
  label: string
  href: string
}

interface Plan {
  id: string
  name: string
  price: string
  period: string
  badge: string | null
  highlighted: boolean
  description: string
  cta: PlanCta
  features: PlanFeature[]
}

interface PricingContent {
  title?: string
  subtitle?: string
  note?: string
  plans?: Plan[]
}

export function LandingPricing({ content }: { content: Record<string, unknown> }) {
  const c = content as PricingContent
  const title = c.title ?? 'Simple et transparent'
  const subtitle = c.subtitle ?? ''
  const note = c.note ?? ''
  const plans: Plan[] = (c.plans as Plan[]) ?? []

  return (
    <section id="pricing" className="py-24 px-6">
      <div className="relative">
        <div className="absolute inset-0 -z-10">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gray-200 dark:via-slate-700 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-gray-200 dark:via-slate-700 to-transparent" />
        </div>

        <div className="max-w-5xl mx-auto">
          {/* En-tête */}
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">{title}</h2>
            {subtitle && (
              <p className="text-lg text-gray-500 dark:text-slate-400 max-w-2xl mx-auto">{subtitle}</p>
            )}
          </div>

          {/* Grille des plans */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-3xl mx-auto">
            {plans.map((plan) => (
              <div
                key={plan.id}
                className={`relative rounded-2xl p-8 flex flex-col ${
                  plan.highlighted
                    ? 'bg-kerpta-600/10 border border-kerpta/40 ring-1 ring-kerpta/30'
                    : 'bg-white border border-gray-200 shadow-sm dark:bg-white/[0.02] dark:border-white/5'
                }`}
              >
                {/* Badge */}
                {plan.badge && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-kerpta-600 text-white text-xs font-semibold shadow-lg">
                      <Zap className="w-3 h-3" />
                      {plan.badge}
                    </span>
                  </div>
                )}

                {/* Nom et prix */}
                <div className="mb-6">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">{plan.name}</h3>
                  <p className="text-gray-500 dark:text-slate-400 text-sm mb-4">{plan.description}</p>
                  <div className="flex items-baseline gap-2">
                    <span className={`text-4xl font-bold ${plan.highlighted ? 'text-kerpta-600 dark:text-kerpta-300' : 'text-gray-900 dark:text-white'}`}>
                      {plan.price}
                    </span>
                    <span className="text-gray-400 dark:text-slate-500 text-sm">{plan.period}</span>
                  </div>
                </div>

                {/* CTA */}
                <a
                  href={plan.cta.href}
                  className={`w-full text-center py-3 px-6 rounded-xl font-semibold text-sm mb-8 transition-all ${
                    plan.highlighted
                      ? 'border border-kerpta/40 text-kerpta-600 dark:text-kerpta-400 bg-kerpta-50/50 dark:bg-kerpta-900/10 cursor-not-allowed'
                      : 'border border-kerpta text-kerpta hover:bg-kerpta-50 dark:text-kerpta-400 dark:hover:bg-kerpta-900/20 bg-white dark:bg-gray-900 shadow-sm'
                  }`}
                >
                  {plan.cta.label}
                </a>

                {/* Liste des fonctionnalités */}
                <ul className="space-y-3 flex-1">
                  {plan.features.map((feature, i) => (
                    <li key={i} className="flex items-start gap-3">
                      {feature.included ? (
                        <Check className="w-4 h-4 text-emerald-500 dark:text-emerald-400 mt-0.5 shrink-0" />
                      ) : (
                        <X className="w-4 h-4 text-gray-300 dark:text-slate-600 mt-0.5 shrink-0" />
                      )}
                      <span className={`text-sm ${feature.included ? 'text-gray-700 dark:text-slate-300' : 'text-gray-400 dark:text-slate-600'}`}>
                        {feature.label}
                        {feature.detail && (
                          <span className="ml-1 text-xs text-gray-400 dark:text-slate-500">({feature.detail})</span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {/* Note */}
          {note && (
            <div className="mt-10 max-w-2xl mx-auto text-center">
              <p className="text-sm text-gray-400 dark:text-slate-500 leading-relaxed">{note}</p>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
