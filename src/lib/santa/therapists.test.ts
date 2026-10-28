import { afterEach, expect, it, vi } from "vitest";
import { getOfficialTherapists } from "./therapists";

afterEach(() => vi.unstubAllGlobals());

it("bounds a stalled official-site request and returns the fallback roster", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      (_url, options: RequestInit) =>
        new Promise((_resolve, reject) => {
          options.signal!.addEventListener(
            "abort",
            () => reject(options.signal!.reason),
            { once: true },
          );
        }),
    ),
  );
  const start = Date.now();
  const team = await getOfficialTherapists();
  expect(Date.now() - start).toBeLessThan(3500);
  expect(team.map((t) => t.id)).toEqual(["hazal-gul-akkus", "merve-nur-akil"]);
});

it("uses a valid successful response", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        {
          slug: "hazal-gul-akkus",
          link: "https://example.test/hazal",
          title: { rendered: "Hazal Gül Akkuş" },
        },
        {
          slug: "merve-nur-akil",
          link: "https://example.test/merve",
          title: { rendered: "Merve Nur Akıl" },
        },
      ],
    }),
  );
  expect((await getOfficialTherapists())[0].profileUrl).toBe(
    "https://example.test/hazal",
  );
});
