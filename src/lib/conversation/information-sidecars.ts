import { requestedServices } from "./service-requests";
import type { KnowledgeSnippet } from "@/lib/llm/types";
import { approvedPolicy, policyAnswers } from "./approved-policies";
import { clinicInformation } from "./clinic-information";
import { generalDefinition } from "./general-definitions";

export function informationSidecars(
  text: string,
  reply: string,
  knowledge: KnowledgeSnippet[],
) {
  const answers: string[] = [];
  if (/ücret|ucret|fiyat/iu.test(text) && !requestedServices(text).includes("REFUND")) {
    const price = approvedPolicy(knowledge, "price");
    if (price) answers.push(price.content);
  }
  if (/adres|konum|harita/iu.test(text)) {
    const address = clinicInformation(text, knowledge);
    if (address) answers.push(address.answer);
  }
  const definition = generalDefinition(text);
  if (definition) answers.push(definition);
  answers.push(...policyAnswers(text, knowledge).map((item) => item.answer));
  return [...new Set(answers)].filter((answer) => !reply.includes(answer)).join("\n\n");
}
