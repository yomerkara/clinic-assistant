import { beforeEach, expect, it, vi } from "vitest";
const db=vi.hoisted(()=>({find:vi.fn(),upsert:vi.fn(),update:vi.fn()}));
vi.mock("@/lib/auth/session",()=>({requireUser:async()=>({id:"worker",role:"THERAPIST"}),toActor:()=>({userId:"worker",role:"THERAPIST",therapistProfileId:"therapist"})}));
vi.mock("@/lib/prisma",()=>({prisma:{message:{findFirst:db.find},$transaction:(f:(tx:unknown)=>unknown)=>f({conversationRead:{upsert:db.upsert,updateMany:db.update}})}}));
import { POST } from "./route";
const call=()=>POST(new Request("http://localhost/api/conversations/c/read",{method:"POST",body:new URLSearchParams({messageId:"m"})}),{params:Promise.resolve({id:"c"})});
beforeEach(()=>vi.clearAllMocks());
it("does not mark an inaccessible message",async()=>{db.find.mockResolvedValue(null);expect((await call()).status).toBe(404);expect(db.upsert).not.toHaveBeenCalled();expect(db.find.mock.calls[0][0].where.conversation.patient.OR).toBeDefined();});
it("stores per-user progress and only advances it",async()=>{const date=new Date("2026-10-16T10:00:00Z");db.find.mockResolvedValue({createdAt:date});expect((await call()).status).toBe(200);expect(db.upsert).toHaveBeenCalledWith({where:{userId_conversationId:{userId:"worker",conversationId:"c"}},create:{userId:"worker",conversationId:"c",readThroughAt:date},update:{}});expect(db.update).toHaveBeenCalledWith({where:{userId:"worker",conversationId:"c",readThroughAt:{lt:date}},data:{readThroughAt:date}});});
