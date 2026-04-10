# Regles Git - Kerpta

## Commits
- Message en francais, concis, sans tiret cadratin
- Committer apres chaque modification - systematiquement
- Pousser immediatement apres chaque commit - systematiquement
- Format : verbe a l'infinitif + description courte
  Exemples : "Corriger le calcul TVA", "Ajouter le module devis"

## Branches
- Phase actuelle : tout sur `beta` (deploiement direct VPS)
- Phase normale : feature/xxx ou fix/xxx depuis develop
- Jamais de push direct sur main ou develop

## Deploiement
- Le hook PostToolUse detecte `git push` et deploie automatiquement sur le VPS
- Seuls les services modifies sont rebuildes (backend/ -> api+worker, frontend/ -> frontend)
- Ne pas relancer LiteLLM sauf si sa config change
