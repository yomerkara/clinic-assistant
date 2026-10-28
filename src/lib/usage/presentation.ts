export const usageNumber = (value: number) =>
  new Intl.NumberFormat("tr-TR").format(value);
export const usageMoney = (value: number) =>
  new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  }).format(value);
export const taskLabels: Record<string, string> = {
  understand: "Anlama",
  answer: "Yanıt taslağı",
  review: "Bağlam denetimi",
  safety: "Güvenlik kontrolü",
  grounding: "Kaynak kontrolü",
  legacy: "Önceki akış",
};
export function usageMonth(raw?: string, now = new Date()) {
  const value =
    raw && /^\d{4}-(?:0[1-9]|1[0-2])$/.test(raw) ? raw : now.toISOString().slice(0, 7);
  const from = new Date(`${value}-01T00:00:00Z`);
  const to = new Date(from);
  to.setUTCMonth(to.getUTCMonth() + 1);
  return {
    value,
    from,
    to,
    label: new Intl.DateTimeFormat("tr-TR", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(from),
  };
}
