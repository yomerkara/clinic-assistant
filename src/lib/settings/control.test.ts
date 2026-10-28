import { describe, expect, it } from "vitest";
import {
  ASSISTANT_OFF_REPLY,
  assistantOffHandoffReason,
  FEATURE_FLAGS,
  FLAG_LABELS,
  isFeatureFlag,
  mergeFlags,
  parseControls,
} from "./control";

describe("parseControls", () => {
  it("treats a missing row as a fully enabled assistant with default screens", () => {
    const controls = parseControls(null);
    expect(controls.assistantEnabled).toBe(true);
    expect(controls.flags["screen.conversations"]).toBe(true);
    // Extra cost and latency stay off until the clinic turns them on.
    expect(controls.flags["assistant.secondPassReview"]).toBe(false);
    expect(controls.flags["ops.hourlyTherapistDigest"]).toBe(false);
  });

  it("keeps stored values and fills the rest from defaults", () => {
    const controls = parseControls({
      assistantEnabled: false,
      assistantOffReason: "bakım",
      featureFlags: { "screen.invoices": false, "assistant.secondPassReview": true },
    });
    expect(controls.assistantEnabled).toBe(false);
    expect(controls.assistantOffReason).toBe("bakım");
    expect(controls.flags["screen.invoices"]).toBe(false);
    expect(controls.flags["assistant.secondPassReview"]).toBe(true);
    expect(controls.flags["screen.calendar"]).toBe(true);
  });

  it("falls back to defaults when the stored map is unusable", () => {
    for (const featureFlags of [null, "off", [], 7]) {
      const controls = parseControls({ assistantEnabled: true, featureFlags });
      expect(controls.flags["assistant.secondPassReview"]).toBe(false);
      expect(controls.flags["screen.patients"]).toBe(true);
    }
  });

  it("ignores a non-boolean stored flag instead of treating it as on", () => {
    const controls = parseControls({ featureFlags: { "screen.usage": "yes" } });
    expect(controls.flags["screen.usage"]).toBe(true);
  });

  it("keeps an explicit false, which is the whole point of the switch", () => {
    const controls = parseControls({ featureFlags: { "screen.usage": false } });
    expect(controls.flags["screen.usage"]).toBe(false);
  });
});

describe("mergeFlags", () => {
  it("applies a known flag", () => {
    expect(mergeFlags({}, { "screen.usage": false })["screen.usage"]).toBe(false);
  });

  it("drops an unknown key rather than storing it", () => {
    const merged = mergeFlags({}, { "screen.secretBackdoor": true });
    expect("screen.secretBackdoor" in merged).toBe(false);
  });

  it("ignores a non-boolean value", () => {
    const merged = mergeFlags({ "screen.usage": true }, { "screen.usage": "no" });
    expect(merged["screen.usage"]).toBe(true);
  });

  it("keeps every known flag present after a merge", () => {
    const merged = mergeFlags({}, {});
    for (const flag of FEATURE_FLAGS) expect(typeof merged[flag]).toBe("boolean");
  });
});

describe("assistant off messaging", () => {
  it("tells the patient a human takes over and never promises a time", () => {
    expect(ASSISTANT_OFF_REPLY).toContain("ekibimize");
    expect(ASSISTANT_OFF_REPLY).not.toContain("Uygun saatler");
  });

  it("records the operator's reason for the handoff", () => {
    expect(assistantOffHandoffReason("bakım penceresi")).toContain("bakım penceresi");
    expect(assistantOffHandoffReason(null)).toBe(
      "Asistan yönetici tarafından kapatıldı.",
    );
    expect(assistantOffHandoffReason("   ")).toBe(
      "Asistan yönetici tarafından kapatıldı.",
    );
  });
});

describe("flag catalogue", () => {
  it("labels every flag, so the control screen cannot show a raw key", () => {
    for (const flag of FEATURE_FLAGS) expect(FLAG_LABELS[flag]).toBeTruthy();
  });

  it("recognises only catalogued flags", () => {
    expect(isFeatureFlag("screen.calendar")).toBe(true);
    expect(isFeatureFlag("screen.nope")).toBe(false);
  });
});
