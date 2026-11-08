import type { PublicJob } from "@pinkslip/domain/public-jobs";
import { ImageResponse } from "workers-og";
import interMedium from "@fontsource/inter/files/inter-latin-500-normal.woff?inline";
import interRegular from "@fontsource/inter/files/inter-latin-400-normal.woff?inline";
import interSemibold from "@fontsource/inter/files/inter-latin-600-normal.woff?inline";
import mark from "../../public/brand/mark.svg?raw";
import { cardFacts, cardTitle } from "../features/job-detail/card-facts";
import display from "./card/founders-grotesk-semibold.ttf?inline";

/**
 * A job's link preview (owner, 2026-11-08, Paper "The job card, black, and
 * the mark everywhere"): black, the company's tile top left and Pinkslip's
 * mark top right, the position as the biggest thing, and the pay and place
 * on one line under it. 1200×630, drawn the first time it's asked for and
 * kept at the edge for a day.
 *
 * The display face's trial cut has no "$", "–" or "·", so the facts line is
 * Inter, and the title falls back to it for the punctuation it lacks.
 */

const WIDTH = 1200;
const HEIGHT = 630;
const FIELD = "#131316";
const CACHE_SECONDS = 86_400;

function bytes(dataUrl: string): ArrayBuffer {
  const binary = atob(dataUrl.slice(dataUrl.indexOf(",") + 1));
  const out = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) out[index] = binary.charCodeAt(index);
  return out.buffer;
}

function base64(buffer: ArrayBuffer): string {
  const view = new Uint8Array(buffer);
  let binary = "";
  for (let index = 0; index < view.length; index += 0x8000) binary += String.fromCharCode(...view.subarray(index, index + 0x8000));
  return btoa(binary);
}

function host(domain: string): string | null {
  const name = domain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  return /^[a-z0-9][a-z0-9.-]{0,252}$/.test(name) && name.includes(".") ? name : null;
}

/** The company's favicon through the API's proxy, and whether it's a full
 * square that fills its tile (the app's rule); null without one. */
async function companyLogo(api: Fetcher, domain: string): Promise<{ src: string; fills: boolean } | null> {
  const name = host(domain);
  if (!name) return null;
  const query = `domain=${encodeURIComponent(name)}`;
  const [image, shape] = await Promise.all([
    api.fetch(`https://pinkslip.work/api/v2/logo?${query}`),
    api.fetch(`https://pinkslip.work/api/v2/logo/shape?${query}`),
  ]);
  if (!image.ok) return null;
  const type = image.headers.get("content-type") ?? "image/png";
  const fills = shape.ok ? Boolean(((await shape.json()) as { fills?: boolean }).fills) : false;
  return { src: `data:${type};base64,${base64(await image.arrayBuffer())}`, fills };
}

/** A node in the shape the renderer takes (React's, without React). Its
 * HTML parser splits text into pieces, which it then refuses. */
interface Node { type: string; props: Record<string, unknown> }
function h(type: string, props: Record<string, unknown>, ...children: (Node | string | false | null)[]): Node {
  const kept = children.filter((child): child is Node | string => Boolean(child));
  return { type, props: { ...props, children: kept.length === 1 ? kept[0] : kept } };
}

function card(job: PublicJob, logo: { src: string; fills: boolean } | null): Node {
  const tile = logo
    ? h("img", { src: logo.src, width: logo.fills ? 128 : 102, height: logo.fills ? 128 : 102 })
    : h("div", { style: { fontFamily: "Letter", fontSize: 56, color: "#7A7A82" } }, job.company_name.trim().charAt(0).toUpperCase() || "·");
  const facts = cardFacts(job);
  return h("div", { style: { display: "flex", flexDirection: "column", justifyContent: "space-between", width: WIDTH, height: HEIGHT, padding: "72px 80px 76px", background: FIELD } },
    h("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "flex-start" } },
      h("div", { style: { display: "flex", alignItems: "center", justifyContent: "center", width: 128, height: 128, borderRadius: 32, background: "#FFFFFF", overflow: "hidden" } }, tile),
      h("img", { src: `data:image/svg+xml;base64,${btoa(mark)}`, width: 128, height: 128 })),
    h("div", { style: { display: "flex", flexDirection: "column" } },
      h("div", { style: { fontFamily: "Display, Punctuation", fontSize: 72, lineHeight: 1.06, letterSpacing: -0.7, color: "#FFFFFF" } }, cardTitle(job.title)),
      facts ? h("div", { style: { marginTop: 20, fontFamily: "Text", fontSize: 40, color: "#B6B6BD" } }, facts) : null));
}

/** GET /og/jobs/:id.png: the card for a public job, from the edge cache
 * when it's there. A job the public catalog doesn't list is a 404, and the
 * page falls back to the site's own preview. */
export async function jobCard(request: Request, api: Fetcher, ctx: ExecutionContext, jobId: string): Promise<Response> {
  // Workers' own cache; the DOM's CacheStorage type has no `default`.
  const cache = (caches as unknown as { default: Cache }).default;
  const cached = await cache.match(request);
  if (cached) return cached;
  const found = await api.fetch(`https://pinkslip.work/api/v2/public/jobs/${encodeURIComponent(jobId)}`);
  if (!found.ok) return new Response("Not found", { status: 404, headers: { "Cache-Control": "public, max-age=600" } });
  const job = await found.json() as PublicJob;
  const logo = await companyLogo(api, job.company_domain).catch(() => null);
  const image = new ImageResponse(card(job, logo) as unknown as React.ReactNode, {
    width: WIDTH,
    height: HEIGHT,
    fonts: [
      { name: "Display", data: bytes(display), weight: 600, style: "normal" },
      // The title's punctuation the trial cut lacks, at its weight: the
      // title's second family.
      { name: "Punctuation", data: bytes(interSemibold), weight: 600, style: "normal" },
      { name: "Text", data: bytes(interRegular), weight: 400, style: "normal" },
      { name: "Letter", data: bytes(interMedium), weight: 500, style: "normal" },
    ],
  });
  const response = new Response(await image.arrayBuffer(), {
    headers: { "Content-Type": "image/png", "Cache-Control": `public, max-age=${CACHE_SECONDS}` },
  });
  ctx.waitUntil(cache.put(request, response.clone()));
  return response;
}
