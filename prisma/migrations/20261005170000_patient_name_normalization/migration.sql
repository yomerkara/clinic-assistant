-- Normalize all write paths, including imports and nested Prisma writes.
CREATE FUNCTION normalize_patient_name() RETURNS trigger AS $$
BEGIN
  NEW."displayName" := lower(translate(regexp_replace(trim(NEW."displayName"), '\s+', ' ', 'g'), 'Iİ', 'ıi'));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER patient_name_normalization BEFORE INSERT OR UPDATE OF "displayName"
ON "Patient" FOR EACH ROW EXECUTE FUNCTION normalize_patient_name();
UPDATE "Patient" SET "displayName" = "displayName";
