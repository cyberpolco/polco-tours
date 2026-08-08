'use client';

import Script from 'next/script';
import { useEffect, useRef, useState } from 'react';
import type { GoogleMap, GooglePolyline } from './google-maps-types';

export interface ItineraryDayMapStop {
  kind: string;
  label: string;
  latitude: number | null;
  longitude: number | null;
}

interface ItineraryDayMapProps {
  stops: ItineraryDayMapStop[];
}

/** DR-089: read-only per-day map for the staff Map tab -- plain markers +
 * a polyline connecting the geocoded stops in visiting order, no
 * road-snapped routing (Directions/Routes API) needed for this. Uses the
 * browser NEXT_PUBLIC_GOOGLE_MAPS_API_KEY, same graceful degradation as
 * MapLocationPicker.tsx when it's unset. Centers on the first geocoded
 * stop rather than fitting bounds to all of them -- a real fitBounds/
 * LatLngBounds would expand the hand-written type shim for a v1 feature
 * that only needs "roughly where is this day happening," not a precise
 * viewport. */
export function ItineraryDayMap({ stops }: ItineraryDayMapProps) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<GoogleMap | null>(null);
  const polylineRef = useRef<GooglePolyline | null>(null);
  const [scriptLoaded, setScriptLoaded] = useState(false);

  const geocoded = stops.filter(
    (s): s is ItineraryDayMapStop & { latitude: number; longitude: number } => s.latitude != null && s.longitude != null,
  );

  useEffect(() => {
    if (!scriptLoaded || !mapContainerRef.current || !window.google || geocoded.length === 0) return;
    const first = geocoded[0]!;
    const center = { lat: first.latitude, lng: first.longitude };
    const map = new window.google.maps.Map(mapContainerRef.current, { center, zoom: 11 });
    for (const stop of geocoded) {
      new window.google.maps.Marker({
        position: { lat: stop.latitude, lng: stop.longitude },
        map,
        title: `${stop.kind}: ${stop.label}`,
      });
    }
    if (geocoded.length > 1) {
      polylineRef.current = new window.google.maps.Polyline({
        path: geocoded.map((s) => ({ lat: s.latitude, lng: s.longitude })),
        map,
        strokeColor: '#D65B2E',
        strokeWeight: 3,
      });
    }
    mapRef.current = map;
    // Deliberately only on scriptLoaded -- `stops` is a server-fetched prop
    // that doesn't change after mount for a given render of this component.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scriptLoaded]);

  if (!apiKey) {
    return (
      <div className="space-y-2">
        <p className="text-xs text-mist">Interactive map unavailable (NEXT_PUBLIC_GOOGLE_MAPS_API_KEY not configured).</p>
        <ul className="text-sm text-mist">
          {stops.map((s, i) => (
            <li key={i}>
              {s.kind}: {s.label}
              {(s.latitude == null || s.longitude == null) && ' (not geocoded)'}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Script
        id="google-maps-js"
        src={`https://maps.googleapis.com/maps/api/js?key=${apiKey}`}
        strategy="afterInteractive"
        onLoad={() => setScriptLoaded(true)}
      />
      {geocoded.length === 0 ? (
        <p className="text-xs text-mist">No geocoded stops yet for this day.</p>
      ) : (
        <div ref={mapContainerRef} className="h-64 w-full rounded-card border border-rule" />
      )}
    </div>
  );
}
