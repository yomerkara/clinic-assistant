import { NextResponse } from "next/server";
import { z } from "zod";
import { canUseSimulator } from "@/lib/auth/rbac";
import { requireUser } from "@/lib/auth/session";
import { ModelCallError } from "@/lib/llm/types";
import { simulationConditionsSchema } from "@/lib/simulator/conditions";
import {
  addSimulationTurn,
  loadSimulationThread,
  resetSimulation,
  saveConditions,
  SIMULATOR_MESSAGE_LIMIT,
} from "@/lib/simulator/service";

export async function GET() {
  const user = await requireUser();
  if (!canUseSimulator(user.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  return NextResponse.json(await loadSimulationThread(user.id));
}

export async function POST(request: Request) {
  const user = await requireUser();
  if (!canUseSimulator(user.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  // A malformed body is a client error, not a server fault.
  let body: { intent?: string; text?: string; conditions?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body))
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  try {
    if (body.intent === "reset") {
      return NextResponse.json(await resetSimulation(user.id));
    }
    if (body.intent === "conditions") {
      const parsed = simulationConditionsSchema.partial().parse(body.conditions ?? {});
      return NextResponse.json(await saveConditions(user.id, parsed));
    }
    const text = String(body.text ?? "").trim();
    if (!text) {
      return NextResponse.json({ error: "empty" }, { status: 400 });
    }
    // Same ceiling as the demo studio, so one message cannot grow the stored
    // thread or the model request without bound.
    if (text.length > SIMULATOR_MESSAGE_LIMIT)
      return NextResponse.json(
        {
          error: "too_long",
          message: `Mesaj en fazla ${SIMULATOR_MESSAGE_LIMIT} karakter olabilir.`,
        },
        { status: 400 },
      );
    return NextResponse.json(await addSimulationTurn(user.id, text));
  } catch (error) {
    if (error instanceof ModelCallError) {
      return NextResponse.json({ error: "model", message: error.message, detail: error.detail }, { status: 502 });
    }
    // An unusable scenario or condition value is rejected, not retried blindly.
    if (error instanceof z.ZodError)
      return NextResponse.json(
        { error: "invalid_conditions", issues: error.issues.map((i) => i.path.join(".")) },
        { status: 400 },
      );
    throw error;
  }
}
