import { describe, expect, it } from "vitest";
import { OPERATION_NOTICES } from "./OperationNotice";

const { ERRORS, DONE, UNKNOWN_ERROR } = OPERATION_NOTICES;

// Every error key the queue and conversation routes can redirect with.
const EMITTED_ERRORS = [
  "incomplete_profile",
  "forbidden",
  "slot_conflict",
  "conflict",
  "bot",
  "calendar",
  "invalid_time",
  "calendar_required",
  "rate",
];

describe("staff operation messages", () => {
  it("covers every error the application redirects with", () => {
    for (const key of EMITTED_ERRORS) expect(ERRORS[key], key).toBeTruthy();
  });

  it("tells the reader what to do next, not just what failed", () => {
    for (const [key, notice] of Object.entries({ ...ERRORS, unknown: UNKNOWN_ERROR })) {
      expect(notice.title.length, key).toBeGreaterThan(10);
      // A usable message explains the next step.
      expect(notice.detail, key).toMatch(
        /deneyin|tamamlay|kontrol|seçin|devralın|düzelt|bekleyin|bildirin|isteyebilirsiniz|dönün/i,
      );
    }
  });

  it("states that nothing changed when an action was refused", () => {
    for (const key of [
      "incomplete_profile",
      "forbidden",
      "conflict",
      "calendar",
      "rate",
    ])
      expect(ERRORS[key]!.detail, key).toMatch(
        /değişiklik yapılmadı|uygulanmadı|onaylanmadı|durduruldu/i,
      );
  });

  it("never blames the user or shows a raw code", () => {
    for (const notice of [...Object.values(ERRORS), UNKNOWN_ERROR, ...Object.values(DONE)]) {
      expect(notice.detail).not.toMatch(/\b(HTTP|500|undefined|null|Error:)\b/);
      expect(notice.detail).not.toMatch(/hatalı kullanım|yanlış yaptınız/i);
    }
  });

  it("describes what actually happened on success", () => {
    expect(DONE.approved!.detail).toMatch(/takvim/i);
    expect(DONE.rejected!.detail).toMatch(/oluşturulmadı/i);
    expect(DONE.edited!.detail).toMatch(/kesinleşmez|onaya hazır/i);
  });

  it("falls back to a safe message for an unexpected key", () => {
    expect(ERRORS["not_a_real_key"]).toBeUndefined();
    expect(UNKNOWN_ERROR.detail).toMatch(/hiçbir değişiklik uygulanmadı/i);
  });
});
