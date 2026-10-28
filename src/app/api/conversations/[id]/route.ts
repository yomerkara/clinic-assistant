import { handleConversation } from "@/app/api/queue/[id]/route";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  return handleConversation(request, id);
}
