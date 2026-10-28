export type TimedBlock = { id: string; start: number; end: number };
/** Allocate lanes per connected overlap cluster, including transitive overlaps. */
export function layoutBlocks<T extends TimedBlock>(blocks: T[]) {
  const sorted = [...blocks].sort(
    (a, b) => a.start - b.start || b.end - a.end || a.id.localeCompare(b.id),
  );
  const result: Array<T & { lane: number; lanes: number }> = [];
  let group: Array<T & { lane: number; lanes: number }> = [],
    ends: number[] = [],
    groupEnd = -Infinity;
  const flush = () => {
    for (const item of group) result.push({ ...item, lanes: ends.length });
    group = [];
    ends = [];
    groupEnd = -Infinity;
  };
  for (const b of sorted) {
    if (b.start >= groupEnd) flush();
    let lane = ends.findIndex((end) => end <= b.start);
    if (lane < 0) lane = ends.length;
    ends[lane] = b.end;
    groupEnd = Math.max(groupEnd, b.end);
    group.push({ ...b, lane, lanes: 0 });
  }
  flush();
  return result;
}
