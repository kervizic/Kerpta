// Kerpta — Page vitrine publique
// Récupère le contenu depuis /api/v1/platform/content et rend les sections.

import { useEffect, useState } from 'react'
import { LandingHero } from '@/components/landing/LandingHero'
import { LandingFeatures } from '@/components/landing/LandingFeatures'
import { LandingPricing } from '@/components/landing/LandingPricing'
import { LandingOpenSource } from '@/components/landing/LandingOpenSource'
import { LandingFooter } from '@/components/landing/LandingFooter'
import { LandingNav } from '@/components/landing/LandingNav'
import { ThemeToggle } from '@/components/ThemeToggle'

interface ContentSection {
  section: string
  content: Record<string, unknown>
  visible: boolean
  sort_order: number
}

export default function LandingPage() {
  const [sections, setSections] = useState<Record<string, Record<string, unknown>>>({})

  useEffect(() => {
    fetch('/api/v1/platform/content')
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) {
          const map: Record<string, Record<string, unknown>> = {}
          ;(data.sections as ContentSection[]).forEach((s) => {
            map[s.section] = s.content
          })
          setSections(map)
        }
      })
      .catch(() => {/* contenu statique affiche si API indisponible */})
  }, [])

  return (
    <div className="min-h-screen bg-white text-gray-900 dark:bg-slate-950 dark:text-white">
      <LandingNav />
      <LandingHero content={sections.hero ?? {}} />
      <LandingFeatures content={sections.features ?? {}} />
      <LandingPricing content={sections.pricing ?? {}} />
      <LandingOpenSource content={sections.opensource ?? {}} />
      <LandingFooter content={sections.footer ?? {}} />
      <ThemeToggle />
    </div>
  )
}
