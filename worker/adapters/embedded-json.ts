function decodeEntity(entity: string): string {
  const named: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    quot: "\"",
  };

  if (entity.startsWith("#x")) {
    return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
  }
  if (entity.startsWith("#")) {
    return String.fromCodePoint(Number.parseInt(entity.slice(1), 10));
  }
  return named[entity] ?? `&${entity};`;
}

export function decodeHtmlEntities(value: string): string {
  return value.replace(
    /&(amp|apos|gt|lt|quot|#\d+|#x[\da-f]+);/gi,
    (_, entity: string) => decodeEntity(entity.toLowerCase())
  );
}

export function parseNextData<T>(html: string): T {
  const match = html.match(
    /<script[^>]*\bid=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i
  );
  if (!match) throw new Error("Page is missing its __NEXT_DATA__ payload");
  return JSON.parse(match[1]) as T;
}

export function parseDataPage<T>(html: string): T {
  const match = html.match(/\bdata-page="([^"]+)"/i);
  if (!match) throw new Error("Page is missing its data-page payload");
  return JSON.parse(decodeHtmlEntities(match[1])) as T;
}
