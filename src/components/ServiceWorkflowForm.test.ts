import { expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ServiceWorkflowForm } from "./ServiceWorkflowForm";
it("renders persisted waitlist criteria in Istanbul time instead of empty fields", () => {
  const html = renderToStaticMarkup(createElement(ServiceWorkflowForm, {
    id: "test", kind: "WAITLIST", admin: true, configured: true, notified: false,
    therapists: [{ id: "t1", displayName: "Uzman" }],
    workflow: { therapistId: "t1", from: "2026-10-20T07:00:00Z", until: "2026-10-25T14:00:00Z", startMinute: 600, endMinute: 1020 },
  }));
  expect(html).toContain('value="2026-10-20T10:00"');
  expect(html).toContain('value="2026-10-25T17:00"');
  expect(html).toContain('value="10:00"');
  expect(html).toContain('value="17:00"');
  expect(html).toMatch(/value="t1"[^>]*selected|selected[^>]*value="t1"/);
});
