'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Mercator } from '@visx/geo';
import { ParentSize } from '@visx/responsive';
import { localPoint } from '@visx/event';
import { useTooltip, TooltipWithBounds } from '@visx/tooltip';
import { feature } from 'topojson-client';
import type { Topology, GeometryCollection } from 'topojson-specification';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
// Re-exported from the real `d3-geo` package (@visx/vendor's own dependency,
// already installed as part of the approved @visx/geo/@visx/responsive stack
// -- not a new dependency) -- gives proper fit-to-box projection math instead
// of a hand-rolled CSS scale/translate trick.
import { geoBounds, geoMercator } from '@visx/vendor/d3-geo';
import worldTopology from 'world-atlas/countries-110m.json';
import { AFRICA_COUNTRY_IDS, NAMIBIA_ID, DRC_ID, ZAMBIA_ID, ZIMBABWE_ID, OPERATING_ID_TO_ALPHA2 } from '@lib/africa-country-ids';
import { COUNTRY_FACTS, type CountryFact } from '@lib/country-facts';

const ANTARCTICA_ID = '010';

// world-atlas ships a compact topojson topology (~100KB) -- expanding it to
// GeoJSON client-side via topojson-client keeps the shipped payload small;
// converting server-side first would ship the already-expanded (much
// larger) GeoJSON instead, defeating the point of using topojson at all.
function useWorldFeatures() {
  return useMemo(() => {
    const topology = worldTopology as unknown as Topology<{ countries: GeometryCollection }>;
    const collection = feature(topology, topology.objects.countries) as unknown as FeatureCollection<Geometry>;
    return collection.features.filter((f) => f.id !== ANTARCTICA_ID);
  }, []);
}

// ParentSize needs an explicit height passed in via `style` (a bare Tailwind
// height class collapses to 0 -- see the comment below), which rules out a
// continuous function of measured width. Two fixed breakpoint heights,
// swapped via a resize listener, is the simplest fix that still shrinks the
// map on a phone instead of showing a tall, mostly-empty Mercator projection.
function useMapHeight(): number {
  const [height, setHeight] = useState(420);

  useEffect(() => {
    const query = window.matchMedia('(min-width: 640px)');
    const update = () => setHeight(query.matches ? 420 : 260);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  return height;
}

// Fits a fresh Mercator projection's scale/translate so the given feature
// collection's bounding box exactly fills `height` (d3-geo's fitHeight) --
// scale is uniform on both axes so the continent's shape is never distorted,
// only its size changes. fitHeight left-aligns horizontally (bbox x0 lands
// at pixel 0), so the projected bbox is re-measured afterward and the
// translate nudged to center it within `width` instead.
function fitAfricaProjection(width: number, height: number, africa: FeatureCollection<Geometry>) {
  const projection = geoMercator();
  projection.fitHeight(height, africa);
  const [[minLon, lat], [maxLon]] = geoBounds(africa);
  const x0 = projection([minLon, lat])?.[0] ?? 0;
  const x1 = projection([maxLon, lat])?.[0] ?? width;
  const [tx, ty] = projection.translate();
  const centeredTx = tx + (width - (x1 - x0)) / 2 - x0;
  return { scale: projection.scale(), translate: [centeredTx, ty] as [number, number] };
}

const OPERATING_IDS = new Set([NAMIBIA_ID, DRC_ID, ZAMBIA_ID, ZIMBABWE_ID]);

function isOperatingCountry(id: string | number | undefined): boolean {
  return OPERATING_IDS.has(String(id));
}

function fillFor(id: string | number | undefined, zoomedIn: boolean): string {
  if (isOperatingCountry(id)) return zoomedIn ? 'fill-forest' : 'fill-amber';
  if (AFRICA_COUNTRY_IDS.has(String(id))) return 'fill-amber';
  return 'fill-mist/30';
}

// Homepage decorative map (between the Featured and How-it-works sections):
// world map with Africa highlighted; a "zoom" toggle re-projects to just the
// African continent (fitted to fill the box height, see fitAfricaProjection
// above -- not the rest of the world) and distinctly re-colors Namibia/DRC/
// Zambia/Zimbabwe (DR-034), with a hover tooltip on those four showing
// capital/language/currency/population/area (src/lib/country-facts.ts).
// Clicking one of those four now deep-links into Plan My Trip with that
// destination pre-selected (see plan-my-trip/page.tsx and
// plan-my-trip-form.tsx's initialDestination prop) -- the rest of Africa
// stays decorative/non-interactive since we don't operate there yet.
export function AfricaMap() {
  const router = useRouter();
  const [zoomedIn, setZoomedIn] = useState(false);
  const features = useWorldFeatures();
  const africaFeatures = useMemo(() => features.filter((f) => AFRICA_COUNTRY_IDS.has(String(f.id))), [features]);
  const africaFeatureCollection = useMemo(
    (): FeatureCollection<Geometry> => ({ type: 'FeatureCollection', features: africaFeatures as Feature<Geometry>[] }),
    [africaFeatures],
  );
  const mapHeight = useMapHeight();
  const { tooltipOpen, tooltipLeft, tooltipTop, tooltipData, showTooltip, hideTooltip } = useTooltip<CountryFact>();

  return (
    <div className="relative">
      {/* ParentSize's own wrapper div defaults to an inline style
          height:100%, which beats a Tailwind height class on ParentSize
          itself (inline styles win over classes) -- pass `style` so this
          height actually applies instead of collapsing to 0 against this
          non-flow parent. */}
      <ParentSize style={{ height: mapHeight }} className="w-full">
        {({ width, height }) => {
          if (width === 0 || height === 0) return null;
          const { scale, translate } = zoomedIn
            ? fitAfricaProjection(width, height, africaFeatureCollection)
            : { scale: width / 6.3, translate: [width / 2, height / 1.7] as [number, number] };

          return (
            <svg width={width} height={height} role="img" aria-label="Map of Africa with Namibia, DR Congo, Zambia, and Zimbabwe highlighted">
              <Mercator data={zoomedIn ? africaFeatures : features} scale={scale} translate={translate}>
                {(mercator) => (
                  <>
                    {mercator.features.map(({ feature: f, path, index }) => {
                      const id = String(f.id);
                      const isHighlightCountry = isOperatingCountry(id);
                      const fact = COUNTRY_FACTS[id];
                      const destination = OPERATING_ID_TO_ALPHA2[id];
                      return (
                        <path
                          key={`map-feature-${index}`}
                          d={path || ''}
                          vectorEffect="non-scaling-stroke"
                          role={destination ? 'link' : undefined}
                          aria-label={destination ? `Plan a trip to ${fact?.name ?? destination}` : undefined}
                          className={`stroke-bone ${fillFor(f.id, zoomedIn)} ${isHighlightCountry ? 'cursor-pointer' : ''}`}
                          strokeWidth={0.5}
                          onClick={destination ? () => router.push(`/plan-my-trip?destination=${destination}`) : undefined}
                          onMouseMove={
                            isHighlightCountry && fact
                              ? (event) => {
                                  const point = localPoint(event) ?? { x: 0, y: 0 };
                                  showTooltip({ tooltipLeft: point.x, tooltipTop: point.y, tooltipData: fact });
                                }
                              : undefined
                          }
                          onMouseLeave={isHighlightCountry ? hideTooltip : undefined}
                        />
                      );
                    })}
                  </>
                )}
              </Mercator>
            </svg>
          );
        }}
      </ParentSize>

      <button
        type="button"
        onClick={() => setZoomedIn((z) => !z)}
        className="absolute bottom-3 right-3 rounded-pill border border-rule bg-bone px-3 py-1 text-sm text-ink shadow-card transition-colors duration-200 hover:bg-mist/10"
      >
        {zoomedIn ? 'Zoom out' : 'Zoom into our operating countries'}
      </button>

      {tooltipOpen && tooltipData && (
        <TooltipWithBounds left={tooltipLeft} top={tooltipTop} className="!rounded-card !border !border-rule !bg-navy !text-bone !shadow-lift">
          <p className="font-semibold">{tooltipData.name}</p>
          <p className="mt-1 text-xs text-mist">Capital: {tooltipData.capital}</p>
          <p className="text-xs text-mist">Language: {tooltipData.languages}</p>
          <p className="text-xs text-mist">Currency: {tooltipData.currency}</p>
          <p className="text-xs text-mist">Population: {tooltipData.population}</p>
          <p className="text-xs text-mist">Area: {tooltipData.areaKm2}</p>
          <p className="mt-1 text-xs font-semibold text-amber">Click to plan a trip here</p>
        </TooltipWithBounds>
      )}
    </div>
  );
}
