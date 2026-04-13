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
- Connexion SSH :
  - Priorite : `ssh -i ~/.ssh/kerpta_deploy claude@kerpta.fr`
  - Backup (Tailscale) : `ssh -i ~/.ssh/kerpta_deploy claude@100.118.236.48`
  - User : `claude` (acces Docker uniquement, pas root)
  - Chemin projet : `/opt/kerpta`
- Commande de deploy :
  ```
  ssh -i ~/.ssh/kerpta_deploy claude@kerpta.fr "cd /opt/kerpta && git pull origin beta && docker compose up -d --build api worker"
  ```
- Rebuild selectif : seuls les services modifies sont rebuildes
  - Modif backend/ -> rebuild api + worker
  - Modif frontend/ -> rebuild frontend
  - Modif docker-compose ou .env -> rebuild tout
- Ne pas relancer LiteLLM sauf si sa config change
- Si la connexion kerpta.fr echoue (fail2ban), utiliser l'IP Tailscale

## Verification post-deploy
- Verifier que les conteneurs tournent : `docker ps --format 'table {{.Names}}\t{{.Status}}' | grep kerpta`
- Si migration Alembic : verifier `docker exec kerpta-postgres psql -U postgres -d kerpta -c "SELECT version_num FROM alembic_version;"`
- Si conteneur en restart : lire les logs `docker logs kerpta-api --tail 30`
- Base de donnees : user postgres `postgres`, database `kerpta`
