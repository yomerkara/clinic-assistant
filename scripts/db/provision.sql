\set ON_ERROR_STOP on
\getenv app_password APP_DATABASE_PASSWORD
\getenv migration_password MIGRATION_DATABASE_PASSWORD
BEGIN;
SELECT pg_advisory_xact_lock(hashtext('santa:database-role-provision'));
DO $$
BEGIN
  IF current_database() IN ('postgres', 'template0', 'template1') THEN
    RAISE EXCEPTION 'Select the dedicated application database';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname IN ('santa_app', 'santa_migrate')
    AND (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls))
    OR EXISTS (SELECT 1 FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.member
      WHERE r.rolname IN ('santa_app', 'santa_migrate')) THEN
    RAISE EXCEPTION 'Existing application roles have unsafe privileges or memberships';
  END IF;
END $$;
SELECT 'CREATE ROLE santa_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT'
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='santa_app') \gexec
SELECT 'CREATE ROLE santa_migrate LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT'
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='santa_migrate') \gexec
ALTER ROLE santa_app PASSWORD :'app_password';
ALTER ROLE santa_migrate PASSWORD :'migration_password';
SELECT format('REVOKE ALL ON DATABASE %I FROM PUBLIC, santa_app, santa_migrate', current_database()) \gexec
SELECT format('GRANT CONNECT ON DATABASE %I TO santa_app, santa_migrate', current_database()) \gexec
REVOKE ALL ON SCHEMA public FROM PUBLIC, santa_app;
ALTER SCHEMA public OWNER TO santa_migrate;
GRANT USAGE ON SCHEMA public TO santa_app;

-- Transfer only this database's public application objects. REASSIGN OWNED
-- would also touch shared objects and is deliberately not used.
SELECT format('ALTER TABLE %I.%I OWNER TO santa_migrate', n.nspname,c.relname)
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind IN ('r','p') AND c.relowner=(SELECT oid FROM pg_roles WHERE rolname=current_user) \gexec
SELECT format('ALTER SEQUENCE %I.%I OWNER TO santa_migrate', n.nspname,c.relname)
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind='S' AND c.relowner=(SELECT oid FROM pg_roles WHERE rolname=current_user) \gexec
SELECT format('ALTER TYPE %I.%I OWNER TO santa_migrate', n.nspname,t.typname)
FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
WHERE n.nspname='public' AND t.typtype='e' AND t.typowner=(SELECT oid FROM pg_roles WHERE rolname=current_user) \gexec
SELECT format('ALTER FUNCTION %s OWNER TO santa_migrate', p.oid::regprocedure)
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.prokind='f' AND p.proowner=(SELECT oid FROM pg_roles WHERE rolname=current_user) \gexec

ALTER DEFAULT PRIVILEGES FOR ROLE santa_migrate IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO santa_app;
ALTER DEFAULT PRIVILEGES FOR ROLE santa_migrate IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO santa_app;
ALTER DEFAULT PRIVILEGES FOR ROLE santa_migrate REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC, santa_app;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC;
SELECT format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE %I.%I TO santa_app', schemaname,tablename)
FROM pg_tables WHERE schemaname='public' AND tablename<>'_prisma_migrations' \gexec
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO santa_app;
COMMIT;
