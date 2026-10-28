import type { PrismaClient } from "@prisma/client";

export async function assertRuntimeDatabaseRole(prisma: PrismaClient) {
  const [role] = await prisma.$queryRaw<Array<{ unsafe: boolean }>>`
    SELECT (
      r.rolsuper OR r.rolcreatedb OR r.rolcreaterole OR r.rolreplication OR r.rolbypassrls
      OR has_database_privilege(current_user, current_database(), 'CREATE')
      OR has_database_privilege(current_user, current_database(), 'TEMP')
      OR has_schema_privilege(current_user, 'public', 'CREATE')
      OR EXISTS (SELECT 1 FROM pg_auth_members WHERE member=r.oid)
      OR EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='public' AND c.relowner=r.oid)
      OR has_table_privilege(current_user, 'public._prisma_migrations', 'INSERT,UPDATE,DELETE,TRUNCATE')
    ) AS unsafe FROM pg_roles r WHERE r.rolname=current_user
  `;
  if (!role || role.unsafe) {
    throw new Error(
      "Runtime database account has administrative or schema privileges; use the restricted application account.",
    );
  }
}
