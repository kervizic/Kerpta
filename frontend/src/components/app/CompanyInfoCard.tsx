// Kerpta — Carte d'informations entreprise réutilisable (données INSEE enrichies)
// Copyright (C) 2026 Emmanuel Kervizic
// Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

import { useEffect, useState } from 'react'
import { fmtCurrencyRounded as formatCurrency } from '@/lib/formatting'
import {
  Building2, MapPin, Briefcase, Users, UserRound,
  TrendingUp, FileText, Loader2, ExternalLink, Info,
  BadgeCheck, Globe,
} from 'lucide-react'
import { apiClient } from '@/lib/api'

// ── Types ────────────────────────────────────────────────────────────────────

interface AddressOut {
  voie?: string | null
  complement?: string | null
  code_postal?: string | null
  commune?: string | null
  pays?: string
}

interface EtablissementOut {
  siret: string
  nic: string
  siege: boolean
  etat?: string
  activite_principale?: string | null
  date_creation?: string | null
  adresse?: AddressOut | null
}

interface DirigeantOut {
  nom?: string | null
  prenoms?: string | null
  qualite?: string | null
  nationalite?: string | null
  annee_de_naissance?: string | null
  type_dirigeant?: string | null
}

interface FinanceYearOut {
  annee: string
  ca?: number | null
  resultat_net?: number | null
}

interface CompanyDetailsOut {
  siren: string
  denomination?: string | null
  nom_complet?: string | null
  sigle?: string | null
  activite_principale?: string | null
  section_activite_principale?: string | null
  categorie_juridique?: string | null
  categorie_juridique_libelle?: string | null
  date_creation?: string | null
  etat: string
  tva_intracom: string
  tranche_effectifs?: string | null
  tranche_effectifs_libelle?: string | null
  tranche_effectifs_annee?: string | null
  categorie_entreprise?: string | null
  caractere_employeur?: string | null
  nombre_etablissements?: number | null
  dirigeants?: DirigeantOut[]
  finances?: FinanceYearOut[]
  conventions_collectives?: string[]
  est_ess?: boolean | null
  est_association?: boolean | null
  est_qualiopi?: boolean | null
  date_mise_a_jour?: string | null
  siege?: EtablissementOut | null
  etablissements_actifs?: EtablissementOut[]
  nombre_etablissements_actifs?: number
}

// ── Dictionnaires de libellés ────────────────────────────────────────────────

const NAF_SECTIONS: Record<string, string> = {
  A: 'Agriculture, sylviculture et pêche',
  B: 'Industries extractives',
  C: 'Industrie manufacturière',
  D: 'Production et distribution d\'électricité, gaz, vapeur et air conditionné',
  E: 'Production et distribution d\'eau ; assainissement, gestion des déchets',
  F: 'Construction',
  G: 'Commerce ; réparation d\'automobiles et de motocycles',
  H: 'Transports et entreposage',
  I: 'Hébergement et restauration',
  J: 'Information et communication',
  K: 'Activités financières et d\'assurance',
  L: 'Activités immobilières',
  M: 'Activités spécialisées, scientifiques et techniques',
  N: 'Activités de services administratifs et de soutien',
  O: 'Administration publique',
  P: 'Enseignement',
  Q: 'Santé humaine et action sociale',
  R: 'Arts, spectacles et activités récréatives',
  S: 'Autres activités de services',
  T: 'Activités des ménages en tant qu\'employeurs',
  U: 'Activités extra-territoriales',
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatAddress(a: AddressOut | null | undefined): string {
  if (!a) return '—'
  return [
    a.voie,
    a.complement,
    a.code_postal && a.commune ? `${a.code_postal} ${a.commune}` : (a.commune ?? a.code_postal),
  ].filter(Boolean).join(', ') || '—'
}

function formatSiret(s: string): string {
  if (s.length === 14) {
    return `${s.slice(0, 3)} ${s.slice(3, 6)} ${s.slice(6, 9)} ${s.slice(9)}`
  }
  return s
}

function formatDate(d: string | null | undefined): string {
  if (!d) return '—'
  try {
    return new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
  } catch {
    return d
  }
}


// ── Composant ────────────────────────────────────────────────────────────────

interface CompanyInfoCardProps {
  siren: string
  /** Masquer les champs déjà affichés ailleurs (pour OrgSettingsPage) */
  hideIdentity?: boolean
}

export default function CompanyInfoCard({ siren, hideIdentity = false }: CompanyInfoCardProps) {
  const [company, setCompany] = useState<CompanyDetailsOut | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!siren) return
    setLoading(true)
    setError(null)
    apiClient.get<CompanyDetailsOut>(`/companies/${siren}`)
      .then((data) => setCompany(data))
      .catch(() => setError('Impossible de charger les données entreprise'))
      .finally(() => setLoading(false))
  }, [siren])

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="w-5 h-5 text-kerpta animate-spin" />
      </div>
    )
  }

  if (error || !company) {
    return (
      <div className="text-sm text-gray-400 py-4 flex items-center gap-2">
        <Info className="w-4 h-4" />
        {error ?? 'Aucune donnée disponible'}
      </div>
    )
  }

  const siege = company.siege
  const dirigeants = company.dirigeants ?? []
  const finances = company.finances ?? []
  const conventions = company.conventions_collectives ?? []
  const etabs = company.etablissements_actifs ?? []
  const sectionLabel = company.section_activite_principale
    ? NAF_SECTIONS[company.section_activite_principale]
    : null

  return (
    <div className="space-y-4">

      {/* ── Identité de l'entreprise ─────────────────────────────── */}
      {!hideIdentity && (
        <section className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider flex items-center gap-2">
            <Building2 className="w-4 h-4 text-gray-400" />
            Identité de l'entreprise
          </h2>
          <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <Field label="Dénomination" value={company.denomination} />
            {company.nom_complet && company.nom_complet !== company.denomination && (
              <Field label="Nom complet" value={company.nom_complet} />
            )}
            {company.sigle && <Field label="Sigle" value={company.sigle} />}
            <Field label="SIREN" value={company.siren} mono />
            <Field label="Forme juridique" value={company.categorie_juridique_libelle} />
            {company.categorie_juridique && (
              <Field label="Code juridique" value={company.categorie_juridique} mono />
            )}
            <Field label="TVA intracommunautaire" value={company.tva_intracom} mono />
            <Field label="Date de création" value={formatDate(company.date_creation)} />
            {company.categorie_entreprise && (
              <Field label="Catégorie" value={company.categorie_entreprise} />
            )}
            <Field label="État" value={company.etat} />
          </div>
          {/* Badges */}
          <div className="flex flex-wrap gap-2">
            {company.est_ess && <Badge label="ESS" title="Économie Sociale et Solidaire" />}
            {company.est_association && <Badge label="Association" />}
            {company.est_qualiopi && <Badge label="Qualiopi" />}
            {company.caractere_employeur === 'O' && <Badge label="Employeur" />}
          </div>
          <p className="text-xs text-gray-400 flex items-center gap-1 pt-1">
            <Info className="w-3 h-3 shrink-0" />
            Source : registre INSEE
            {company.date_mise_a_jour && (
              <span> — MAJ {formatDate(company.date_mise_a_jour)}</span>
            )}
          </p>
        </section>
      )}

      {/* ── Identité manquante (mode hideIdentity) : badges + catégorie ── */}
      {hideIdentity && (
        <section className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider flex items-center gap-2">
            <Building2 className="w-4 h-4 text-gray-400" />
            Informations complémentaires INSEE
          </h2>
          <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            {company.nom_complet && company.nom_complet !== company.denomination && (
              <Field label="Nom complet" value={company.nom_complet} />
            )}
            {company.categorie_entreprise && (
              <Field label="Catégorie entreprise" value={company.categorie_entreprise} />
            )}
            {company.caractere_employeur && (
              <Field label="Employeur" value={company.caractere_employeur === 'O' ? 'Oui' : 'Non'} />
            )}
            {company.date_mise_a_jour && (
              <Field label="Dernière MAJ INSEE" value={formatDate(company.date_mise_a_jour)} />
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {company.est_ess && <Badge label="ESS" title="Économie Sociale et Solidaire" />}
            {company.est_association && <Badge label="Association" />}
            {company.est_qualiopi && <Badge label="Qualiopi" />}
          </div>
        </section>
      )}

      {/* ── Siège social ─────────────────────────────────────────── */}
      {siege && !hideIdentity && (
        <section className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider flex items-center gap-2">
            <MapPin className="w-4 h-4 text-gray-400" />
            Siège social
          </h2>
          <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <div className="col-span-2">
              <span className="text-gray-400 block text-xs mb-0.5">Adresse</span>
              <span className="text-gray-900">{formatAddress(siege.adresse)}</span>
            </div>
            <Field label="SIRET" value={formatSiret(siege.siret)} mono />
            {siege.activite_principale && (
              <Field label="Code APE" value={siege.activite_principale} mono />
            )}
            {siege.date_creation && (
              <Field label="Début d'activité" value={formatDate(siege.date_creation)} />
            )}
          </div>
        </section>
      )}

      {/* ── Activité ─────────────────────────────────────────────── */}
      {(company.activite_principale || sectionLabel) && (
        <section className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider flex items-center gap-2">
            <Briefcase className="w-4 h-4 text-gray-400" />
            Activité
          </h2>
          <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            {company.activite_principale && (
              <Field label="Code NAF/APE" value={company.activite_principale} mono />
            )}
            {company.section_activite_principale && (
              <Field label="Section" value={`${company.section_activite_principale} — ${sectionLabel ?? ''}`} />
            )}
          </div>
        </section>
      )}

      {/* ── Effectifs & Établissements ───────────────────────────── */}
      <section className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider flex items-center gap-2">
          <Users className="w-4 h-4 text-gray-400" />
          Effectifs & Établissements
        </h2>
        <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
          {company.tranche_effectifs_libelle && (
            <Field
              label="Effectif salarié"
              value={`${company.tranche_effectifs_libelle}${company.tranche_effectifs_annee ? ` (${company.tranche_effectifs_annee})` : ''}`}
            />
          )}
          {company.nombre_etablissements != null && (
            <Field label="Établissements ouverts" value={String(company.nombre_etablissements)} />
          )}
        </div>

        {/* Liste des établissements */}
        {!hideIdentity && etabs.length > 0 && (
          <div className="space-y-2 pt-2">
            <p className="text-xs text-gray-500 font-medium">Liste des établissements actifs :</p>
            {etabs.map((etab) => {
              const isClosed = etab.etat === 'F'
              return (
                <div
                  key={etab.siret}
                  className={`px-4 py-3 rounded-xl border ${
                    isClosed ? 'border-gray-100 bg-gray-50 opacity-60' : 'border-gray-200'
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm text-gray-900 tracking-wide">
                      {formatSiret(etab.siret)}
                    </span>
                    {etab.siege && (
                      <span className="text-xs bg-kerpta-100 text-kerpta-700 px-1.5 py-0.5 rounded font-medium">
                        Siège
                      </span>
                    )}
                    {isClosed && (
                      <span className="text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded font-medium">
                        Fermé
                      </span>
                    )}
                  </div>
                  {etab.adresse && (
                    <p className="text-xs text-gray-400 mt-1">{formatAddress(etab.adresse)}</p>
                  )}
                  {etab.activite_principale && (
                    <p className="text-xs text-gray-400 mt-0.5">APE : {etab.activite_principale}</p>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* ── Dirigeants ───────────────────────────────────────────── */}
      {dirigeants.length > 0 && (
        <section className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider flex items-center gap-2">
            <UserRound className="w-4 h-4 text-gray-400" />
            Dirigeants
          </h2>
          <div className="space-y-3">
            {dirigeants.map((d, i) => (
              <div key={i} className="flex items-start gap-3 text-sm">
                <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center shrink-0 mt-0.5">
                  <UserRound className="w-4 h-4 text-gray-400" />
                </div>
                <div>
                  <p className="font-medium text-gray-900">
                    {[d.prenoms, d.nom].filter(Boolean).join(' ') || '—'}
                  </p>
                  <div className="flex flex-wrap gap-2 mt-0.5">
                    {d.qualite && (
                      <span className="text-xs text-gray-500">{d.qualite}</span>
                    )}
                    {d.annee_de_naissance && (
                      <span className="text-xs text-gray-400">né(e) en {d.annee_de_naissance}</span>
                    )}
                    {d.nationalite && (
                      <span className="text-xs text-gray-400">{d.nationalite}</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Finances ─────────────────────────────────────────────── */}
      {finances.length > 0 && (
        <section className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-gray-400" />
            Finances
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs font-semibold text-gray-400 uppercase">
                  <th className="py-2 pr-4">Année</th>
                  <th className="py-2 pr-4 text-right">Chiffre d'affaires</th>
                  <th className="py-2 text-right">Résultat net</th>
                </tr>
              </thead>
              <tbody>
                {finances.map((f) => (
                  <tr key={f.annee} className="border-b border-gray-50">
                    <td className="py-2 pr-4 font-medium text-gray-900">{f.annee}</td>
                    <td className="py-2 pr-4 text-right text-gray-700">{formatCurrency(f.ca)}</td>
                    <td className={`py-2 text-right ${
                      f.resultat_net != null && f.resultat_net < 0 ? 'text-red-600' : 'text-gray-700'
                    }`}>
                      {formatCurrency(f.resultat_net)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ── Conventions collectives ──────────────────────────────── */}
      {conventions.length > 0 && (
        <section className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider flex items-center gap-2">
            <FileText className="w-4 h-4 text-gray-400" />
            Conventions collectives
          </h2>
          <div className="space-y-2">
            {conventions.map((idcc) => (
              <div key={idcc} className="flex items-center gap-3 text-sm">
                <span className="font-mono text-gray-900">IDCC {idcc}</span>
                <a
                  href={`https://www.legifrance.gouv.fr/conv_coll/id/KALICONT${idcc.padStart(12, '0')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-kerpta hover:underline flex items-center gap-1 text-xs"
                >
                  Légifrance <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Lien Pappers */}
      <div className="text-xs text-gray-400 flex items-center gap-1">
        <Globe className="w-3 h-3" />
        <span>Plus de détails sur</span>
        <a
          href={`https://www.pappers.fr/entreprise/${company.siren}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-kerpta hover:underline"
        >
          Pappers
        </a>
      </div>
    </div>
  )
}

// ── Sous-composants ──────────────────────────────────────────────────────────

function Field({ label, value, mono }: { label: string; value?: string | null; mono?: boolean }) {
  if (!value) return null
  return (
    <div>
      <span className="text-gray-400 block text-xs mb-0.5">{label}</span>
      <span className={`text-gray-900 ${mono ? 'font-mono' : 'font-medium'}`}>{value}</span>
    </div>
  )
}

function Badge({ label, title }: { label: string; title?: string }) {
  return (
    <span
      title={title}
      className="inline-flex items-center gap-1 text-xs bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 rounded-full font-medium"
    >
      <BadgeCheck className="w-3 h-3" />
      {label}
    </span>
  )
}
