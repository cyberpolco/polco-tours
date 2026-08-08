'use client';

import Script from 'next/script';
import { useEffect, useRef, useState } from 'react';
import { FormField } from './FormField';
import type { GoogleMap, GoogleMarker } from './google-maps-types';

// Windhoek, Namibia -- Lam's home base (DR-005, single-operator launch) and
// a reasonable default center when no pickup point has been set yet.
const DEFAULT_CENTER = { lat: -22.5597, lng: 17.0832 };

interface MapLocationPickerProps {
  latitudeName?: string;
  longitudeName?: string;
  initialLatitude?: number | null;
  initialLongitude?: number | null;
  defaultCenter?: { lat: number; lng: number };
  // When true, the two number inputs drop `required` -- for a field pair
  // that's genuinely optional (e.g. ItineraryDay pickup/dropoff), unlike
  // Departure/StarlinkKit's location, which is always set once shown.
  optional?: boolean;
}

/** DR-077: Google Maps JS API, this app's first interactive map (the
 * homepage AfricaMap is a static, non-interactive choropleth, unrelated
 * stack). Click or drag the pin to set a location; the two number inputs
 * stay fully editable on their own either way -- charter rule 8, this is a
 * visual aid layered on the existing plain-coordinate form, never the sole
 * way to set a location. Gracefully degrades to those inputs alone (no
 * script load attempt at all) when NEXT_PUBLIC_GOOGLE_MAPS_API_KEY isn't
 * configured. A shared `id` on the Script tag lets Next.js dedupe the
 * underlying <script> when a form renders more than one picker at once
 * (e.g. a day's pickup + dropoff) -- Google's Maps JS API warns/misbehaves
 * if its script is injected twice. */
export function MapLocationPicker({
  latitudeName = 'latitude',
  longitudeName = 'longitude',
  initialLatitude = null,
  initialLongitude = null,
  defaultCenter = DEFAULT_CENTER,
  optional = false,
}: MapLocationPickerProps) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<GoogleMap | null>(null);
  const markerRef = useRef<GoogleMarker | null>(null);
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const [latitude, setLatitude] = useState<number | null>(initialLatitude);
  const [longitude, setLongitude] = useState<number | null>(initialLongitude);

  // Create the map + marker once the script has loaded. Click/drag update
  // React state; the effect below mirrors state back onto the map/marker,
  // so typing in the number inputs also moves the pin.
  useEffect(() => {
    if (!scriptLoaded || !mapContainerRef.current || !window.google) return;
    const hasPoint = latitude != null && longitude != null;
    const center = hasPoint ? { lat: latitude, lng: longitude } : defaultCenter;
    const map = new window.google.maps.Map(mapContainerRef.current, { center, zoom: hasPoint ? 13 : 6 });
    const marker = new window.google.maps.Marker({ position: center, map, draggable: true });
    marker.addListener('dragend', (e) => {
      if (!e.latLng) return;
      setLatitude(e.latLng.lat());
      setLongitude(e.latLng.lng());
    });
    map.addListener('click', (e) => {
      if (!e.latLng) return;
      setLatitude(e.latLng.lat());
      setLongitude(e.latLng.lng());
    });
    mapRef.current = map;
    markerRef.current = marker;
    // Deliberately only on scriptLoaded -- this creates the map exactly
    // once; lat/lng changes afterward are handled by the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scriptLoaded]);

  // Keep the pin/center in sync when the coordinates change for any reason
  // other than clicking/dragging the map itself (e.g. typing in the inputs).
  useEffect(() => {
    if (!mapRef.current || !markerRef.current || latitude == null || longitude == null) return;
    const position = { lat: latitude, lng: longitude };
    markerRef.current.setPosition(position);
    mapRef.current.setCenter(position);
  }, [latitude, longitude]);

  const numberInputs = (
    <div className="grid grid-cols-2 gap-4">
      <FormField label="Latitude" htmlFor={latitudeName}>
        <input
          name={latitudeName}
          type="number"
          step="any"
          required={!optional}
          value={latitude ?? ''}
          onChange={(e) => setLatitude(e.target.value === '' ? null : Number(e.target.value))}
          className="w-full rounded-survey border border-rule px-3 py-2"
        />
      </FormField>
      <FormField label="Longitude" htmlFor={longitudeName}>
        <input
          name={longitudeName}
          type="number"
          step="any"
          required={!optional}
          value={longitude ?? ''}
          onChange={(e) => setLongitude(e.target.value === '' ? null : Number(e.target.value))}
          className="w-full rounded-survey border border-rule px-3 py-2"
        />
      </FormField>
    </div>
  );

  if (!apiKey) {
    return (
      <div className="space-y-3">
        {numberInputs}
        <p className="text-xs text-mist">
          Interactive map unavailable (NEXT_PUBLIC_GOOGLE_MAPS_API_KEY not configured) -- enter coordinates manually above.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <Script
        id="google-maps-js"
        src={`https://maps.googleapis.com/maps/api/js?key=${apiKey}`}
        strategy="afterInteractive"
        onLoad={() => setScriptLoaded(true)}
      />
      {numberInputs}
      <div ref={mapContainerRef} className="h-64 w-full rounded-card border border-rule" />
      <p className="text-xs text-mist">Click or drag the pin to set the location.</p>
    </div>
  );
}
