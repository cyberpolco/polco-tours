import { NextResponse } from 'next/server';

// Liveness/readiness probe used by uptime monitors (Vol. 9 §9.2).
// Node runtime: reads env + can be extended to ping the DB.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json({
    status: 'ok',
    service: 'polco-tours',
    version: process.env.npm_package_version ?? '0.1.0',
    commit: process.env.VERCEL_GIT_COMMIT_SHA ?? 'local',
    time: new Date().toISOString(),
  });
}
