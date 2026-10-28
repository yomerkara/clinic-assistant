import { expect, it } from "vitest";
import { ModelCallError } from "./types";
import { modelFailure } from "./failure";
it.each([
  ["HTTP 429 private provider body", "capacity", true],
  ["This operation was aborted", "timeout", true],
  ["HTTP 503 internal details", "provider_unavailable", true],
  ["HTTP 403 secret", "authentication", false],
  ["Unexpected token in JSON", "invalid_response", false],
] as const)("classifies %s without retaining raw details", (detail, kind, retryable) => {
  const result = modelFailure(new ModelCallError("failed", detail));
  expect(result).toMatchObject({ kind, retryable });
  expect(JSON.stringify(result)).not.toContain("secret");
  expect(JSON.stringify(result)).not.toContain("private");
});
it("keeps only schema paths for malformed model output", () => {
  expect(
    modelFailure(
      new ModelCallError(
        "failed",
        JSON.stringify([{ path: ["requests", 0, "kind"], message: "private content" }]),
      ),
    ),
  ).toEqual({
    kind: "invalid_response",
    retryable: false,
    schemaPaths: ["requests.0.kind"],
  });
});
it("does not mark unknown application failures retryable", () => {
  expect(modelFailure(new Error("database failed"))).toEqual({
    kind: "unknown",
    retryable: false,
  });
});
