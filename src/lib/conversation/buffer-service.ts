import { prisma } from "@/lib/prisma";
import { handleInbound } from "@/lib/orchestrator/inbound";
import { createInboundBufferService } from "./inbound-buffer";
export const inboundBuffer = createInboundBufferService({
  prisma,
  handle: handleInbound,
});
