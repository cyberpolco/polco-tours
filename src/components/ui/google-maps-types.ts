// Shared, hand-written typing for exactly the Google Maps JS API surface
// this app's map components use (MapLocationPicker.tsx, DR-077;
// ItineraryCircuitMap.tsx, DR-089/DR-150) -- avoids adding @types/google.maps (or any
// Maps npm package at all) for a surface this narrow. `unknown`-free by
// design (no-explicit-any is an error in this repo's eslint config).
//
// Deliberately a single shared file: both components augment the same
// global `Window.google` property, and TypeScript requires every
// declaration of a merged interface member to have the identical type --
// two files each declaring their own same-named-but-structurally-different
// `GoogleMapsNamespace` would conflict.
export interface GoogleLatLng {
  lat(): number;
  lng(): number;
}

export interface GoogleMapMouseEvent {
  latLng: GoogleLatLng | null;
}

export interface GoogleMarker {
  setPosition(position: { lat: number; lng: number }): void;
  addListener(event: 'dragend', handler: (e: GoogleMapMouseEvent) => void): void;
}

export interface GooglePolyline {
  setMap(map: GoogleMap | null): void;
}

// DR-150: a plain circle Symbol icon, colored per-day via fillColor -- the
// only icon shape this app needs, so this isn't the full Symbol/Icon union
// the real API supports.
export interface GoogleSymbolIcon {
  path: number;
  scale?: number;
  fillColor?: string;
  fillOpacity?: number;
  strokeColor?: string;
  strokeWeight?: number;
}

// DR-150: accumulates points for GoogleMap.fitBounds -- the whole-circuit
// map fits its viewport to every geocoded stop across every day rather than
// centering on one fixed point/zoom.
export interface GoogleLatLngBounds {
  extend(point: { lat: number; lng: number }): void;
}

export interface GoogleMap {
  setCenter(position: { lat: number; lng: number }): void;
  addListener(event: 'click', handler: (e: GoogleMapMouseEvent) => void): void;
  fitBounds(bounds: GoogleLatLngBounds): void;
}

export interface GoogleMapsNamespace {
  Map: new (el: HTMLElement, opts: { center?: { lat: number; lng: number }; zoom?: number }) => GoogleMap;
  Marker: new (opts: {
    position: { lat: number; lng: number };
    map: GoogleMap;
    draggable?: boolean;
    label?: string;
    title?: string;
    icon?: GoogleSymbolIcon;
  }) => GoogleMarker;
  Polyline: new (opts: {
    path: Array<{ lat: number; lng: number }>;
    map: GoogleMap;
    strokeColor?: string;
    strokeWeight?: number;
  }) => GooglePolyline;
  LatLngBounds: new () => GoogleLatLngBounds;
  SymbolPath: { CIRCLE: number };
}

declare global {
  interface Window {
    google?: { maps: GoogleMapsNamespace };
  }
}
