-- Kerpta - Creation de la base de donnees LiteLLM
-- Isole les tables Prisma de LiteLLM pour eviter les conflits
-- avec les migrations Alembic de Kerpta (RLS policies, etc.)

CREATE DATABASE litellm;
