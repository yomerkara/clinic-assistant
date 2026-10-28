import { expect, it } from "vitest";
import { requestedServices } from "./service-requests";
it.each([
  ["Yer açılırsa haber verin", ["WAITLIST"]],
  ["Her salı 16:00 olsun, ödeme linki gönderin", ["RECURRING", "PAYMENT"]],
  ["Katıldım, faturamı gönderin", ["ATTENDANCE"]],
  ["Telefonum değişti, düzeltir misiniz?", ["PROFILE_UPDATE"]],
  ["Verilerimi silin", ["DATA_REQUEST"]],
  ["Online seans istiyorum", ["ONLINE"]],
  ["İade istemiyorum", []],
  ["Online seans var mı?", []],
])("captures staff work without inventing completion: %s", (text, expected) => {
  expect(requestedServices(text as string)).toEqual(expected);
});
it.each([
  ["Online istemiyorum ama ödeme linki istiyorum.", ["PAYMENT"]],
  ["İade istemiyorum; sigortam geçiyor mu?", ["INSURANCE"]],
  ["Ödeme linki istemiyorum, online seans istiyorum.", ["ONLINE"]],
  ["Online seans istemiyorum. Ödeme linki de istemiyorum.", []],
])("scopes negation to its own request: %s", (text, expected) => {
  expect(requestedServices(text as string)).toEqual(expected);
});
