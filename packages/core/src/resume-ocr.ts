/** Shared limits for the web and the native WebView's transient OCR pages. */
export const MAX_OCR_PAGES = 3;
export const OCR_JPEG_QUALITY = 0.86;

export function ocrPageNumbers(totalPages: number): number[] {
  const count = Math.min(MAX_OCR_PAGES, Math.max(0, Math.floor(totalPages)));
  return Array.from({ length: count }, (_, index) => index + 1);
}

export function boundedOcrRenderScale(width: number, height: number): number {
  if (!(width > 0) || !(height > 0)) return 1;
  return Math.min(2.2, 1_800 / Math.max(width, height), Math.sqrt(2_500_000 / (width * height)));
}
