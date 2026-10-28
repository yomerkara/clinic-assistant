import { randomUUID } from "node:crypto";
export type WhatsAppMessageInput = {
  idempotencyKey?: string;
  phone: string;
  text: string;
  conversationId: string;
};

export type WhatsAppPort = {
  sendMessage(input: WhatsAppMessageInput): Promise<{ providerMessageId: string }>;
};

export class MemoryWhatsApp implements WhatsAppPort {
  private readonly receipts = new Map<string, { providerMessageId: string }>();
  readonly sent: WhatsAppMessageInput[] = [];

  async sendMessage(input: WhatsAppMessageInput) {
    const previous = input.idempotencyKey
      ? this.receipts.get(input.idempotencyKey)
      : undefined;
    if (previous) return previous;
    this.sent.push(input);
    const receipt = { providerMessageId: `wa_${randomUUID()}` };
    if (input.idempotencyKey) this.receipts.set(input.idempotencyKey, receipt);
    return receipt;
  }
}
