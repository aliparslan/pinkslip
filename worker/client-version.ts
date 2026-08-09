export const STRUCTURED_API_VERSION = 2;
export const API_VERSION_HEADER = "X-Pinkslip-Api-Version";

export function clientApiVersion(request: Request): number {
  const value = Number.parseInt(request.headers.get(API_VERSION_HEADER) ?? "", 10);
  return Number.isFinite(value) && value > 0 ? value : 1;
}

export function supportsStructuredApi(request: Request): boolean {
  return clientApiVersion(request) >= STRUCTURED_API_VERSION;
}
