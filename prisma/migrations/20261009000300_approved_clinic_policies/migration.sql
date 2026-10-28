-- Clinic operator explicitly supplied these policies on 2026-10-09.
-- Hours are deliberately excluded until the ambiguous 8–11 range is clarified.
INSERT INTO "KnowledgeDocument" ("id", "title", "content", "source", "approvalStatus", "version") VALUES
('clinic_policy_price', 'Onaylı seans ücreti', 'Seans ücretimiz 4.000 TL’dir.', 'clinic-operator-2026-10-09', 'APPROVED', 1),
('clinic_policy_online', 'Onaylı online seans bilgisi', 'Online seans imkânımız bulunmaktadır. Online görüşme tercihinizi randevu talebinizde belirtebilirsiniz.', 'clinic-operator-2026-10-09', 'APPROVED', 1),
('clinic_policy_guardian', 'Onaylı çocuk ve ergen başvuru koşulu', 'Çocuk ve ergen başvurularında veli onayı gereklidir; velinin eşlik etmesi de gerekir.', 'clinic-operator-2026-10-09', 'APPROVED', 1)
ON CONFLICT ("id") DO NOTHING;
