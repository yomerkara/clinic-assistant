import { describe, it, expect } from "vitest";
import { classifyImport, normalizeImportPhone } from "./import";
describe("customer import", () => {
  it("normalizes Turkish formats and rejects ambiguous numbers", () => {
    for (const value of [
      "0555 111 00 17",
      "5551110017",
      "905551110017",
      "00905551110017",
      "+90 (555) 111-0017",
    ])
      expect(normalizeImportPhone(value)).toBe("+905551110017");
    expect(normalizeImportPhone("12345")).toBeNull();
    expect(normalizeImportPhone("5551110017 ext3")).toBeNull();
  });
  it("does not merge people just because their family shares a phone", () => {
    const rows = [
      ["Ad", "Telefon"],
      ["Ayşe Yıldırım", "05551110017"],
      ["Deniz Yıldırım", "05551110017"],
      ["Yeni Müşteri", "05551110018"],
      ["Yeni Müşteri", "+905551110018"],
      ["Ayşe Yıldırım", "05551110019"],
      ["Eksik", "123"],
    ];
    const result = classifyImport(rows, { name: 0, phone: 1 }, [
      { displayName: "Ayşe Yıldırım", phone: "+905551110017" },
    ]);
    expect(result.map((r) => r.status)).toEqual([
      "duplicate",
      "review",
      "new",
      "duplicate",
      "review",
      "invalid",
    ]);
  });
  it("supports a separate surname, header offset and optional ages", () => {
    const result = classifyImport(
      [
        ["Liste"],
        ["Ad", "Soyad", "Telefon", "Yaş"],
        ["Örnek", "Kişi", "05551110020", "28"],
        ["Diğer", "Kişi", "05551110021", "999"],
      ],
      { name: 0, surname: 1, phone: 2, age: 3 },
      [],
      1,
    );
    expect(result[0]).toMatchObject({
      row: 3,
      displayName: "Örnek Kişi",
      age: 28,
      status: "new",
    });
    expect(result[1].status).toBe("invalid");
  });
});
