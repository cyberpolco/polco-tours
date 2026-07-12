'use client';

import { useMemo, useState } from 'react';
import { Mercator } from '@visx/geo';
import { ParentSize } from '@visx/responsive';
import { localPoint } from '@visx/event';
import { useTooltip, TooltipWithBounds } from '@visx/tooltip';
import { feature } from 'topojson-client';
import type { Topology, GeometryCollection } from 'topojson-specification';
import type { FeatureCollection, Geometry } from 'geojson';
import worldTopology from 'world-atlas/countries-110m.json';
import { AFRICA_COUNTRY_IDS, NAMIBIA_ID, DRC_ID } from '@lib/africa-country-ids';
import { COUNTRY_FACTS, type CountryFact } from '@lib/country-facts';

const ANTARCTICA_ID = '010';
const ZOOM_FACTOR = 4;

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

function fillFor(id: string | number | undefined, zoomedIn: boolean): string {
  const key = String(id);
  if (key === NAMIBIA_ID || key === DRC_ID) return zoomedIn ? 'fill-forest' : 'fill-amber';
  if (AFRICA_COUNTRY_IDS.has(key)) return 'fill-amber';
  return 'fill-mist/30';
}

// Homepage decorative map (between the Featured and How-it-works sections):
// world map with Africa highlighted; a "zoom" toggle centers on and
// distinctly re-colors Namibia/DRC, with a hover tooltip on those two
// showing capital/language/currency/population/area (src/lib/country-facts.ts).
export function AfricaMap() {
  const [zoomedIn, setZoomedIn] = useState(false);
  const features = useWorldFeatures();
  const { tooltipOpen, tooltipLeft, tooltipTop, tooltipData, showTooltip, hideTooltip } = useTooltip<CountryFact>();

  return (
    <div className="relative">
      <ParentSize className="h-[420px] w-full">
        {({ width, height }) => {
          if (width === 0) return null;
          const scale = width / 6.3;
          const translate: [number, number] = [width / 2, height / 1.7];

          return (
            <svg width={width} height={height} role="img" aria-label="Map of Africa with Namibia and DR Congo highlighted">
              <Mercator data={features} scale={scale} translate={translate}>
                {(mercator) => {
                  const highlighted = mercator.features.filter(
                    (f) => String(f.feature.id) === NAMIBIA_ID || String(f.feature.id) === DRC_ID,
                  );
                  const cx = highlighted.reduce((sum, f) => sum + f.centroid[0], 0) / (highlighted.length || 1);
                  const cy = highlighted.reduce((sum, f) => sum + f.centroid[1], 0) / (highlighted.length || 1);
                  const k = zoomedIn ? ZOOM_FACTOR : 1;
                  const groupTransform = `translate(${cx * (1 - k)}, ${cy * (1 - k)}) scale(${k})`;

                  return (
                    <g style={{ transform: groupTransform, transformOrigin: '0 0', transition: 'transform 700ms ease-in-out' }}>
                      {mercator.features.map(({ feature: f, path, index }) => {
                        const id = String(f.id);
                        const isHighlightCountry = id === NAMIBIA_ID || id === DRC_ID;
                        const fact = COUNTRY_FACTS[id];
                        return (
                          <path
                            key={`map-feature-${index}`}
                            d={path || ''}
                            vectorEffect="non-scaling-stroke"
                            className={`stroke-bone ${fillFor(f.id, zoomedIn)} ${isHighlightCountry ? 'cursor-pointer' : ''}`}
                            strokeWidth={0.5}
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
                    </g>
                  );
                }}
              </Mercator>
            </svg>
          );
        }}
      </ParentSize>

      <button
        type="button"
        onClick={() => setZoomedIn((z) => !z)}
        className="absolute bottom-3 right-3 rounded-survey border border-rule bg-bone px-3 py-1 text-sm text-ink hover:bg-mist/10"
      >
        {zoomedIn ? 'Zoom out' : 'Zoom into Namibia & DR Congo'}
      </button>

      {tooltipOpen && tooltipData && (
        <TooltipWithBounds left={tooltipLeft} top={tooltipTop} className="!rounded-survey !border !border-rule !bg-navy !text-bone">
          <p className="font-semibold">{tooltipData.name}</p>
          <p className="mt-1 text-xs text-mist">Capital: {tooltipData.capital}</p>
          <p className="text-xs text-mist">Language: {tooltipData.languages}</p>
          <p className="text-xs text-mist">Currency: {tooltipData.currency}</p>
          <p className="text-xs text-mist">Population: {tooltipData.population}</p>
          <p className="text-xs text-mist">Area: {tooltipData.areaKm2}</p>
        </TooltipWithBounds>
      )}
    </div>
  );
}
