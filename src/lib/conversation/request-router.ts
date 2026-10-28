import { generalDefinition } from "./general-definitions";
import type { LlmTurn, KnowledgeSnippet, RoutedRequest } from "@/lib/llm/types";
import type { SimulationDiagnosis, SimulatedAction } from "@/lib/simulator/rules";

export const REQUEST_ROUTER_VERSION = "requests-v2";
export type RouteTrace = {
  kind: RoutedRequest["kind"];
  handler: "code" | "approved_source" | "ai";
  sourceId?: string;
};
const information = (kind: string) =>
  ["THERAPIST_INFO", "CLINIC_INFO", "THERAPY_INFO"].includes(kind);
const allowed = new Set([
  "NEW_BOOKING",
  "PRICE_REQUEST",
  "INVOICE_REQUEST",
  "THERAPIST_INFO",
  "CLINIC_INFO",
  "THERAPY_INFO",
]);

// The model proposes requests; only registered handlers can execute them.
// Existing critical/ambiguous intents retain exclusive control of the turn.
export function routeRequests(
  turn: LlmTurn,
  knowledge: KnowledgeSnippet[],
  resolve: (turn: LlmTurn) => SimulationDiagnosis,
  inbound = "",
): SimulationDiagnosis | undefined {
  if (!turn.requests?.length || turn.confidence < 0.7 || !allowed.has(turn.intent))
    return;
  const requests = [...new Map(turn.requests.map((r) => [r.kind, r])).values()];
  // A model must not silently omit its own primary operation.
  if (!requests.some((r) => r.kind === turn.intent))
    requests.push({ kind: turn.intent as RoutedRequest["kind"] });
  const rank = (kind: string) => (information(kind) ? 0 : kind === "NEW_BOOKING" ? 2 : 1);
  requests.sort((a, b) => rank(a.kind) - rank(b.kind));
  const trace: RouteTrace[] = [];
  const parts: SimulationDiagnosis[] = [];
  for (const request of requests) {
    let answer = request.answer?.trim();
    let sourceId = request.knowledgeDocId;
    let handler: RouteTrace["handler"] = information(request.kind) ? "ai" : "code";
    // The therapist directory is rendered from approved application data.
    // Arbitrary source IDs never select a code-owned answer.
    if (request.kind === "THERAPIST_INFO") {
      const doc = knowledge.find((d) =>
        ["official_santa_therapists", "kd_therapists"].includes(d.id),
      );
      if (doc && !turn.entities.therapistName) {
        answer = doc.content;
        sourceId = doc.id;
        handler = "approved_source";
      }
    }
    const definition =
      request.kind === "THERAPY_INFO" ? generalDefinition(inbound) : undefined;
    if (definition) {
      answer = definition;
      sourceId = null;
      handler = "code";
    }
    trace.push({ kind: request.kind, handler, ...(sourceId ? { sourceId } : {}) });
    const part = resolve({
      ...turn,
      requests: undefined,
      // Exclusive human/crisis intents were handled above. A global price-related
      // handoff flag cannot stop a sibling booking; each code handler decides.
      needsHandoff: false,
      handoffReason: null,
      intent: request.kind,
      reply:
        answer ||
        (information(request.kind) ? turn.questionAnswer || turn.reply : turn.reply),
      questionAnswer:
        request.kind === "NEW_BOOKING" && parts.length
          ? parts.map((p) => p.outbound).join("\n\n") || null
          : null,
      knowledgeDocId: sourceId ?? null,
    });
    parts.push(part);
    // Missing evidence, an explicit handoff, or another blocking rule cannot
    // be bypassed by a successful sibling request.
    if (part.botStopped)
      return { ...part, action: null, additionalActions: [], routing: trace, raw: turn };
  }
  const booking = parts.find((p) => p.intent === "NEW_BOOKING");
  const operations = parts.filter((p) => p.action);
  const primary = booking ?? operations[0] ?? parts[0]!;
  const actions = operations
    .map((p) => p.action!)
    .filter((a, i, all) => all.findIndex((b) => b.type === a.type) === i);
  const mainAction: SimulatedAction = primary.action ?? actions[0] ?? null;
  const hasOperationalRequest = requests.some((r) =>
    ["PRICE_REQUEST", "INVOICE_REQUEST"].includes(r.kind),
  );
  const visible =
    booking && !hasOperationalRequest
      ? [booking]
      : parts.filter((p) => p.intent !== "NEW_BOOKING");
  // Only one follow-up question: intake continues after information/fees.
  return {
    ...primary,
    intent: mainAction?.type ?? primary.intent,
    intentLabel:
      parts.find((p) => p.intent === mainAction?.type)?.intentLabel ??
      primary.intentLabel,
    outbound: [...new Set(visible.map((p) => p.outbound.trim()))].join("\n\n"),
    action: mainAction,
    additionalActions: actions.filter((a) => a !== mainAction),
    knowledge: parts.find((p) => p.knowledge)?.knowledge ?? null,
    routing: trace,
    raw: turn,
    rules: [REQUEST_ROUTER_VERSION, ...parts.flatMap((p) => p.rules)],
  };
}
