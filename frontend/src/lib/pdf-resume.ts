import type { PDFFont } from "pdf-lib";

interface TailoredResumePdfOptions {
  companyName?: string | null;
  jobTitle?: string | null;
}

type ResumeLine =
  | { kind: "heading"; text: string }
  | { kind: "bullet"; text: string }
  | { kind: "text"; text: string }
  | { kind: "blank" };

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN_X = 42;
const MARGIN_TOP = 38;
const MARGIN_BOTTOM = 38;
const NAME_SIZE = 18;
const SECTION_SIZE = 12;
const BODY_SIZE = 11;
const LINE_HEIGHT = 13.4;
const SECTION_GAP = 7;
const BLOCK_GAP = 3;

function stripMarkdownInline(input: string) {
  return input
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .trim();
}

function headingFromLine(line: string) {
  const markdownHeading = line.match(/^#{1,4}\s+(.+)$/);
  if (markdownHeading) return stripMarkdownInline(markdownHeading[1]).replace(/:$/, "");

  const noColon = stripMarkdownInline(line).replace(/:$/, "");
  if (noColon.length > 2 && noColon.length < 64 && /^[A-Z][A-Z0-9/&., +'-]+$/.test(noColon)) {
    return noColon;
  }

  return null;
}

function parseResumeLines(markdown: string): ResumeLine[] {
  return markdown
    .replace(/\r/g, "")
    .split("\n")
    .map((rawLine) => {
      const line = rawLine.trim();
      if (!line) return { kind: "blank" };

      const heading = headingFromLine(line);
      if (heading) return { kind: "heading", text: heading };

      const bullet = line.match(/^[-*\u2022]\s+(.+)$/);
      if (bullet) return { kind: "bullet", text: bullet[1].trim() };

      return { kind: "text", text: line };
    });
}

function sanitizePdfText(input: string) {
  return stripMarkdownInline(input)
    .replace(/\u2013|\u2014/g, "-")
    .replace(/\u2022/g, "-")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function textWidth(font: PDFFont, size: number, text: string) {
  return font.widthOfTextAtSize(text, size);
}

function splitLongWord(font: PDFFont, size: number, word: string, maxWidth: number) {
  const chunks: string[] = [];
  let current = "";
  for (const char of word) {
    const next = `${current}${char}`;
    if (current && textWidth(font, size, next) > maxWidth) {
      chunks.push(current);
      current = char;
    } else {
      current = next;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

function wrapText(font: PDFFont, size: number, text: string, maxWidth: number) {
  const words = sanitizePdfText(text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidates = textWidth(font, size, word) > maxWidth
      ? splitLongWord(font, size, word, maxWidth)
      : [word];

    for (const candidate of candidates) {
      const next = current ? `${current} ${candidate}` : candidate;
      if (current && textWidth(font, size, next) > maxWidth) {
        lines.push(current);
        current = candidate;
      } else {
        current = next;
      }
    }
  }

  if (current) lines.push(current);
  return lines;
}

function slugify(input: string) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function tailoredResumePdfFileName(companyName?: string | null, jobTitle?: string | null) {
  const slug = slugify([companyName, jobTitle, "resume"].filter(Boolean).join(" "));
  return `${slug || "tailored-resume"}.pdf`;
}

export async function buildTailoredResumePdf(markdown: string) {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.07, 0.06, 0.07);
  const muted = rgb(0.36, 0.34, 0.36);
  const rule = rgb(0.14, 0.13, 0.14);
  const maxWidth = PAGE_WIDTH - MARGIN_X * 2;
  let y = PAGE_HEIGHT - MARGIN_TOP;
  let seenHeading = false;
  let headerLines: string[] = [];

  const ensureSpace = (height: number) => {
    if (y - height < MARGIN_BOTTOM) {
      throw new Error("This draft is too long for a one-page PDF at 11pt. Shorten the resume, then download again.");
    }
  };

  const drawLine = (text: string, options?: { font?: PDFFont; size?: number; color?: ReturnType<typeof rgb>; indent?: number }) => {
    const font = options?.font ?? regular;
    const size = options?.size ?? BODY_SIZE;
    const color = options?.color ?? ink;
    const indent = options?.indent ?? 0;
    const lines = wrapText(font, size, text, maxWidth - indent);
    ensureSpace(lines.length * LINE_HEIGHT);
    for (const line of lines) {
      page.drawText(line, {
        x: MARGIN_X + indent,
        y,
        size,
        font,
        color,
      });
      y -= LINE_HEIGHT;
    }
  };

  const drawCentered = (text: string, font: PDFFont, size: number) => {
    const lines = wrapText(font, size, text, maxWidth);
    ensureSpace(lines.length * LINE_HEIGHT);
    for (const line of lines) {
      const width = textWidth(font, size, line);
      page.drawText(line, {
        x: (PAGE_WIDTH - width) / 2,
        y,
        size,
        font,
        color: ink,
      });
      y -= LINE_HEIGHT;
    }
  };

  const flushHeader = () => {
    if (seenHeading || headerLines.length === 0) return;
    const [name, ...contact] = headerLines;
    drawCentered(name, bold, NAME_SIZE);
    if (contact.length > 0) {
      y -= 1;
      drawCentered(contact.join(" | "), regular, BODY_SIZE);
    }
    y -= 4;
    headerLines = [];
  };

  const drawSection = (heading: string) => {
    ensureSpace(SECTION_SIZE + SECTION_GAP + 2);
    y -= SECTION_GAP;
    const text = sanitizePdfText(heading).toUpperCase();
    page.drawText(text, {
      x: MARGIN_X,
      y,
      size: SECTION_SIZE,
      font: bold,
      color: ink,
    });
    page.drawLine({
      start: { x: MARGIN_X, y: y - 3 },
      end: { x: PAGE_WIDTH - MARGIN_X, y: y - 3 },
      thickness: 0.6,
      color: rule,
    });
    y -= LINE_HEIGHT;
  };

  for (const line of parseResumeLines(markdown)) {
    if (line.kind === "blank") {
      if (!seenHeading) flushHeader();
      y -= BLOCK_GAP;
      continue;
    }

    if (line.kind === "heading") {
      flushHeader();
      seenHeading = true;
      drawSection(line.text);
      continue;
    }

    if (!seenHeading && line.kind === "text") {
      headerLines.push(line.text);
      continue;
    }

    flushHeader();

    if (line.kind === "bullet") {
      const bulletIndent = 12;
      const textIndent = 23;
      const lines = wrapText(regular, BODY_SIZE, line.text, maxWidth - textIndent);
      ensureSpace(lines.length * LINE_HEIGHT);
      page.drawText("-", {
        x: MARGIN_X + bulletIndent,
        y,
        size: BODY_SIZE,
        font: regular,
        color: muted,
      });
      for (const [index, wrapped] of lines.entries()) {
        page.drawText(wrapped, {
          x: MARGIN_X + textIndent,
          y,
          size: BODY_SIZE,
          font: regular,
          color: ink,
        });
        y -= index === lines.length - 1 ? LINE_HEIGHT + 1 : LINE_HEIGHT;
      }
      continue;
    }

    const looksLikeRoleLine = line.text.includes("|") || / -- | - /.test(line.text);
    drawLine(line.text, { font: looksLikeRoleLine ? bold : regular });
  }

  flushHeader();
  return pdf.save();
}

export function downloadPdfBytes(fileName: string, bytes: Uint8Array) {
  if (typeof document === "undefined") return;
  const arrayBuffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(arrayBuffer).set(bytes);
  const blob = new Blob([arrayBuffer], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    anchor.rel = "noopener";
    anchor.click();
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 120_000);
  }
}
