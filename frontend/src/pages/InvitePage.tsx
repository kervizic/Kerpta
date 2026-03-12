// Kerpta — Page d'acceptation d'invitation
// Copyright (C) 2026 Emmanuel Kervizic
// Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

import { useEffect, useState } from 'react'
import { Users, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import { apiClient } from '@/lib/api'
import { useAuthStore } from '@/stores/authStore'
import { navigate } from '@/hooks/useRoute'
import axios from 'axios'

// ── Types ──────────────────────────────────────────────────────────────────────

interface InvitePreview {
  org_id: string
  org_name: string
  role: string
  custom_permissions: string[] | null
  expires_at: string
  is_email_targeted: boolean
  target_email: string | null
}

const ROLE_LABELS: Record<string, string> = {
  owner: 'Administrateur',
  accountant: 'Comptable',
  commercial: 'Commercial',
  employee: 'Employé',
  custom: 'Personnalisé',
}

// ── Composant ─────────────────────────────────────────────────────────────────

export default function InvitePage({ token }: { token: string }) {
  const { token: authToken, fetchOrgs } = useAuthStore()
  const [preview, setPreview] = useState<InvitePreview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [accepting, setAccepting] = useState(false)
  const [accepted, setAccepted] = useState(false)
  const [acceptedOrg, setAcceptedOrg] = useState('')

  // Si pas connecté → stocker le token dans sessionStorage et rediriger
  useEffect(() => {
    if (!authToken) {
      sessionStorage.setItem('pending_invite_token', token)
      navigate('/login')
      return
    }
    void loadPreview()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authToken, token])

  async function loadPreview() {
    setLoading(true)
    setError('')
    try {
      const { data } = await apiClient.get<InvitePreview>(`/invitations/${token}`)
      setPreview(data)
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const d = err.response?.data as { detail?: string } | undefined
        setError(d?.detail ?? 'Invitation introuvable ou expirée')
      } else {
        setError('Erreur de connexion')
      }
    } finally {
      setLoading(false)
    }
  }

  async function handleAccept() {
    setAccepting(true)
    try {
      const { data } = await apiClient.post<{ org_id: string; org_name: string; role: string }>(
        `/invitations/${token}/accept`
      )
      setAcceptedOrg(data.org_name)
      setAccepted(true)
      await fetchOrgs()
      // Rediriger vers l'app après 2 secondes
      setTimeout(() => navigate('/app'), 2000)
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const d = err.response?.data as { detail?: string } | undefined
        setError(d?.detail ?? "Erreur lors de l'acceptation")
      } else {
        setError('Erreur de connexion')
      }
      setAccepting(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <span className="text-2xl font-bold">
            <span className="text-gray-900">KER</span>
            <span className="text-orange-500">PTA</span>
          </span>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
          {loading && (
            <div className="flex flex-col items-center py-6">
              <Loader2 className="w-8 h-8 animate-spin text-orange-500 mb-3" />
              <p className="text-sm text-gray-400">Chargement de l'invitation…</p>
            </div>
          )}

          {!loading && error && (
            <div className="flex flex-col items-center py-4 text-center">
              <div className="w-12 h-12 rounded-xl bg-red-50 border border-red-200 flex items-center justify-center mb-4">
                <AlertCircle className="w-6 h-6 text-red-500" />
              </div>
              <h2 className="text-base font-semibold text-gray-900 mb-2">Invitation invalide</h2>
              <p className="text-sm text-gray-500 mb-6">{error}</p>
              <button
                onClick={() => navigate('/app')}
                className="text-sm text-orange-600 hover:text-orange-700 font-medium transition"
              >
                Retour à l'application
              </button>
            </div>
          )}

          {!loading && !error && accepted && (
            <div className="flex flex-col items-center py-4 text-center">
              <div className="w-12 h-12 rounded-xl bg-green-50 border border-green-200 flex items-center justify-center mb-4">
                <CheckCircle2 className="w-6 h-6 text-green-600" />
              </div>
              <h2 className="text-base font-semibold text-gray-900 mb-1">
                Vous avez rejoint {acceptedOrg}
              </h2>
              <p className="text-sm text-gray-400">Redirection en cours…</p>
            </div>
          )}

          {!loading && !error && !accepted && preview && (
            <>
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 rounded-xl bg-orange-50 border border-orange-200 flex items-center justify-center">
                  <Users className="w-6 h-6 text-orange-600" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-gray-900">
                    Invitation à rejoindre
                  </h2>
                  <p className="text-sm text-gray-500">{preview.org_name}</p>
                </div>
              </div>

              <div className="space-y-3 mb-6">
                <div className="flex justify-between py-2 border-b border-gray-100">
                  <span className="text-sm text-gray-500">Organisation</span>
                  <span className="text-sm font-medium text-gray-900">{preview.org_name}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-gray-100">
                  <span className="text-sm text-gray-500">Rôle attribué</span>
                  <span className="text-sm font-medium text-gray-900">
                    {ROLE_LABELS[preview.role] ?? preview.role}
                  </span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-sm text-gray-500">Expire le</span>
                  <span className="text-sm text-gray-700">
                    {new Date(preview.expires_at).toLocaleDateString('fr-FR', {
                      day: '2-digit',
                      month: 'long',
                      year: 'numeric',
                    })}
                  </span>
                </div>
              </div>

              {preview.is_email_targeted && preview.target_email && (
                <div className="mb-5 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
                  Cette invitation est réservée à <strong>{preview.target_email}</strong>.
                  Assurez-vous d'être connecté avec la bonne adresse email.
                </div>
              )}

              <button
                onClick={() => void handleAccept()}
                disabled={accepting}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition"
              >
                {accepting && <Loader2 className="w-4 h-4 animate-spin" />}
                {accepting ? 'Acceptation…' : "Accepter l'invitation →"}
              </button>
              <button
                onClick={() => navigate('/app')}
                className="w-full text-center text-sm text-gray-400 hover:text-gray-600 mt-3 transition"
              >
                Refuser
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
