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

## Deploiement VPS
- Le deploy est ENTIEREMENT gere par Claude (toi)
- Apres chaque push sur beta : se connecter au VPS et deployer
- VPS : kerpta.fr (164.132.49.26), user `claude`, cle `~/.ssh/kerpta_deploy`, chemin `/opt/kerpta`
- Commande de deploy sur le VPS :
  ```
  ssh -i ~/.ssh/kerpta_deploy claude@100.118.236.48 "cd /opt/kerpta && git pull origin beta && docker compose up -d --build"
  ```
- Rebuild selectif : seuls les services modifies sont rebuildes
  - Modif backend/ -> rebuild api + worker
  - Modif frontend/ -> rebuild frontend
  - Modif docker-compose ou .env -> rebuild tout
- Ne pas relancer LiteLLM sauf si sa config change
- Apres deploy : verifier que les conteneurs tournent (`docker ps`)
- Si erreur de migration : lire les logs (`docker logs kerpta-api-1 --tail 50`)

## Verification post-deploy
- Verifier que l'API repond : `curl -s https://[domain]/health`
- Si migration Alembic : verifier les logs du conteneur api
- Si modif frontend : verifier que la page charge correctement
