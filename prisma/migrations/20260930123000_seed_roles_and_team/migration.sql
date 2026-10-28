INSERT INTO "User" ("id", "role", "name", "email", "passwordHash", "active", "createdAt")
SELECT
  'user_intern',
  'INTERN'::"Role",
  'Klinik Stajyeri',
  'stajyer@santa.local',
  "passwordHash",
  true,
  CURRENT_TIMESTAMP
FROM "User"
WHERE "role" = 'ADMIN'
ORDER BY "createdAt" ASC
LIMIT 1
ON CONFLICT DO NOTHING;

UPDATE "TherapistProfile"
SET "active" = false
WHERE "id" NOT IN ('therapist_selin', 'therapist_baris');
