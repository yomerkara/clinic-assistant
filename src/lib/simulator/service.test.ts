import { describe, expect, it } from "vitest";
import {
  keepRecentTurns,
  SIMULATOR_MESSAGE_LIMIT,
  SIMULATOR_TURN_LIMIT,
} from "./service";

describe("simulator storage limits", () => {
  it("bounds a single message and the stored thread", () => {
    // Audit item F08: neither the message nor the thread may grow without limit.
    expect(SIMULATOR_MESSAGE_LIMIT).toBe(4000);
    expect(SIMULATOR_TURN_LIMIT).toBeGreaterThan(0);
    expect(SIMULATOR_TURN_LIMIT).toBeLessThanOrEqual(100);
  });

  it("keeps a short thread untouched", () => {
    const turns = [1, 2, 3];
    expect(keepRecentTurns(turns, 10)).toBe(turns);
  });

  it("drops the oldest turns once the limit is passed", () => {
    expect(keepRecentTurns([1, 2, 3, 4, 5], 3)).toEqual([3, 4, 5]);
  });

  it("keeps the newest turn, which the next reply depends on", () => {
    const turns = Array.from({ length: SIMULATOR_TURN_LIMIT + 5 }, (_, i) => i);
    const kept = keepRecentTurns(turns);
    expect(kept).toHaveLength(SIMULATOR_TURN_LIMIT);
    expect(kept.at(-1)).toBe(turns.at(-1));
  });
});
