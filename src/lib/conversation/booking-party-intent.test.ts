import { expect, it } from "vitest";
import { bookingPartyKind, partyTherapist } from "./booking-party-intent";
it.each([
 ["İki ayrı seans değil, tek bir çift seansı istiyoruz.","COUPLE"],
 ["Çift terapisi değil, iki ayrı bireysel seans istiyoruz.","INDIVIDUAL"],
 ["Ayrı ayrı istemiyoruz, birlikte gelelim.","COUPLE"],
 ["Birlikte değil ayrı ayrı.","INDIVIDUAL"],
 ["İki ayrı bireysel seans", "INDIVIDUAL"],
 ["Birlikte çift terapisine katılacağız.","COUPLE"],
 ["Çift seansı istemiyoruz",null],
 ["İki ayrı seans istemiyoruz",null],
 ["Çift seansı veya iki ayrı bireysel seans",null],
 ["Bilmiyorum",null],
])("classifies the affirmative choice: %s", (text,kind)=>expect(bookingPartyKind(text!)).toBe(kind));
const roster=[{displayName:"Yönetici Ömer (test)"},{displayName:"Klinik Psikolog Merve Nur Akıl"}];
it.each(["Eşimle Yönetici Ömer ile 17 Kasım 15-17 arası randevu almak istiyoruz","Ömer Bey ile ikimize iki ayrı seans","Eşimle Ömer ile randevu"])("retains party therapist: %s", text=>expect(partyTherapist(text,roster)).toBe(roster[0]));
it("does not choose an ambiguous or negated therapist",()=>{
 expect(partyTherapist("Ömer veya Merve",roster)).toBeUndefined();
 expect(partyTherapist("Ömer Bey değil Merve Hanım",roster)).toBe(roster[1]);
 expect(partyTherapist("Ömer Bey değil",roster)).toBeUndefined();
});
