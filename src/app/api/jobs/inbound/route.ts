import { createCancellationDelivery } from "@/lib/queue/cancellation-delivery";
import { prisma } from "@/lib/prisma";
import { calendarPort, whatsappPort } from "@/lib/queue/ports";
import { authorizeJob } from "@/lib/security/job-auth";
import { NextResponse } from "next/server";
import { inboundBuffer } from "@/lib/conversation/buffer-service";
export async function POST(request: Request) {
  if (!authorizeJob(request))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const cancellations = await createCancellationDelivery({
    prisma,
    calendar: calendarPort,
    whatsapp: whatsappPort,
  }).drain();
  const results = await inboundBuffer.drain();
  return NextResponse.json({ ok: true, results, cancellations });
}
