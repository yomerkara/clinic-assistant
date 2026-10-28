INSERT INTO "KnowledgeDocument" ("id", "title", "content", "source", "approvalStatus", "version")
VALUES ('clinic_policy_hours', 'Onaylı çalışma saatleri', 'Randevu saatlerimiz Salı–Pazar 08.00–23.00 arasındadır. Asistanımıza her gün, günün her saatinde yazabilirsiniz.', 'clinic-operator-2026-10-12', 'APPROVED', 1)
ON CONFLICT ("id") DO UPDATE SET "content" = EXCLUDED."content", "source" = EXCLUDED."source", "approvalStatus" = 'APPROVED', "version" = "KnowledgeDocument"."version" + 1;
DELETE FROM "FaqAnswerCache";
