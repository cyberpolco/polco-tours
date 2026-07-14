'use client';

import { useEffect, useMemo, useRef } from 'react';
import { ParentSize } from '@visx/responsive';
import { geoOrthographic, geoDistance, geoContains } from 'd3-geo';
import { feature } from 'topojson-client';
import type { Topology, GeometryCollection } from 'topojson-specification';
import type { FeatureCollection, Geometry } from 'geojson';
import worldLandTopology from 'world-atlas/land-110m.json';
import worldCountriesTopology from 'world-atlas/countries-110m.json';
import { NAMIBIA_ID, DRC_ID, ZIMBABWE_ID } from '@lib/africa-country-ids';

const HIGHLIGHT_IDS: ReadonlySet<string> = new Set([NAMIBIA_ID, DRC_ID, ZIMBABWE_ID]);
const GRID_STEP_DEG = 4;
const ROTATION_DEG_PER_SEC = 8;
const AXIAL_TILT_DEG = -18;
const HIGHLIGHT_COLOR = '#C97B2D'; // amber
const LAND_DOT_COLOR = 'rgba(42, 47, 56, 0.45)'; // ink

interface LandPoint {
  lon: number;
  lat: number;
  highlighted: boolean;
}

// Samples the sphere every GRID_STEP_DEG, thinning longitude steps near the
// poles (1 / cos(lat)) so dot density stays visually even instead of
// clumping at the top/bottom of a naive lat/lon grid. Runs once (useMemo) --
// only the projection/rotation changes per animation frame, not this list.
function buildLandPoints(): LandPoint[] {
  const landTopology = worldLandTopology as unknown as Topology<{ land: GeometryCollection }>;
  const land = feature(landTopology, landTopology.objects.land) as unknown as FeatureCollection<Geometry>;
  const landFeature = land.features[0];
  if (!landFeature) return [];

  const countriesTopology = worldCountriesTopology as unknown as Topology<{ countries: GeometryCollection }>;
  const countries = feature(countriesTopology, countriesTopology.objects.countries) as unknown as FeatureCollection<Geometry>;
  const highlightFeatures = countries.features.filter((f) => HIGHLIGHT_IDS.has(String(f.id)));

  const points: LandPoint[] = [];
  for (let lat = -88; lat <= 88; lat += GRID_STEP_DEG) {
    const lonStep = Math.min(GRID_STEP_DEG / Math.cos((lat * Math.PI) / 180), 30);
    for (let lon = -180; lon < 180; lon += lonStep) {
      const point: [number, number] = [lon, lat];
      if (!geoContains(landFeature, point)) continue;
      points.push({ lon, lat, highlighted: highlightFeatures.some((f) => geoContains(f, point)) });
    }
  }
  return points;
}

function GlobeCanvas({ width, height }: { width: number; height: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const points = useMemo(buildLandPoints, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || width === 0 || height === 0) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    const radius = Math.min(width, height) / 2 - 8;
    const cx = width / 2;
    const cy = height / 2;
    const projection = geoOrthographic().scale(radius).translate([cx, cy]);

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let lambda = -20; // starting yaw, roughly centered on Africa
    let lastTime: number | null = null;
    let frame: number;

    function draw(time: number) {
      if (lastTime === null) lastTime = time;
      const dt = (time - lastTime) / 1000;
      lastTime = time;
      if (!reduceMotion) lambda += ROTATION_DEG_PER_SEC * dt;

      projection.rotate([lambda, AXIAL_TILT_DEG]);
      // The point facing the viewer sits at (-lambda, -tilt); anything more
      // than 90deg away is on the far side of the sphere and must be culled
      // by hand -- projection(point) has no built-in backface clipping.
      const center: [number, number] = [-lambda, -AXIAL_TILT_DEG];

      ctx!.clearRect(0, 0, width, height);
      ctx!.beginPath();
      ctx!.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx!.strokeStyle = 'rgba(138, 147, 161, 0.3)';
      ctx!.lineWidth = 1;
      ctx!.stroke();

      for (const point of points) {
        if (geoDistance([point.lon, point.lat], center) > Math.PI / 2) continue;
        const projected = projection([point.lon, point.lat]);
        if (!projected) continue;
        const [x, y] = projected;
        ctx!.beginPath();
        ctx!.arc(x, y, point.highlighted ? 2.2 : 1.2, 0, Math.PI * 2);
        ctx!.fillStyle = point.highlighted ? HIGHLIGHT_COLOR : LAND_DOT_COLOR;
        ctx!.fill();
      }

      if (!reduceMotion) frame = requestAnimationFrame(draw);
    }

    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [points, width, height]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width, height }}
      role="img"
      aria-label="Rotating dotted world map with Namibia, DR Congo, and Zimbabwe highlighted"
    />
  );
}

// Homepage decorative globe (between Hero and Featured): a dot-matrix world
// map on an auto-rotating orthographic projection. Built directly on
// d3-geo -- the engine @visx/geo's own projection components already wrap --
// because plotting thousands of individual lat/lon dots needs the raw
// projection + point-in-polygon primitives, not @visx/geo's path-feature
// rendering (which draws whole country outlines, as AfricaMap.tsx does).
export function WorldDotGlobe() {
  return (
    <div className="flex justify-center">
      {/* ParentSize's own wrapper div defaults to an inline style height:100%,
          which beats a Tailwind height class on ParentSize itself (inline
          styles win over classes) -- pass `style` so our height actually
          applies instead of collapsing to 0 against this non-flow parent. */}
      <ParentSize style={{ height: 360 }} className="w-full max-w-[360px]">
        {({ width, height }) => (width === 0 || height === 0 ? null : <GlobeCanvas width={width} height={height} />)}
      </ParentSize>
    </div>
  );
}
