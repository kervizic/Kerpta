-- Kerpta — Script d'initialisation PostgreSQL
-- Exécuté automatiquement par postgres:18-alpine au premier démarrage
-- (uniquement si le répertoire data est vide)
--
-- Objectif : GoTrue (Supabase Auth) exige que le rôle "postgres" existe pour
-- y accorder des permissions via ses migrations RLS.
-- Notre superuser étant "kerpta" (défini via POSTGRES_USER), on crée le rôle
-- "postgres" comme alias superuser pour satisfaire GoTrue.

DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'postgres') THEN
        CREATE ROLE postgres WITH SUPERUSER;
        RAISE NOTICE 'Rôle postgres créé (alias superuser pour GoTrue).';
    ELSE
        RAISE NOTICE 'Rôle postgres déjà existant — aucune action.';
    END IF;
END
$$;
