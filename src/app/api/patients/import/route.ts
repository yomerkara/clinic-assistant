import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import readExcelFile from "read-excel-file/node";
import { unzipSync } from "fflate";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { allowAuthAttempt } from "@/lib/auth/rate-limit";
import { prisma } from "@/lib/prisma";
import { classifyImport } from "@/lib/patients/import";
export const runtime = "nodejs";
class ImportInputError extends Error {}
const MAX = 5 * 1024 * 1024;
const col = z.number().int().min(0).max(39);
const mappingSchema = z.object({
  name: col,
  surname: col.optional(),
  phone: col,
  age: col.optional(),
  notes: col.optional(),
});
async function boundedForm(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new ImportInputError("Dosya seçin.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > MAX + 65536) {
      await reader.cancel();
      throw new ImportInputError("Dosya en fazla 5 MB olabilir.");
    }
    chunks.push(value);
  }
  return new Response(Buffer.concat(chunks), {
    headers: { "Content-Type": request.headers.get("content-type") ?? "" },
  }).formData();
}
export async function POST(request: Request) {
  const user = await requireUser();
  if (user.role !== "ADMIN")
    return NextResponse.json(
      { error: "Bu işlem için yönetici yetkisi gerekir." },
      { status: 403 },
    );
  if (!(await allowAuthAttempt("patient-import", user.id, 30, 300)))
    return NextResponse.json(
      { error: "Çok fazla yükleme yapıldı. Birkaç dakika sonra deneyin." },
      { status: 429 },
    );
  try {
    const form = await boundedForm(request);
    const file = form.get("file");
    if (
      !(file instanceof File) ||
      !file.name.toLowerCase().endsWith(".xlsx") ||
      file.size > MAX
    )
      throw new ImportInputError("En fazla 5 MB büyüklüğünde .xlsx dosyası seçin.");
    const buffer = Buffer.from(await file.arrayBuffer());
    let inflated = 0,
      count = 0;
    unzipSync(buffer, {
      filter: (entry) => {
        inflated += entry.originalSize;
        count++;
        if (inflated > 20 * 1024 * 1024 || count > 500)
          throw new ImportInputError("Excel dosyası çok büyük veya karmaşık.");
        return false;
      },
    });
    const sheets = await readExcelFile(buffer);
    if (sheets.length > 20)
      throw new ImportInputError("En fazla 20 sayfalı dosyalar destekleniyor.");
    const sheetIndex = Number(form.get("sheet") ?? 0),
      headerRow = Number(form.get("headerRow") ?? 0);
    if (
      !Number.isInteger(sheetIndex) ||
      !sheets[sheetIndex] ||
      !Number.isInteger(headerRow) ||
      headerRow < 0 ||
      headerRow > 19
    )
      throw new ImportInputError("Sayfa veya başlık satırı geçersiz.");
    const source = sheets[sheetIndex].data;
    if (source.length > 2020 || source.some((row) => row.length > 40))
      throw new ImportInputError(
        "Dosyayı en fazla 2.000 müşteri ve 40 sütun içerecek şekilde bölün.",
      );
    const rows = source.map((row) =>
      row.map((cell) =>
        cell == null
          ? ""
          : cell instanceof Date
            ? cell.toISOString().slice(0, 10)
            : String(cell),
      ),
    );
    if (rows.some((row) => row.some((cell) => cell.length > 2000)))
      throw new ImportInputError("Bir hücre 2.000 karakter sınırını aşıyor.");
    const mode = String(form.get("mode") ?? "read");
    if (mode === "read")
      return NextResponse.json({
        sheets: sheets.map((s) => s.sheet),
        sample: rows.slice(0, 25),
        total: Math.max(0, rows.length - 1),
      });
    const mapping = mappingSchema.parse(JSON.parse(String(form.get("mapping"))));
    const mapped = Object.values(mapping);
    if (new Set(mapped).size !== mapped.length)
      throw new ImportInputError("Her alan için farklı bir sütun seçin.");
    if (rows.length - headerRow - 1 > 2000)
      throw new ImportInputError("Bir seferde en fazla 2.000 müşteri yükleyin.");
    const result = await prisma.$transaction(
      async (tx) => {
        if (mode === "commit")
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('patient-import'))`;
        const existing = await tx.patient.findMany({
          select: { displayName: true, phone: true },
        });
        const preview = classifyImport(rows, mapping, existing, headerRow);
        const fingerprint = createHash("sha256")
          .update(JSON.stringify(preview))
          .digest("hex");
        if (mode !== "commit") return { rows: preview, fingerprint };
        if (fingerprint !== form.get("fingerprint"))
          return { error: "Kayıtlar değişti. Önizlemeyi yenileyip tekrar kontrol edin." };
        const fresh = preview.filter((row) => row.status === "new");
        if (fresh.length)
          await tx.patient.createMany({
            data: fresh.map(({ displayName, phone, age, availabilityNotes }) => ({
              displayName,
              phone,
              age,
              availabilityNotes,
            })),
          });
        await tx.auditEvent.create({
          data: {
            actorId: user.id,
            action: "patients.import",
            entityType: "Patient",
            entityId: "batch",
            metadata: { created: fresh.length, skipped: preview.length - fresh.length },
          },
        });
        return { created: fresh.length, skipped: preview.length - fresh.length };
      },
      { timeout: 15000 },
    );
    return NextResponse.json(result, { status: "error" in result ? 409 : 200 });
  } catch (error) {
    if (error instanceof z.ZodError)
      return NextResponse.json(
        { error: "Ad soyad ve telefon sütunlarını seçin." },
        { status: 400 },
      );
    const message = error instanceof ImportInputError ? error.message : "Excel okunamadı. Dosyayı .xlsx biçiminde yeniden kaydedip deneyin.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
