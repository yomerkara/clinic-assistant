export type DelayNotice = {
  minutes: number | null;
  note: string;
};

export function parseDelayNotice(input: string): DelayNotice | null {
  const text = input.trim().toLocaleLowerCase("tr-TR");
  // Only bypass the model for a complete, unambiguous arrival notice.
  // Mixed messages (cancellation, questions, crisis, another person) must
  // retain their full meaning in the normal routing path.
  if (
    !/^(?:(?:merhaba|selam|selamlar)[,.!]?\s+)?(?:randevuma\s+)?(?:(?:yaklaşık|biraz|bugün|trafikten dolayı|trafik nedeniyle)\s+)*(?:(?:\d{1,3})\s*(?:dk|dakika)\s+)?(?:gecikeceğim|gecikebilirim|geç kalacağım|geç kalabilirim|geç kalıyorum)(?:\s+\d{1,3}\s*(?:dk|dakika))?[.!\s]*$/u.test(
      text,
    )
  )
    return null;

  const before = text.match(/\b(\d{1,3})\s*(?:dk|dakika)\b[^.?!]*(?:gecik|geç\s+kal)/u);
  const after = text.match(/(?:gecik|geç\s+kal)[^.?!]*?\b(\d{1,3})\s*(?:dk|dakika)\b/u);
  const parsed = Number(before?.[1] ?? after?.[1]);
  const minutes = Number.isInteger(parsed) && parsed > 0 && parsed <= 180 ? parsed : null;

  return {
    minutes,
    note: minutes
      ? `Hasta yaklaşık ${minutes} dakika gecikeceğini bildirdi.`
      : "Hasta randevuya gecikeceğini bildirdi.",
  };
}
