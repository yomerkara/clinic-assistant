/**
 * Some compatible gateways return a single fenced JSON object followed by
 * explanatory prose despite json_object mode. Read only the explicit object;
 * never deliver the prose or accept multiple/competing structured verdicts.
 * Callers must still validate the result against their strict schema.
 */
export function parseJsonResponse(content: string): unknown {
  const trimmed = content.trim();
  if (!trimmed.startsWith("```")) return JSON.parse(trimmed);
  const fenced = trimmed.match(/^```(?:json)?\s*\n([\s\S]*?)\n```([^]*)$/i);
  if (!fenced || /```|[{}\[\]]/.test(fenced[2])) {
    throw new Error("Ambiguous structured model response");
  }
  return JSON.parse(fenced[1]);
}
