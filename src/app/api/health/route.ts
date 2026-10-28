import { NextResponse } from "next/server";
import { checkHealth } from "@/lib/health";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const result = await checkHealth(() => prisma.$queryRaw`SELECT 1`);
  return NextResponse.json(result, { status: result.ok ? 200 : 503 });
}
