// itinerary module — Static Maps gateway (charter rule 8: third-party
// integrations must be wrapped so an outage never crashes the request).
// Server-only: reads GOOGLE_MAPS_SERVER_API_KEY, never NEXT_PUBLIC_-prefixed.
// Mirrors notifications/gateway.ts's env-gated + AbortSignal.timeout shape,
// simplified (no retry/circuit-breaker) to match documents/gateway.ts's
// plainer variant -- a failed map render degrades to a clean 5xx on the PDF
// download route, never a crash, and there's no fallback channel to retry
// into the way notifications has.
//
// DR-150: renders the WHOLE tour's circuit in one image (every day's stops,
// each day its own color), replacing the old one-day/one-color renderMap.
// Google's Static Maps API already natively supports this -- repeating the
// `markers`/`path` params, each with its own `color:0xRRGGBB` prefix -- so
// this is a wider query string, not a different endpoint.
export interface CircuitMapDay {
  /** Bare hex, e.g. 'D65B2E' -- see src/lib/circuit-colors.ts. */
  color: string;
  points: Array<{ lat: number; lng: number }>;
}

export interface RenderCircuitMapRequest {
  days: CircuitMapDay[];
  width?: number;
  height?: number;
}

export class StaticMapsGatewayError extends Error {}

export interface StaticMapsGateway {
  renderCircuitMap(req: RenderCircuitMapRequest): Promise<Buffer>;
}

// Google documents keeping a Static Maps request URL under 8192 characters.
// A long circuit (many days x many stops/day) can realistically approach
// that with markers AND paths for every day -- degrade in stages rather
// than let fetch() 400 on an oversized URL: drop per-stop markers first
// (the colored path alone still conveys the circuit), then thin each day's
// path points (keeping first/last) if it's still too long.
const STATIC_MAPS_MAX_URL_LENGTH = 8000;
const STATIC_MAPS_BASE_URL = 'https://maps.googleapis.com/maps/api/staticmap';

function buildUrl(apiKey: string, req: RenderCircuitMapRequest, days: CircuitMapDay[], includeMarkers: boolean): string {
  const params = new URLSearchParams({ size: `${req.width ?? 1024}x${req.height ?? 768}`, key: apiKey });
  for (const day of days) {
    if (day.points.length === 0) continue;
    const pts = day.points.map((p) => `${p.lat},${p.lng}`).join('|');
    if (includeMarkers) params.append('markers', `color:0x${day.color}|${pts}`);
    if (day.points.length > 1) params.append('path', `color:0x${day.color}|weight:3|${pts}`);
  }
  return `${STATIC_MAPS_BASE_URL}?${params.toString()}`;
}

/** Keeps every day's first/last point (the endpoints matter most for the
 * circuit's overall shape) and drops every other interior point -- roughly
 * halves the point count per call. */
function thinDays(days: CircuitMapDay[]): CircuitMapDay[] {
  return days.map((day) => ({
    ...day,
    points:
      day.points.length <= 2
        ? day.points
        : day.points.filter((_, i) => i === 0 || i === day.points.length - 1 || i % 2 === 0),
  }));
}

class GoogleStaticMapsGateway implements StaticMapsGateway {
  async renderCircuitMap(req: RenderCircuitMapRequest): Promise<Buffer> {
    const apiKey = process.env.GOOGLE_MAPS_SERVER_API_KEY;
    if (!apiKey) throw new StaticMapsGatewayError('GOOGLE_MAPS_SERVER_API_KEY not configured');

    let days = req.days;
    let url = buildUrl(apiKey, req, days, true);
    if (url.length > STATIC_MAPS_MAX_URL_LENGTH) {
      url = buildUrl(apiKey, req, days, false);
    }
    for (let guard = 0; url.length > STATIC_MAPS_MAX_URL_LENGTH && guard < 5; guard++) {
      days = thinDays(days);
      url = buildUrl(apiKey, req, days, false);
    }

    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) throw new Error(`Static Maps API responded ${res.status}`);
      return Buffer.from(await res.arrayBuffer());
    } catch {
      throw new StaticMapsGatewayError('Failed to render map image');
    }
  }
}

export const staticMapsGateway: StaticMapsGateway = new GoogleStaticMapsGateway();
