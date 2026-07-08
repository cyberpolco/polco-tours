import { NextResponse } from 'next/server';

/**
 * Standardized error responses in RFC 9457 (problem+json) form — the single
 * error contract for every /api/v1 endpoint (Vol. 7 §7.1). Internals such as
 * stack traces never leak to clients (Vol. 8, A05).
 */
export interface Problem {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  traceId?: string;
}

const BASE = 'https://api.polcotours.com/problems';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly slug: string,
    readonly title: string,
    readonly detail?: string,
  ) {
    super(detail ?? title);
    this.name = 'ApiError';
  }
}

// Common, reusable errors — extend as endpoints are added.
export const Errors = {
  unauthorized: (detail?: string) =>
    new ApiError(401, 'unauthorized', 'Authentication required', detail),
  forbidden: (detail?: string) =>
    new ApiError(403, 'forbidden', 'You do not have permission to do this', detail),
  notFound: (detail?: string) =>
    new ApiError(404, 'not-found', 'Resource not found', detail),
  validation: (detail?: string) =>
    new ApiError(422, 'validation-failed', 'The request failed validation', detail),
  conflict: (detail?: string) => new ApiError(409, 'conflict', 'Conflict', detail),
  rateLimited: (detail?: string) =>
    new ApiError(429, 'rate-limited', 'Too many requests', detail),
  // Deliberately no `detail` param -- an unhandled/unexpected error must never
  // leak internals or a stack trace to the client (Vol. 8, A05).
  internal: () => new ApiError(500, 'internal', 'Something went wrong'),
} as const;

export function problemResponse(err: ApiError, opts?: { instance?: string; traceId?: string }) {
  const body: Problem = {
    type: `${BASE}/${err.slug}`,
    title: err.title,
    status: err.status,
    detail: err.detail,
    instance: opts?.instance,
    traceId: opts?.traceId,
  };
  return NextResponse.json(body, {
    status: err.status,
    headers: { 'Content-Type': 'application/problem+json' },
  });
}
