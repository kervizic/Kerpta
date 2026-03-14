# Roadmap

Règle : une feature n'entre dans un sprint que si elle peut être utilisée de A à Z sans dépendre d'un module manquant.

---

## Phase 1 — MVP (mois 1–3)
*Objectif : un freelance peut remplacer son générateur de factures Word/Excel.*

### Mois 1 — Foundation
- [ ] Auth (inscription, connexion, mot de passe oublié via Supabase)
- [ ] Onboarding organisation (SIRET auto-complétion INSEE, mentions légales, logo)
- [ ] CRUD clients (import SIRET → API Sirene)
- [ ] Catalogue produits/services
- [ ] API REST base + migrations Alembic initiales

### Mois 2 — Facturation cœur
- [ ] Création de factures (formulaire complet)
- [ ] Numérotation automatique : `PF-YYYY-NNNN` (proforma à la création), `FA-YYYY-NNNN` (définitif à la validation)
- [ ] Génération PDF/A-3 (Playwright + template Jinja2)
- [ ] **Génération Factur-X EN 16931** (lib `factur-x` Python)
- [ ] Envoi email avec fichier Factur-X en pièce jointe (Resend)
- [ ] Enregistrement des paiements
- [ ] Statuts automatiques (paid / overdue via Celery Beat)
- [ ] Liste factures avec filtres et recherche
- [ ] Colonnes PDP en base (nullables)

### Mois 3 — Devis + Dashboard
- [ ] Création de devis (`DV-YYYY-NNNN`)
- [ ] Conversion devis → facture en 1 clic
- [ ] Avoir (`AV-YYYY-NNNN`, attribué à la validation, lignes en négatif, lié à la facture d'origine)
- [ ] Tableau de bord : 4 KPIs + graphique CA 12 mois
- [ ] Alertes : impayés, devis expirant < 3j
- [ ] Export liste factures CSV

**Livrable MVP :** production. Cible bêta : 50 utilisateurs.

---

## Phase 2 — Notes de frais + Comptabilité (mois 4–5)
*Objectif : couvrir le quotidien d'une TPE 1–5 personnes.*

### Mois 4
- [ ] Module notes de frais (saisie manuelle)
- [ ] Capture photo + OCR (Mindee API)
- [ ] Catégorisation PCG automatique
- [ ] Workflow validation + remboursements
- [ ] Journal comptable automatique (factures + dépenses)

### Mois 5
- [ ] Grand livre simplifié
- [ ] Balance comptable
- [ ] Rapprochement bancaire basique (import CSV banque)
- [ ] Export FEC (18 colonnes, `|`, UTF-8)
- [ ] Déclaration TVA pré-remplie (CA3 / CA12)

---

## Phase 3 — Paie (mois 6–8)
*Objectif : éliminer le besoin d'un logiciel de paie séparé pour les TPE < 10 salariés.*

### Mois 6–7
- [ ] Fiches employés
- [ ] Paramétrage conventions collectives (fichier config versionné)
- [ ] Calcul automatique cotisations (moteur paie)
- [ ] Génération bulletins de salaire PDF

### Mois 8
- [ ] Export DSN v3 (Net-Entreprises, délai 5 ou 15 du mois)
- [ ] Gestion absences et congés
- [ ] Heures supplémentaires et majorations
- [ ] Archivage légal bulletins (5 ans employeur / vie entière salarié)

---

## Phase 4 — Bilan & Déclarations fiscales (mois 9–10)
*Objectif : permettre la clôture sans expert-comptable pour les cas simples.*

- [ ] Bilan simplifié automatique (2033-A)
- [ ] Compte de résultat automatique
- [ ] Processus guidé de clôture d'exercice
- [ ] Liasse fiscale 2033 (BIC simplifié)
- [ ] Liasse fiscale 2035 (BNC)
- [ ] Export PDF bilan + compte de résultat
- [ ] Mode accès comptable (rôle `accountant` read-only)

---

## Phase 5 — Polish & Croissance (mois 11+)

- [ ] Application mobile (React Native)
- [ ] Intégrations bancaires (Powens / Bridge — import transactions auto)
- [ ] Multi-devises (USD, GBP, CHF)
- [ ] API publique pour intégrations tierces
- [ ] Signature électronique devis (YouSign)
- [ ] **Connexion PDP agréée DGFIP** (avant sept. 2026 pour réception)
- [ ] **Gestion statuts PDP** (reçue / acceptée / refusée)
- [ ] **E-reporting** B2C et international vers DGFIP
- [ ] Chorus Pro UBL (marchés publics)
- [ ] IA : catégorisation auto dépenses, détection anomalies

---

## Métriques cibles

| Phase | Utilisateurs | MRR cible |
|---|---|---|
| MVP (M3) | 100 bêta gratuits | 0 |
| Phase 2 (M5) | 300 utilisateurs, 10% payants | 500 € |
| Phase 3 (M8) | 1 000 utilisateurs, 20% payants | 3 000 € |
| Phase 4 (M10) | 2 500 utilisateurs, 25% payants | 10 000 € |
| Phase 5+ | 10 000 utilisateurs | 50 000 € |

---

## Points d'attention

**Facturation électronique :** Factur-X EN 16931 intégré dès la v1 (Mois 2). Argument commercial fort avant l'obligation sept. 2026. Connexion PDP Phase 5 avant sept. 2026 (réception) et sept. 2027 (émission TPE).

**Sécurité données :** Hébergement France OVH (RGPD), AES-256 au repos, TLS 1.3, backups quotidiens 30j, logs d'audit complets.
