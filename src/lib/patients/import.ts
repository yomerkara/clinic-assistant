import { normalizePatientName } from "./identity";
export type ImportMapping = {
  name: number;
  surname?: number;
  phone: number;
  age?: number;
  notes?: number;
};
export type ImportRow = {
  row: number;
  displayName: string;
  phone: string;
  age: number | null;
  availabilityNotes: string | null;
  status: "new" | "duplicate" | "review" | "invalid";
  reason: string;
};
export function normalizeImportPhone(value: string) {
  if (/[^\d+\s().-]/.test(value)) return null;
  let n = value.replace(/[\s().-]/g, "");
  if (n.startsWith("00")) n = "+" + n.slice(2);
  if (/^0\d{10}$/.test(n)) n = "+90" + n.slice(1);
  else if (/^5\d{9}$/.test(n)) n = "+90" + n;
  else if (/^90\d{10}$/.test(n)) n = "+" + n;
  return /^\+[1-9]\d{7,14}$/.test(n) ? n : null;
}
export function classifyImport(
  rows: string[][],
  mapping: ImportMapping,
  existing: Array<{ displayName: string; phone: string }>,
  headerRow = 0,
): ImportRow[] {
  const known = existing.map((p) => ({
    name: normalizePatientName(p.displayName),
    phone: normalizeImportPhone(p.phone),
  }));
  const seen = new Set<string>();
  return rows.slice(headerRow + 1).flatMap((cells, index) => {
    if (!cells.some((c) => c.trim())) return [];
    const get = (i: number | undefined) => (i == null ? "" : (cells[i] ?? "").trim());
    const displayName = [get(mapping.name), get(mapping.surname)]
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ");
    const rawPhone = get(mapping.phone),
      phone = normalizeImportPhone(rawPhone);
    const rawAge = get(mapping.age),
      age = rawAge ? Number(rawAge) : null;
    const notes = get(mapping.notes);
    const row: ImportRow = {
      row: headerRow + index + 2,
      displayName,
      phone: phone ?? rawPhone,
      age,
      availabilityNotes: notes || null,
      status: "new",
      reason: "Yeni müşteri",
    };
    if (
      displayName.length < 3 ||
      displayName.length > 120 ||
      !displayName.includes(" ") ||
      /^[=+@-]|[\r\n]/.test(displayName) ||
      !phone ||
      (age !== null && (!Number.isInteger(age) || age < 0 || age > 120)) ||
      notes.length > 1000
    ) {
      return [
        {
          ...row,
          status: "invalid" as const,
          reason:
            "Ad soyad, telefon veya yaş geçersiz. Telefon için ülke kodunu kullanın.",
        },
      ];
    }
    const name = normalizePatientName(displayName),
      key = `${name}|${phone}`;
    if (seen.has(key) || known.some((p) => p.phone === phone && p.name === name)) {
      row.status = "duplicate";
      row.reason = "Aynı ad ve telefon zaten var; atlanacak.";
    } else if (known.some((p) => p.phone === phone || p.name === name)) {
      row.status = "review";
      row.reason = "Aynı ad veya telefonla farklı kayıt var; otomatik eklenmeyecek.";
    }
    seen.add(key);
    // Detect shared identifiers within this file too; never merge on name alone.
    if (row.status === "new") known.push({ name, phone });
    return [row];
  });
}
