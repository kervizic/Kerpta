-- Kerpta — Script d'initialisation PostgreSQL
-- Exécuté automatiquement par postgres:alpine au premier démarrage
-- (uniquement si le répertoire data est vide)
--
-- Objectif : GoTrue (Supabase Auth) exige que le schéma "auth" existe avant
-- de lancer ses propres migrations. On le pré-crée ici pour éviter l'erreur :
--   ERROR: schema "auth" does not exist (SQLSTATE 3F000)

CREATE SCHEMA IF NOT EXISTS auth;
