UPDATE "User" AS intern
SET
  "role" = 'INTERN'::"Role",
  "name" = 'Klinik Stajyeri',
  "email" = 'stajyer@santa.local',
  "passwordHash" = admin."passwordHash",
  "active" = true
FROM "User" AS admin
WHERE intern."id" = 'user_intern'
  AND admin."id" = 'user_admin';

UPDATE "User"
SET
  "name" = 'Hazal Gül Akkuş',
  "email" = 'hazal@santa.local',
  "active" = true
WHERE "id" = 'user_selin';

UPDATE "User"
SET
  "name" = 'Merve Nur Akıl',
  "email" = 'merve@santa.local',
  "active" = true
WHERE "id" = 'user_baris';

UPDATE "TherapistProfile"
SET
  "displayName" = 'Psikolog & Aile Danışmanı Hazal Gül Akkuş',
  "specialties" = ARRAY['Bilişsel Davranış Terapisi', 'Aile Danışmanlığı', 'Deneyimsel Oyun Terapisi', 'EMDR'],
  "calendarId" = 'cal_hazal',
  "active" = true
WHERE "id" = 'therapist_selin';

UPDATE "TherapistProfile"
SET
  "displayName" = 'Klinik Psikolog Merve Nur Akıl',
  "specialties" = ARRAY['Bilişsel Davranışçı Terapi', 'Deneyimsel Oyun Terapisi', 'EMDR', 'Çocuk ve Ergen'],
  "calendarId" = 'cal_merve',
  "active" = true
WHERE "id" = 'therapist_baris';
