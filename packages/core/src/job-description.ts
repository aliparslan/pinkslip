/* A job description as blocks the iOS app draws with native text.

   Postings arrive as HTML from many applicant tracking systems: sometimes
   tidy, sometimes entity-encoded, sometimes a pile of <div>s and <br>s. The
   web renders it as HTML; React Native has no HTML, so this turns it into a
   small set of blocks (headings, paragraphs, lists) made of styled runs.
   Pure string work, no DOM, so it runs anywhere. */

import { normalizeText } from "./job-format";

export interface DescriptionRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  href?: string;
}

export type DescriptionBlock =
  | { kind: "heading"; runs: DescriptionRun[] }
  | { kind: "paragraph"; runs: DescriptionRun[] }
  | { kind: "list"; ordered: boolean; items: DescriptionRun[][] };

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  hellip: "…",
  bull: "•",
  middot: "·",
  trade: "™",
  reg: "®",
  copy: "©",
  eacute: "é",
  egrave: "è",
  aacute: "á",
  oacute: "ó",
  uacute: "ú",
  iacute: "í",
  ntilde: "ñ",
  uuml: "ü",
  ouml: "ö",
  auml: "ä",
};

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] === "#") {
      const code = entity[1] === "x" || entity[1] === "X" ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : match;
    }
    return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
  });
}

const BLOCK_TAGS = new Set(["p", "div", "section", "article", "header", "footer", "blockquote", "table", "tr", "pre"]);
const HEADING_TAGS = new Set(["h1", "h2", "h3", "h4", "h5", "h6"]);
const SKIP_TAGS = new Set(["script", "style", "head", "title", "svg", "noscript", "iframe"]);

interface Token {
  type: "open" | "close" | "text" | "self";
  tag?: string;
  attrs?: string;
  text?: string;
}

function tokenize(html: string): Token[] {
  const tokens: Token[] = [];
  const pattern = /<!--[\s\S]*?-->|<\/?([a-z][a-z0-9]*)\b([^>]*)>|([^<]+)|</gi;
  for (const match of html.matchAll(pattern)) {
    const [whole, tag, attrs, text] = match;
    if (whole.startsWith("<!--")) continue;
    if (tag) {
      const lower = tag.toLowerCase();
      if (whole.startsWith("</")) tokens.push({ type: "close", tag: lower });
      else if (lower === "br" || lower === "hr" || whole.endsWith("/>")) tokens.push({ type: "self", tag: lower });
      else tokens.push({ type: "open", tag: lower, attrs: attrs ?? "" });
    } else {
      tokens.push({ type: "text", text: text ?? whole });
    }
  }
  return tokens;
}

function hrefOf(attrs: string | undefined): string | undefined {
  const match = attrs?.match(/href\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i);
  const href = decodeEntities(match?.[2] ?? match?.[3] ?? match?.[4] ?? "");
  return /^(https?:|mailto:)/i.test(href) ? href : undefined;
}

/** Postings sometimes arrive entity-encoded ("&lt;p&gt;…"). Decode once when
 * there are encoded tags and no real ones. */
function decodeIfEncoded(html: string): string {
  if (!/&lt;\/?[a-z]/i.test(html) || /<[a-z][\s\S]*>/i.test(html)) return html;
  return decodeEntities(html);
}

function tidyRuns(runs: DescriptionRun[]): DescriptionRun[] {
  const merged: DescriptionRun[] = [];
  for (const run of runs) {
    const text = run.text.replace(/[ \t\r\n\f ]+/g, " ");
    if (!text) continue;
    const last = merged.at(-1);
    if (last && last.bold === run.bold && last.italic === run.italic && last.href === run.href) last.text += text;
    else merged.push({ ...run, text });
  }
  if (merged[0]) merged[0].text = merged[0].text.trimStart();
  const last = merged.at(-1);
  if (last) last.text = last.text.trimEnd();
  return merged.filter((run) => run.text);
}

const plain = (runs: DescriptionRun[]) => runs.map((run) => run.text).join("");

/** A paragraph that is only bold text and short reads as a heading:
 * "<p><strong>What you'll do</strong></p>". */
function looksLikeHeading(runs: DescriptionRun[]): boolean {
  const text = plain(runs).trim();
  return runs.length > 0 && runs.every((run) => run.bold) && text.length > 0 && text.length <= 80 && !/[.!?]$/.test(text);
}

export function parseJobDescription(
  html: string | null | undefined,
  context: { title?: string | null; companyName?: string | null } = {},
): DescriptionBlock[] {
  if (!html?.trim()) return [];
  const tokens = tokenize(decodeIfEncoded(html));
  const blocks: DescriptionBlock[] = [];
  let runs: DescriptionRun[] = [];
  let heading = false;
  let bold = 0;
  let italic = 0;
  let href: string | undefined;
  let skip = 0;
  const lists: { ordered: boolean; items: DescriptionRun[][] }[] = [];
  let item: DescriptionRun[] | null = null;

  const flush = () => {
    const tidy = tidyRuns(runs);
    runs = [];
    if (!tidy.length) return;
    if (item) {
      item.push(...(item.length ? [{ text: " " }] : []), ...tidy);
      return;
    }
    blocks.push(heading || looksLikeHeading(tidy) ? { kind: "heading", runs: tidy.map((run) => ({ ...run, bold: undefined })) } : { kind: "paragraph", runs: tidy });
  };

  for (const token of tokens) {
    const tag = token.tag;
    if (token.type === "open" && tag && SKIP_TAGS.has(tag)) skip++;
    if (token.type === "close" && tag && SKIP_TAGS.has(tag)) {
      skip = Math.max(0, skip - 1);
      continue;
    }
    if (skip) continue;

    if (token.type === "text") {
      runs.push({ text: decodeEntities(token.text ?? ""), bold: bold > 0 || undefined, italic: italic > 0 || undefined, href });
      continue;
    }
    if (!tag) continue;

    if (token.type === "self") {
      if (tag === "br") flush();
      continue;
    }
    if (tag === "b" || tag === "strong") bold += token.type === "open" ? 1 : -1;
    else if (tag === "i" || tag === "em") italic += token.type === "open" ? 1 : -1;
    else if (tag === "a") href = token.type === "open" ? hrefOf(token.attrs) : undefined;
    else if (HEADING_TAGS.has(tag)) {
      flush();
      heading = token.type === "open";
    } else if (tag === "ul" || tag === "ol") {
      flush();
      if (token.type === "open") {
        // An item that opens a nested list ends there; the nested items follow it.
        if (item?.length) lists.at(-1)?.items.push(item);
        item = null;
        lists.push({ ordered: tag === "ol", items: [] });
      } else {
        const list = lists.pop();
        if (list?.items.length) {
          const parent = lists.at(-1);
          // A nested list joins its parent's items, so lists stay one level deep.
          if (parent) parent.items.push(...list.items);
          else blocks.push({ kind: "list", ordered: list.ordered, items: list.items });
        }
      }
    } else if (tag === "li") {
      flush();
      if (token.type === "open") item = [];
      else if (item) {
        if (item.length) lists.at(-1)?.items.push(item);
        item = null;
      }
    } else if (BLOCK_TAGS.has(tag) || tag === "td" || tag === "th") {
      flush();
    }
    bold = Math.max(0, bold);
    italic = Math.max(0, italic);
  }
  flush();
  if (item && (item as DescriptionRun[]).length) lists.at(-1)?.items.push(item);
  for (const list of lists) if (list.items.length) blocks.push({ kind: "list", ordered: list.ordered, items: list.items });

  // The page already shows the title and company; a posting that opens by
  // repeating them, or with a bare "Job description", drops that line.
  const first = blocks[0];
  if (first && first.kind === "heading") {
    const text = normalizeText(plain(first.runs)).toLowerCase();
    const title = normalizeText(context.title ?? "").toLowerCase();
    const company = normalizeText(context.companyName ?? "").toLowerCase();
    if (["about the role", "about the job", "job description"].includes(text) || text === title || text === company) {
      blocks.shift();
    }
  }
  return blocks;
}
