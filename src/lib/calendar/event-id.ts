import { createHash } from "node:crypto";
export const calendarRequestEventId = (requestId: string) => createHash("sha256").update(`santa:${requestId}`).digest("hex");
