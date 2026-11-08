import { beforeEach, describe, expect, it, mock } from "bun:test";
import {
  AvatureAdapter,
  normalizeAvatureSource,
  parseAvatureDescription,
  parseAvatureListings,
} from "@worker/adapters/avature";

const BOARD = "https://careers.example.com/careers/OpenRoles";

function result(id: number, title: string, location: string) {
  return `<article class="article article--result" id="article--${id}">
    <h3 class="article__header__text__title"><a class="link"
      href="https://careers.example.com/careers/JobDetail/Some-Slug/${id}"> ${title} </a></h3>
    <span class="paragraph_inner-span">${location}</span>
    <div><span class="paragraph_inner-span">Engineering</span></div>
  </article>`;
}

function stubPages(pages: string[]) {
  const fetchMock = mock((url: string) => {
    const offset = Number(new URL(url).searchParams.get("jobOffset") ?? 0);
    return Promise.resolve({ ok: true, status: 200, text: async () => pages[offset / 10] ?? "" });
  });
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

describe("AvatureAdapter", () => {
  beforeEach(() => mock.restore());

  it("accepts only a listing page URL", () => {
    expect(normalizeAvatureSource(`${BOARD}/?jobOffset=10`)).toBe(BOARD);
    expect(() => normalizeAvatureSource("twosigma")).toThrow();
    expect(() => normalizeAvatureSource("http://careers.example.com/careers/OpenRoles")).toThrow();
    expect(() => normalizeAvatureSource("https://careers.example.com/")).toThrow();
  });

  it("reads titles, ids, departments and tidies locations", () => {
    const [us, uk] = parseAvatureListings(
      result(1, "AI &amp; Systems Engineer", "United States - NY New York")
        + result(2, "Reliability Engineer", "United Kingdom - London")
    );
    expect(us).toEqual(expect.objectContaining({
      externalId: "1",
      title: "AI & Systems Engineer",
      location: "New York, NY, United States",
      department: "Engineering",
      url: "https://careers.example.com/careers/JobDetail/Some-Slug/1",
    }));
    expect(uk!.location).toBe("London, United Kingdom");
  });

  it("walks pages and stops when a page adds nothing new", async () => {
    const first = result(1, "One", "United States - NY New York");
    const second = result(2, "Two", "United States - NY New York");
    const fetchMock = stubPages([first, second, second]);
    const jobs = await new AvatureAdapter().fetchJobs(BOARD);
    expect(jobs.map((job) => job.externalId)).toEqual(["1", "2"]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("treats a page with no readable results as a fault", async () => {
    stubPages(["<html>new design</html>"]);
    await expect(new AvatureAdapter().fetchJobs(BOARD)).rejects.toThrow("no readable results");
  });

  it("takes the longest section as the description and drops scripts", () => {
    const html = `<section><p>Apply</p></section>
      <section><script>alert(1)</script><p>Job Location: New York. A long description.</p></section>`;
    const description = parseAvatureDescription(html);
    expect(description).toContain("A long description");
    expect(description).not.toContain("alert");
  });
});
