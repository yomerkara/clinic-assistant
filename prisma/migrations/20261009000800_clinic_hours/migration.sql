INSERT INTO "KnowledgeDocument" ("id", "title", "content", "source", "approvalStatus", "version")
VALUES ('clinic_policy_hours', 'Onaylı çalışma saatleri', 'Çalışma saatlerimiz Salı–Cuma 08.00–23.00 arasındadır.', 'clinic-operator-2026-10-09', 'APPROVED', 1)
ON CONFLICT ("id") DO UPDATE SET "content" = EXCLUDED."content", "approvalStatus" = 'APPROVED', "version" = "KnowledgeDocument"."version" + 1;
DELETE FROM "FaqAnswerCache";
