'use client';

import Script from 'next/script';
import { useEffect, useRef, useState } from 'react';
import { circuitColorAsCss } from '@lib/circuit-colors';
import type { GoogleMap } from './google-maps-types';

export interface ItineraryDayMapStop {
  kind: string;
  label: string;
  latitude: number | null;
  longitude: number | null;
}

export interface ItineraryCircuitMapDay {
  dayNumber: number;
  /** Bare hex, e.g. 'D65B2E' -- see src/lib/circuit-colors.ts. */
  color: string;
  stops: ItineraryDayMapStop[];
}

interface ItineraryCircuitMapProps {
  days: ItineraryCircuitMapDay[];
}

/** DR-150: read-only whole-circuit map for the staff Map tab -- every day's
 * stops plotted on one map, each day its own color (marker fill + polyline
 * stroke), replacing the old one-day-at-a-time ItineraryDayMap. No
 * road-snapped routing (Directions/Routes API) needed here, same as
 * before -- just "where, in what order, on what day." Uses the browser
 * NEXT_PUBLIC_GOOGLE_MAPS_API_KEY, same graceful degradation as
 * MapLocationPicker.tsx when it's unset. Fits the viewport to every
 * geocoded point across every day (LatLngBounds/fitBounds) rather than
 * centering on day 1's first stop -- the old per-day version could get away
 * with that, a multi-day circuit spanning real distance can't. */
export function ItineraryCircuitMap({ days }: ItineraryCircuitMapProps) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<GoogleMap | null>(null);
  const [scriptLoaded, setScriptLoaded] = useState(false);

  const geocodedDays = days.map((day) => ({
    ...day,
    stops: day.stops.filter(
      (s): s is ItineraryDayMapStop & { latitude: number; longitude: number } => s.latitude != null && s.longitude != null,
    ),
  }));
  const hasAnyGeocodedStop = geocodedDays.some((d) => d.stops.length > 0);

  useEffect(() => {
    if (!scriptLoaded || !mapContainerRef.current || !window.google || !hasAnyGeocodedStop) return;
    const map = new window.google.maps.Map(mapContainerRef.current, {});
    const bounds = new window.google.maps.LatLngBounds();

    for (const day of geocodedDays) {
      const color = circuitColorAsCss(day.color);
      for (const stop of day.stops) {
        const position = { lat: stop.latitude, lng: stop.longitude };
        bounds.extend(position);
        new window.google.maps.Marker({
          position,
          map,
          title: `Day ${day.dayNumber} — ${stop.kind}: ${stop.label}`,
          icon: {
            path: window.google.maps.SymbolPath.CIRCLE,
            scale: 6,
            fillColor: color,
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 1,
          },
        });
      }
      if (day.stops.length > 1) {
        new window.google.maps.Polyline({
          path: day.stops.map((s) => ({ lat: s.latitude, lng: s.longitude })),
          map,
          strokeColor: color,
          strokeWeight: 3,
        });
      }
    }
    map.fitBounds(bounds);
    mapRef.current = map;
    // Deliberately only on scriptLoaded -- `days` is a server-fetched prop
    // that doesn't change after mount for a given render of this component.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scriptLoaded]);

  if (!apiKey) {
    return (
      <div className="space-y-3">
        <p className="text-xs text-mist">Interactive map unavailable (NEXT_PUBLIC_GOOGLE_MAPS_API_KEY not configured).</p>
        {days.map((day) => (
          <div key={day.dayNumber}>
            <p className="flex items-center gap-2 text-sm font-medium text-navy">
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: circuitColorAsCss(day.color) }}
              />
              Day {day.dayNumber}
            </p>
            <ul className="text-sm text-mist">
              {day.stops.map((s, i) => (
                <li key={i}>
                  {s.kind}: {s.label}
                  {(s.latitude == null || s.longitude == null) && ' (not geocoded)'}
                </li>
              ))}
            </ul>
          </div>
        ))}
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
      {!hasAnyGeocodedStop ? (
        <p className="text-xs text-mist">No geocoded stops yet for this itinerary.</p>
      ) : (
        <div ref={mapContainerRef} className="h-[32rem] w-full rounded-card border border-rule" />
      )}
    </div>
  );
}
