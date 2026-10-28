-- Run after every migration. Never expose Prisma's migration ledger to the app.
DO $$
DECLARE entry record;
BEGIN
  IF current_user <> 'santa_migrate' THEN
    RAISE EXCEPTION 'Deploy migrations using the dedicated santa_migrate account';
  END IF;
  FOR entry IN SELECT tablename FROM pg_tables WHERE schemaname='public' LOOP
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM santa_app',entry.tablename);
    IF entry.tablename <> '_prisma_migrations' THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO santa_app',entry.tablename);
    END IF;
  END LOOP;
END $$;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO santa_app;
