CREATE TABLE "ClinicSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "monthlyUsageLimitUsd" DOUBLE PRECISION NOT NULL DEFAULT 50,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClinicSettings_pkey" PRIMARY KEY ("id")
);

INSERT INTO "ClinicSettings" ("id", "monthlyUsageLimitUsd", "updatedAt")
VALUES ('default', 50, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

-- Keep the four real application accounts active. Test-created accounts remain
-- in place for auditability but can no longer sign in.
UPDATE "User"
SET "active" = false
WHERE "id" NOT IN ('user_admin', 'user_selin', 'user_baris', 'user_intern');

UPDATE "User"
SET "name" = 'Klinik Yöneticisi', "email" = 'admin@santa.local', "passwordHash" = '5b17dd5a615cc4ab216e072e24d18fca:7ef6194045beb1845a8f879b9ac66f0e306cced85ddcd8d19fc07e08708a5b51c4c5ddea57b94f993598d8e60d8e9097c8e80a4c7641c5436e0d412058a13df4', "active" = true
WHERE "id" = 'user_admin';

UPDATE "User"
SET "name" = 'Hazal Gül Akkuş', "email" = 'hazal@santa.local', "passwordHash" = '796d204419b0722018b350492d34eac6:b700281bc9d8136d119cbddeb168adab2bb5cd69744c97294675b65eded856ac0e6b63120a392d0948825e39fc354d603a81b683cc25e21dd9b89ee0045c1fe7', "active" = true
WHERE "id" = 'user_selin';

UPDATE "User"
SET "name" = 'Merve Nur Akıl', "email" = 'merve@santa.local', "passwordHash" = '65c8ce52e24413697c38289013f573e9:f1522768e435562ad6fc6c9d3f6eda73b7d91fbf584fbaf1ba5774ec3f39f3b956ef78d0f10a009cb41f943d333c5f443688be53a8e4fbade195e1a674ad3b0f', "active" = true
WHERE "id" = 'user_baris';

UPDATE "User"
SET "name" = 'Klinik Stajyeri', "email" = 'stajyer@santa.local', "passwordHash" = '1e01003dce35a34728de993ad5c49962:9f651b70d90125e0b2e94c060018805e0dbe3637846fd1f5d30b344dfac74400b36fca76388f1fea8a3c37515a41af46ca14115a37e5a0cc2860d59efc9ed9d7', "active" = true
WHERE "id" = 'user_intern';
