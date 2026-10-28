import { formatPatientName } from "./profile";
import { normalizePatientName } from "@/lib/patients/identity";

const MALE = new Set([
  "adem",
  "ahmet",
  "ali",
  "alp",
  "arda",
  "baris",
  "berk",
  "burak",
  "can",
  "cem",
  "emir",
  "emre",
  "enes",
  "eren",
  "erkan",
  "fatih",
  "furkan",
  "gokhan",
  "hakan",
  "halil",
  "hasan",
  "huseyin",
  "ibrahim",
  "ismail",
  "kaan",
  "kemal",
  "kenan",
  "levent",
  "mehmet",
  "mert",
  "murat",
  "mustafa",
  "oguz",
  "omer",
  "onur",
  "orhan",
  "osman",
  "serkan",
  "sinan",
  "taha",
  "tolga",
  "ugur",
  "umut",
  "volkan",
  "yavuz",
  "yunus",
  "yusuf",
  "zafer",
]);

const FEMALE = new Set([
  "asli",
  "ayse",
  "busra",
  "dilara",
  "ebru",
  "elif",
  "elifnur",
  "emine",
  "esra",
  "fatma",
  "funda",
  "gamze",
  "gizem",
  "gul",
  "hande",
  "hatice",
  "hazal",
  "hilal",
  "hulya",
  "ipek",
  "irem",
  "kubra",
  "leyla",
  "melis",
  "merve",
  "mine",
  "nazli",
  "nur",
  "ozge",
  "ozlem",
  "pelin",
  "pinar",
  "rabia",
  "seda",
  "selin",
  "sevgi",
  "tuba",
  "yasemin",
  "yeliz",
  "zehra",
  "zeynep",
]);

const UNISEX = new Set([
  "deniz",
  "derya",
  "duru",
  "ege",
  "ferhan",
  "ilkay",
  "mutlu",
  "nehir",
  "ozgur",
  "toprak",
  "yagmur",
  "yucel",
]);

export function honorificForName(name: string): "Hanım" | "Bey" | null {
  const key = normalizePatientName(name).split(" ")[0] ?? "";
  if (!key || UNISEX.has(key)) return null;
  if (MALE.has(key)) return "Bey";
  if (FEMALE.has(key)) return "Hanım";
  return null;
}

export function addressedName(displayName: string) {
  const first = formatPatientName(displayName).split(/\s+/)[0];
  if (!first || first.length < 2) return null;
  if (normalizePatientName(first) === "yeni") return null;
  const title = honorificForName(first);
  return title ? `${first} ${title}` : null;
}

export function applyHonorific(reply: string, displayName: string) {
  const first = formatPatientName(displayName).split(/\s+/)[0];
  if (!first || first.length < 2 || normalizePatientName(first) === "yeni") return reply;
  const escaped = first.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const title = honorificForName(first);
  const rest = formatPatientName(displayName).split(/\s+/).slice(1);
  if (rest.length) {
    const surname = rest
      .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("\\s+");
    reply = reply.replace(
      new RegExp(
        `^(Merhaba|Selamlar|Selam)\\s+${escaped}(?:\\s+(?:Hanım|Bey))?\\s+${surname}(?:\\s+(?:Hanım|Bey))?(?![\\p{L}\\p{N}_])`,
        "iu",
      ),
      title ? `$1 ${first} ${title}` : "$1",
    );
  }
  const nameToken = `(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])`;
  if (title) {
    return reply
      .replace(
        new RegExp(`${nameToken}(?:\\s+(Hanım|Bey))?(?![\\p{L}\\p{N}_])`, "giu"),
        `${first} ${title}`,
      )
      .replace(new RegExp(`${first} ${title} ${title}`, "g"), `${first} ${title}`);
  }
  return reply
    .replace(new RegExp(`${nameToken}\\s+(Hanım|Bey)(?![\\p{L}\\p{N}_])`, "giu"), first)
    .replace(
      new RegExp(`(Merhaba|Selamlar|Selam)\\s+${escaped}(?!\\s+(Hanım|Bey))`, "giu"),
      "$1",
    )
    .replace(/Merhaba\s+,/g, "Merhaba,")
    .replace(/\s+([,.!?])/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export function ensureHonorificGreeting(reply: string, displayName: string) {
  const address = addressedName(displayName);
  const first = formatPatientName(displayName).split(/\s+/)[0];
  if (!address || !first || first.length < 2) return applyHonorific(reply, displayName);
  if (!/^(Merhaba|Selamlar|Selam)\b/i.test(reply.trim()))
    return applyHonorific(reply, displayName);
  const foldedReply = reply.toLocaleLowerCase("tr-TR");
  const foldedFirst = first.toLocaleLowerCase("tr-TR");
  if (foldedReply.includes(foldedFirst)) return applyHonorific(reply, displayName);
  return applyHonorific(
    reply.replace(/^(Merhaba|Selamlar|Selam),?/i, `$1 ${address},`),
    displayName,
  );
}
