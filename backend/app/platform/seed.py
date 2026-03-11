# Kerpta — Application comptable web française
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

"""Contenu initial de la page vitrine Kerpta.

Ce fichier définit le contenu par défaut de chaque section.
Il est utilisé au premier démarrage (ou lors d'un reset dev) pour
peupler la table platform_content.
"""

from __future__ import annotations

INITIAL_SECTIONS: list[dict] = [
    {
        "section": "hero",
        "sort_order": 1,
        "visible": True,
        "content": {
            "title": "La comptabilité française,\nenfin open source",
            "subtitle": (
                "Kerpta gère vos devis, factures, achats, paie et rapprochement "
                "bancaire. Hébergez chez vous — vos données restent les vôtres."
            ),
            "badge": "AGPL-3.0 · 100 % gratuit · Auto-hébergeable",
            "cta_primary": {"label": "Commencer gratuitement", "href": "#open-source"},
            "cta_secondary": {
                "label": "Voir sur GitHub",
                "href": "https://github.com/kervizic/kerpta",
            },
            "stats": [
                {"value": "40+", "label": "tables métier"},
                {"value": "100%", "label": "conforme PCG"},
                {"value": "0€", "label": "pour toujours"},
            ],
        },
    },
    {
        "section": "features",
        "sort_order": 2,
        "visible": True,
        "content": {
            "title": "Tout ce dont une TPE française a besoin",
            "subtitle": (
                "De la création du devis à la déclaration de TVA, "
                "Kerpta couvre l'intégralité du cycle comptable."
            ),
            "items": [
                {
                    "icon": "FileText",
                    "title": "Devis & Factures",
                    "description": (
                        "Numérotation automatique, format Factur-X EN 16931, "
                        "mentions légales intégrées, conversion devis → facture en 1 clic."
                    ),
                    "color": "blue",
                },
                {
                    "icon": "ShoppingCart",
                    "title": "Achats fournisseurs",
                    "description": (
                        "Cycle complet DRF → BCF → Facture fournisseur avec "
                        "génération automatique des écritures comptables PCG."
                    ),
                    "color": "violet",
                },
                {
                    "icon": "Landmark",
                    "title": "Rapprochement bancaire",
                    "description": (
                        "Connexion PSD2 via Nordigen ou import CSV/OFX/MT940. "
                        "Algorithme de rapprochement automatique avec score de confiance."
                    ),
                    "color": "emerald",
                },
                {
                    "icon": "Users",
                    "title": "RH & Paie",
                    "description": (
                        "Fiches de paie, export DSN v3, notes de frais avec OCR "
                        "Mindee, barème kilométrique fiscal versionné."
                    ),
                    "color": "orange",
                },
                {
                    "icon": "PenTool",
                    "title": "Signature électronique",
                    "description": (
                        "DocuSeal intégré (auto-hébergé) pour signer devis, "
                        "contrats et bons de commande. Audit trail PDF. eIDAS."
                    ),
                    "color": "pink",
                },
                {
                    "icon": "BarChart3",
                    "title": "Comptabilité PCG",
                    "description": (
                        "Journal automatique, déclarations TVA pré-remplies (CA3), "
                        "export FEC légal, liasse fiscale 2033/2035."
                    ),
                    "color": "cyan",
                },
                {
                    "icon": "Globe",
                    "title": "Mini-site vitrine",
                    "description": (
                        "Éditeur drag-drop Puck pour publier votre site d'entreprise "
                        "directement depuis Kerpta, avec articles et formulaire de contact."
                    ),
                    "color": "indigo",
                },
                {
                    "icon": "HardDrive",
                    "title": "Vos données chez vous",
                    "description": (
                        "Zéro fichier sur nos serveurs. Stockage délégué à votre "
                        "Drive, S3, SFTP ou Dropbox. Credentials chiffrés AES-256."
                    ),
                    "color": "slate",
                },
            ],
        },
    },
    {
        "section": "pricing",
        "sort_order": 3,
        "visible": True,
        "content": {
            "title": "Simple et transparent",
            "subtitle": (
                "Kerpta est gratuit et open source. Une offre Premium sera disponible "
                "pour les organisations souhaitant des synchronisations et mises à jour prioritaires."
            ),
            "note": (
                "La partie gratuite sera toujours disponible. Les abonnés Premium "
                "bénéficieront d'un traitement prioritaire : synchronisation bancaire "
                "quotidienne vs tous les 15 jours pour le plan gratuit."
            ),
            "plans": [
                {
                    "id": "free",
                    "name": "Gratuit",
                    "price": "0 €",
                    "period": "pour toujours",
                    "badge": None,
                    "highlighted": False,
                    "description": "Toutes les fonctionnalités, hébergez chez vous.",
                    "cta": {"label": "Installer maintenant", "href": "#open-source"},
                    "features": [
                        {"label": "Tous les modules activés", "included": True},
                        {"label": "Utilisateurs & organisations illimités", "included": True},
                        {"label": "Facturation Factur-X EN 16931", "included": True},
                        {"label": "Comptabilité PCG + export FEC", "included": True},
                        {
                            "label": "Synchronisation bancaire",
                            "included": True,
                            "detail": "tous les 15 jours",
                        },
                        {"label": "Mini-site (sous-domaine kerpta.fr)", "included": True},
                        {"label": "Open source AGPL-3.0", "included": True},
                        {"label": "Synchronisation bancaire quotidienne", "included": False},
                        {"label": "Domaine personnalisé mini-site", "included": False},
                        {"label": "Support prioritaire", "included": False},
                    ],
                },
                {
                    "id": "premium",
                    "name": "Premium",
                    "price": "Bientôt",
                    "period": "par organisation / mois",
                    "badge": "Prochainement",
                    "highlighted": True,
                    "description": "Priorité sur les synchronisations et les mises à jour.",
                    "cta": {"label": "Être notifié", "href": "#"},
                    "features": [
                        {"label": "Tout le plan Gratuit", "included": True},
                        {
                            "label": "Synchronisation bancaire quotidienne",
                            "included": True,
                            "detail": "au lieu de 15 jours",
                        },
                        {"label": "Mises à jour en priorité", "included": True},
                        {"label": "Support prioritaire", "included": True},
                        {"label": "Domaine personnalisé mini-site", "included": True},
                        {"label": "Google Analytics 4 mini-site", "included": True},
                    ],
                },
            ],
        },
    },
    {
        "section": "opensource",
        "sort_order": 4,
        "visible": True,
        "content": {
            "title": "Open source & auto-hébergeable",
            "subtitle": (
                "Kerpta est sous licence AGPL-3.0. Déployez votre instance "
                "en quelques minutes avec Docker Compose."
            ),
            "github_url": "https://github.com/kervizic/kerpta",
            "license": "AGPL-3.0",
            "requirements": [
                {"icon": "Server", "label": "VPS ou serveur Linux"},
                {"icon": "Package", "label": "Docker + Docker Compose"},
                {"icon": "Globe", "label": "Nom de domaine (optionnel)"},
            ],
            "steps": [
                {
                    "step": 1,
                    "title": "Cloner le dépôt",
                    "code": "git clone https://github.com/kervizic/kerpta.git\ncd kerpta",
                },
                {
                    "step": 2,
                    "title": "Configurer l'environnement",
                    "code": "cp .env.example .env\n# Éditez .env avec vos paramètres\n# (base de données, OAuth Google/Microsoft...)",
                },
                {
                    "step": 3,
                    "title": "Démarrer avec Docker",
                    "code": "docker compose up -d\n# L'application démarre sur http://localhost:3000",
                },
                {
                    "step": 4,
                    "title": "Finaliser l'installation",
                    "code": "# Ouvrez http://localhost:3000/setup\n# Suivez l'assistant en 3 étapes :\n# 1. Base de données\n# 2. OAuth (Google, Microsoft...)\n# 3. Compte administrateur",
                },
            ],
        },
    },
    {
        "section": "footer",
        "sort_order": 5,
        "visible": True,
        "content": {
            "tagline": "La comptabilité française, libre et open source.",
            "links": [
                {
                    "label": "GitHub",
                    "href": "https://github.com/kervizic/kerpta",
                    "icon": "Github",
                },
                {
                    "label": "Documentation",
                    "href": "https://github.com/kervizic/kerpta/wiki",
                    "icon": "BookOpen",
                },
                {
                    "label": "Signaler un bug",
                    "href": "https://github.com/kervizic/kerpta/issues",
                    "icon": "Bug",
                },
            ],
            "license_text": "Licence AGPL-3.0 — © 2026 Kerpta",
        },
    },
]
