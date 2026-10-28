import { ModelCallError } from "./types";
export type ModelFailure = {
  kind:
    | "timeout"
    | "capacity"
    | "provider_unavailable"
    | "authentication"
    | "invalid_response"
    | "unknown";
  retryable: boolean;
  httpStatus?: number;
  schemaPaths?: string[];
};
// Persist categories/field paths only, never the provider body or patient text.
export function modelFailure(error: unknown): ModelFailure {
  if (!(error instanceof ModelCallError)) return { kind: "unknown", retryable: false };
  const detail = error.detail ?? "";
  const status = detail.match(/\bHTTP (\d{3})\b/);
  if (status) {
    const httpStatus = Number(status[1]);
    return {
      kind:
        httpStatus === 429
          ? "capacity"
          : [502, 503, 504].includes(httpStatus)
            ? "provider_unavailable"
            : [401, 403].includes(httpStatus)
              ? "authentication"
              : "unknown",
      retryable: [429, 502, 503, 504].includes(httpStatus),
      httpStatus,
    };
  }
  if (/aborted|timed? ?out|timeout/i.test(detail))
    return { kind: "timeout", retryable: true };
  try {
    const issues: unknown = JSON.parse(detail);
    if (
      Array.isArray(issues) &&
      issues.every((issue) => issue && Array.isArray(issue.path))
    ) {
      const schemaPaths = issues.map((issue) =>
        issue.path
          .filter(
            (p: unknown) =>
              typeof p === "number" || (typeof p === "string" && /^[a-zA-Z_]+$/.test(p)),
          )
          .join("."),
      );
      return { kind: "invalid_response", retryable: false, schemaPaths };
    }
  } catch {
    /* Ordinary error messages are intentionally not persisted. */
  }
  return {
    kind: /JSON|model response|model content|structured|Unexpected token/i.test(detail)
      ? "invalid_response"
      : "unknown",
    retryable: false,
  };
}
