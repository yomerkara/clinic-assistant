import type { KnowledgeSnippet } from "@/lib/llm/types";

const endpoint = "https://www.santapsikoloji.com/wp-json/wp/v2/cpt_team?per_page=100";

type TeamRecord = {
  slug: string;
  link: string;
  title: { rendered: string };
};

const details = {
  "hazal-gul-akkus": {
    role: "Psikolog & Aile Danışmanı",
    specialties: [
      "Bilişsel Davranış Terapisi",
      "Aile Danışmanlığı",
      "Deneyimsel Oyun Terapisi",
      "EMDR",
    ],
  },
  "merve-nur-akil": {
    role: "Klinik Psikolog",
    specialties: [
      "Bilişsel Davranışçı Terapi",
      "Deneyimsel Oyun Terapisi",
      "EMDR",
      "Çocuk ve Ergen",
    ],
  },
} as const;

export type OfficialTherapist = {
  id: string;
  name: string;
  displayName: string;
  specialties: string[];
  profileUrl: string;
};

function clean(value: string) {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/<[^>]+>/g, "")
    .trim();
}

const fallbackNames = {
  "hazal-gul-akkus": "Hazal Gül Akkuş",
  "merve-nur-akil": "Merve Nur Akıl",
} as const;

function fallbackTeam(): OfficialTherapist[] {
  return Object.entries(details).map(([slug, detail]) => {
    const name = fallbackNames[slug as keyof typeof fallbackNames];
    return {
      id: slug,
      name,
      displayName: `${detail.role} ${name}`,
      specialties: [...detail.specialties],
      profileUrl: `https://www.santapsikoloji.com/team/${slug}/`,
    };
  });
}

export async function getOfficialTherapists(): Promise<OfficialTherapist[]> {
  try {
    const response = await fetch(endpoint, {
      next: { revalidate: 60 * 60 },
      signal: AbortSignal.timeout(2000),
    });
    if (!response.ok) return fallbackTeam();
    const records = (await response.json()) as TeamRecord[];
    const team = records.flatMap((record) => {
      if (!(record.slug in details)) return [];
      const detail = details[record.slug as keyof typeof details];
      const name = clean(record.title.rendered);
      return [
        {
          id: record.slug,
          name,
          displayName: `${detail.role} ${name}`,
          specialties: [...detail.specialties],
          profileUrl: record.link,
        },
      ];
    });
    return team.length === Object.keys(details).length ? team : fallbackTeam();
  } catch {
    return fallbackTeam();
  }
}

export async function officialTherapistKnowledge(): Promise<KnowledgeSnippet> {
  const team = await getOfficialTherapists();
  return {
    id: "official_santa_therapists",
    title: "Santa Psikoloji psikologları",
    content: team
      .map(
        (item) =>
          `${item.displayName} — ${item.specialties.join(", ")}. Profil: ${item.profileUrl}`,
      )
      .join("\n"),
    source: "https://www.santapsikoloji.com/psikologlarimiz/",
    version: 1,
  };
}
