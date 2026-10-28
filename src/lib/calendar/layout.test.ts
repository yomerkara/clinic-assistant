import { expect, it } from "vitest";
import { layoutBlocks } from "./layout";
it("uses separate lanes for transitive overlaps and reuses width after a gap", () => {
  const rows = layoutBlocks([
    { id: "a", start: 0, end: 60 },
    { id: "b", start: 30, end: 90 },
    { id: "c", start: 60, end: 120 },
    { id: "d", start: 130, end: 150 },
  ]);
  expect(rows.map((r) => [r.id, r.lane, r.lanes])).toEqual([
    ["a", 0, 2],
    ["b", 1, 2],
    ["c", 0, 2],
    ["d", 0, 1],
  ]);
});
