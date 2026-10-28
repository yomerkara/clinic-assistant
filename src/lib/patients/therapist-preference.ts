const normalize = (value: string): string[] =>
  value
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
    .match(/[a-z]+/g) ?? [];

/** Accept only a unique, active roster match; never silently pick the first therapist. */
export function resolveTherapist<T extends { displayName: string }>(
  name: string | null | undefined,
  roster: T[],
): T | null {
  if (!name?.trim()) return null;
  const tokens = normalize(name).filter(
    (token) =>
      !["hanim", "bey", "psikolog", "klinik", "aile", "danismani"].includes(token),
  );
  if (!tokens.length) return null;
  const matches = roster.filter((item) =>
    tokens.every((token) => normalize(item.displayName).includes(token)),
  );
  return matches.length === 1 ? matches[0] : null;
}
