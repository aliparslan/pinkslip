import type { Reroute } from "@sveltejs/kit/hooks";
import { normalizeRoute } from "../../../packages/client/src/route-config";
export const reroute: Reroute = ({ url }) => normalizeRoute(url.pathname);
