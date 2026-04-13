# Regles pour les agents - Kerpta

## Utilisation des agents

### Agent Explore (recherche codebase)
- Toujours utiliser AVANT de coder une feature qui touche du code existant
- Demander la lecture COMPLETE des fichiers concernes (pas juste les 50 premieres lignes)
- Specifier "thoroughness: very thorough" pour les explorations critiques
- Inclure les modeles, schemas, services ET routes du module concerne

### Agent general-purpose (taches complexes)
- Utiliser pour les taches multi-etapes qui necessitent de la recherche + du code
- Donner le contexte complet : quels fichiers lire, quoi chercher, pourquoi
- Ne pas deleguer la comprehension - synthetiser les resultats soi-meme

### Agent Plan (architecture)
- Utiliser quand Emmanuel demande une feature majeure (nouveau module, refonte)
- Lire les specs docs/Agent/ avant de planifier
- Identifier TOUS les fichiers a modifier (modele, migration, schema, service, route, page, tests)

## Quand lancer des agents en parallele
- Lecture de fichiers backend + frontend en parallele
- Recherche de patterns + lecture de specs en parallele
- JAMAIS coder en parallele dans des agents - risque de conflits

## Contexte a fournir aux agents
Toujours inclure dans le prompt de l'agent :
- Le projet est Kerpta, SaaS comptable francais
- Architecture : FastAPI + SQLAlchemy text() + Pydantic / React + TanStack Query
- Multi-tenant strict : organization_id partout
- Montants en Decimal, jamais float
- Styles frontend dans formStyles.ts
- L'app ne tourne PAS en local
