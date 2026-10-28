import { describe, expect, it } from "vitest";
import { checkHealth } from "./health";

describe("checkHealth", () => {
  it("returns ok when the database ping succeeds", async () => {
    const result = await checkHealth(async () => undefined);
    expect(result).toEqual({ ok: true });
  });

  it("returns not ok when the database ping fails", async () => {
    const result = await checkHealth(async () => {
      throw new Error("connection refused");
    });
    expect(result).toEqual({ ok: false });
  });
});
