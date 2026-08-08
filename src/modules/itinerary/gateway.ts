// itinerary module — Static Maps gateway (charter rule 8: third-party
// integrations must be wrapped so an outage never crashes the request).
// Server-only: reads GOOGLE_MAPS_SERVER_API_KEY, never NEXT_PUBLIC_-prefixed.
// Mirrors notifications/gateway.ts's env-gated + AbortSignal.timeout shape,
// simplified (no retry/circuit-breaker) to match documents/gateway.ts's
// plainer variant -- a failed map render degrades to a clean 5xx on the PDF
// download route, never a crash, and there's no fallback channel to retry
// into the way notifications has.
export interface MapMarker {
  lat: number;
  lng: number;
  label?: string;
}

export interface RenderMapRequest {
  markers: MapMarker[];
  path?: Array<{ lat: number; lng: number }>;
  width?: number;
  height?: number;
}

export class StaticMapsGatewayError extends Error {}

export interface StaticMapsGateway {
  renderMap(req: RenderMapRequest): Promise<Buffer>;
}

class GoogleStaticMapsGateway implements StaticMapsGateway {
  async renderMap(req: RenderMapRequest): Promise<Buffer> {
    const apiKey = process.env.GOOGLE_MAPS_SERVER_API_KEY;
    if (!apiKey) throw new StaticMapsGatewayError('GOOGLE_MAPS_SERVER_API_KEY not configured');

    const params = new URLSearchParams({ size: `${req.width ?? 640}x${req.height ?? 480}`, key: apiKey });
    for (const m of req.markers) params.append('markers', `${m.lat},${m.lng}`);
    if (req.path && req.path.length > 1) {
      params.append('path', req.path.map((p) => `${p.lat},${p.lng}`).join('|'));
    }

    try {
      const res = await fetch(`https://maps.googleapis.com/maps/api/staticmap?${params.toString()}`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) throw new Error(`Static Maps API responded ${res.status}`);
      return Buffer.from(await res.arrayBuffer());
    } catch {
      throw new StaticMapsGatewayError('Failed to render map image');
    }
  }
}

export const staticMapsGateway: StaticMapsGateway = new GoogleStaticMapsGateway();
