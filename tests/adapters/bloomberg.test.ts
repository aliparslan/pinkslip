import { beforeEach, describe, expect, it, mock } from "bun:test";
import {
  BloombergAdapter,
  bloombergRetryDelayMs,
  normalizeBloombergSource,
  readBoundedBloombergHtml,
} from "@worker/adapters/bloomberg";

function listing(id: string, title = `Software Engineer ${id}`) {
  return `
    <article class="article article--result">
      <h3><a class="link" href="https://bloomberg.avature.net/careers/JobDetail/software-engineer/${id}">
        ${title}
      </a></h3>
      <span class="list-item-location">New York, New York, United States of America</span>
      <a href="https://bloomberg.avature.net/careers/SaveJob?jobId=${id}">Save</a>
    </article>`;
}

function searchPage(
  total: number,
  ids: string[],
  titles: Record<string, string> = {}
) {
  return new Response(`
    <!doctype html>
    <div class="list-controls__text__legend" aria-label="${total} results">
      1-${ids.length} of ${total} results
    </div>
    <main>${ids.map((id) => listing(id, titles[id])).join("\n")}</main>`, {
    headers: { "content-type": "text/html; charset=UTF-8" },
  });
}

function detailPage(id: string) {
  return new Response(`
    <!doctype html>
    <link rel="canonical" href="https://bloomberg.avature.net/careers/JobDetail/software-engineer/${id}">
    <article class="article article--details">
      <div class="article__content__view__field__value">Software Engineer</div>
    </article>
    <article class="article article--details">
      <h2>Description &amp; Requirements</h2>
      <div class="article__content">
        <div class="article__content__view__field__value">
          <div><p>Build reliable market-data services in R&amp;D.</p></div>
        </div>
        <div class="article__content__view__field__value">
          <div>Salary Range = 140,000&nbsp;-&nbsp;295,000 USD Annual + Benefits</div>
        </div>
      </div>
    </article>`, {
    headers: { "content-type": "text/html" },
  });
}

function cancellableResponse(
  status: number,
  onCancel: () => void,
  retryAfter = "0"
) {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("temporary upstream error"));
    },
    cancel() {
      onCancel();
    },
  });
  return new Response(body, {
    status,
    headers: {
      "content-type": "text/plain",
      "retry-after": retryAfter,
    },
  });
}

describe("BloombergAdapter", () => {
  beforeEach(() => mock.restore());

  it("normalizes only Bloomberg's official careers source", () => {
    expect(normalizeBloombergSource("bloomberg")).toBe("bloomberg");
    expect(normalizeBloombergSource(" BLOOMBERG ")).toBe("bloomberg");
    expect(normalizeBloombergSource(
      "https://bloomberg.avature.net/careers/SearchJobs/?jobOffset=12"
    )).toBe("bloomberg");
    expect(normalizeBloombergSource(
      "https://bloomberg.avature.net/careers/JobDetail/software-engineer/21651"
    )).toBe("bloomberg");

    expect(() => normalizeBloombergSource("https://other.avature.net/careers"))
      .toThrow("bloomberg.avature.net/careers");
    expect(() => normalizeBloombergSource("http://bloomberg.avature.net/careers"))
      .toThrow("HTTPS");
    expect(() => normalizeBloombergSource("https://bloomberg.avature.net/events"))
      .toThrow("/careers");
  });

  it("caps Retry-After and applies bounded fallback backoff", () => {
    expect(bloombergRetryDelayMs("999", 1)).toBe(5_000);
    expect(bloombergRetryDelayMs(
      new Date("2026-08-28T12:01:00Z").toUTCString(),
      1,
      Date.parse("2026-08-28T12:00:00Z")
    )).toBe(5_000);
    expect(bloombergRetryDelayMs("invalid", 2)).toBe(500);
  });

  it("times out and cancels a stalled response body", async () => {
    let canceled = false;
    const response = new Response(new ReadableStream<Uint8Array>({
      cancel() {
        canceled = true;
      },
    }), { headers: { "content-type": "text/html" } });

    await expect(readBoundedBloombergHtml(response, "stalled test body", 10))
      .rejects.toThrow("body timed out after 10ms");
    expect(canceled).toBe(true);
  });

  it("cancels and retries a transient list response", async () => {
    let canceled = 0;
    const fetchMock = mock()
      .mockResolvedValueOnce(cancellableResponse(503, () => { canceled += 1; }))
      .mockResolvedValueOnce(searchPage(0, []));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(new BloombergAdapter().fetchJobs("bloomberg")).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(canceled).toBe(1);
  });

  it("paginates a complete snapshot and decodes list metadata", async () => {
    const firstIds = Array.from({ length: 12 }, (_, index) => String(100 + index));
    const fetchMock = mock(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = new URL(String(input));
      const offset = Number(url.searchParams.get("jobOffset"));
      if (offset === 0) {
        const response = searchPage(14, firstIds);
        const html = await response.text();
        return new Response(
          html.replace("Software Engineer 100", "Software Engineer R&amp;D"),
          { headers: { "content-type": "text/html" } }
        );
      }
      return searchPage(14, ["112", "113"]);
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const jobs = await new BloombergAdapter().fetchJobs(
      "https://bloomberg.avature.net/careers/SearchJobs"
    );

    expect(jobs).toHaveLength(14);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(new URL(String(fetchMock.mock.calls[0][0])).searchParams.get("jobRecordsPerPage"))
      .toBe("12");
    expect(new URL(String(fetchMock.mock.calls[1][0])).searchParams.get("jobOffset"))
      .toBe("12");
    expect(fetchMock.mock.calls[0][1]?.method).toBe("POST");
    expect(String(fetchMock.mock.calls[0][1]?.body))
      .toBe("jobSort=schemaField_3_270_3&jobSortDirection=ASC");
    expect(jobs[0]).toEqual({
      externalId: "100",
      title: "Software Engineer R&D",
      url: "https://bloomberg.avature.net/careers/JobDetail/software-engineer/100",
      location: "New York, New York, United States of America",
      department: null,
      postedAt: null,
      description: null,
      salary: null,
    });
  });

  it("retries result-count drift, then fails closed", async () => {
    const firstIds = Array.from({ length: 12 }, (_, index) => String(200 + index));
    const fetchMock = mock(async (input: RequestInfo | URL) => {
      const offset = Number(new URL(String(input)).searchParams.get("jobOffset"));
      return offset === 0
        ? searchPage(13, firstIds)
        : searchPage(14, ["212", "213"]);
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(new BloombergAdapter().fetchJobs("bloomberg"))
      .rejects.toThrow("snapshot did not stabilize after 3 attempts");
    await expect(new BloombergAdapter().fetchJobs("bloomberg"))
      .rejects.toThrow("result count changed during pagination (13 to 14)");
    expect(fetchMock).toHaveBeenCalledTimes(12);
  });

  it("repairs only an equal-title page boundary when the base sweep shifts", async () => {
    const firstIds = Array.from({ length: 12 }, (_, index) => String(500 + index));
    const fetchMock = mock(async (input: RequestInfo | URL) => {
      const offset = Number(new URL(String(input)).searchParams.get("jobOffset"));
      if (offset === 0) {
        return searchPage(13, firstIds, { "511": "Shared Product Role" });
      }
      if (offset === 12) {
        return searchPage(13, ["511"], { "511": "Shared Product Role" });
      }
      return searchPage(
        13,
        ["506", "507", "508", "509", "510", "511", "512"],
        { "511": "Shared Product Role", "512": "Shared Product Role" }
      );
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const jobs = await new BloombergAdapter().fetchJobs("bloomberg");

    expect(jobs).toHaveLength(13);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(new URL(String(fetchMock.mock.calls[2][0])).searchParams.get("jobOffset"))
      .toBe("6");
  });

  it("rejects duplicate public IDs and incomplete pages", async () => {
    const duplicateIds = [
      ...Array.from({ length: 11 }, (_, index) => String(300 + index)),
      "300",
    ];
    globalThis.fetch = mock(() => Promise.resolve(searchPage(12, duplicateIds))) as unknown as typeof fetch;
    await expect(new BloombergAdapter().fetchJobs("bloomberg"))
      .rejects.toThrow("duplicate public ID 300 within offset 0");

    mock.restore();
    globalThis.fetch = mock(() => Promise.resolve(searchPage(2, ["one"]))) as unknown as typeof fetch;
    await expect(new BloombergAdapter().fetchJobs("bloomberg"))
      .rejects.toThrow("returned 1 of 2 expected jobs");
  });

  it("enforces a bounded snapshot size", async () => {
    const ids = Array.from({ length: 12 }, (_, index) => String(400 + index));
    globalThis.fetch = mock(() => Promise.resolve(searchPage(1_201, ids))) as unknown as typeof fetch;

    await expect(new BloombergAdapter().fetchJobs("bloomberg"))
      .rejects.toThrow("exceeded the 1200-job safety cap");
  });

  it("parses nested rich-text details and Bloomberg salary ranges", async () => {
    const fetchMock = mock((_input: RequestInfo | URL) =>
      Promise.resolve(detailPage("21651"))
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const content = await new BloombergAdapter().fetchJobContent(
      "bloomberg",
      "21651",
      "https://bloomberg.avature.net/careers/JobDetail/software-engineer/21651"
    );

    expect(content.description).toContain("Build reliable market-data services");
    expect(content.description).toContain("Salary Range");
    expect(content.salary).toBe("140,000 - 295,000 USD Annual");
  });

  it("cancels and retries transient detail statuses", async () => {
    let canceled = 0;
    for (const status of [408, 425, 429, 500]) {
      const fetchMock = mock()
        .mockResolvedValueOnce(cancellableResponse(status, () => { canceled += 1; }))
        .mockResolvedValueOnce(detailPage("21651"));
      globalThis.fetch = fetchMock as unknown as typeof fetch;

      const content = await new BloombergAdapter().fetchJobContent(
        "bloomberg",
        "21651"
      );
      expect(content.description).toContain("Build reliable market-data services");
      expect(fetchMock).toHaveBeenCalledTimes(2);
      mock.restore();
    }
    expect(canceled).toBe(4);
  });

  it("returns null only for gone details and throws other terminal statuses", async () => {
    let canceled = 0;
    globalThis.fetch = mock(() => Promise.resolve(
      cancellableResponse(404, () => { canceled += 1; })
    )) as unknown as typeof fetch;
    await expect(new BloombergAdapter().fetchJobContent("bloomberg", "21651"))
      .resolves.toEqual({ description: null, salary: null });

    mock.restore();
    globalThis.fetch = mock(() => Promise.resolve(
      cancellableResponse(418, () => { canceled += 1; })
    )) as unknown as typeof fetch;
    await expect(new BloombergAdapter().fetchJobContent("bloomberg", "21651"))
      .rejects.toThrow("Bloomberg Careers 418 for job 21651");
    expect(canceled).toBe(2);
  });

  it("falls back to the public-ID detail route and validates canonical identity", async () => {
    const fetchMock = mock((_input: RequestInfo | URL) =>
      Promise.resolve(detailPage("21651"))
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await new BloombergAdapter().fetchJobContent("bloomberg", "21651");
    const requested = new URL(String(fetchMock.mock.calls[0][0]));
    expect(requested.pathname).toBe("/careers/JobDetail");
    expect(requested.searchParams.get("jobId")).toBe("21651");

    mock.restore();
    globalThis.fetch = mock(() => Promise.resolve(detailPage("99999"))) as unknown as typeof fetch;
    await expect(new BloombergAdapter().fetchJobContent("bloomberg", "21651"))
      .rejects.toThrow("returned public ID 99999 for 21651");
  });

  it("rejects detail URLs outside the configured Bloomberg portal", async () => {
    const fetchMock = mock();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(new BloombergAdapter().fetchJobContent(
      "bloomberg",
      "21651",
      "https://evil.example/careers/JobDetail/software-engineer/21651"
    )).rejects.toThrow("HTTPS bloomberg.avature.net");
    await expect(new BloombergAdapter().fetchJobContent(
      "bloomberg",
      "21651",
      "https://bloomberg.avature.net/careers/JobDetail/software-engineer/99999"
    )).rejects.toThrow("does not match its public ID");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
