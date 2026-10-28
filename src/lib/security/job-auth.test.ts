import { describe, expect, it } from "vitest";
import { authorizeJob } from "./job-auth";

const secret = "a9c06b58f324d107e8625b40c79a3d16";
const request = (token?: string) =>
  new Request("http://localhost/api/jobs/inbound", {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });

describe("job authorization", () => {
  it.each(["", "local-reminder-job-secret", "a".repeat(32)])(
    "rejects unsafe configured secrets",
    (unsafe) => {
      expect(authorizeJob(request(unsafe), unsafe)).toBe(false);
    },
  );
  it("requires the exact configured bearer value", () => {
    expect(authorizeJob(request(), secret)).toBe(false);
    expect(authorizeJob(request("b".repeat(32)), secret)).toBe(false);
    expect(authorizeJob(request(secret), secret)).toBe(true);
  });
});
