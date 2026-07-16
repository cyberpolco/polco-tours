import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { authService, type AuthContext } from '@modules/auth';
import { ApiError, Errors, problemResponse } from './errors';
import { logger, newTraceId } from './logger';
import { assertCan, type Permission } from './rbac';

/**
 * Wraps a /api/v1 route handler with the standard actor-resolution +
 * permission gate + error-translation pipeline (Vol. 5/7). `withOrg` is
 * deliberately NOT called here -- it stays inside each module's repository;
 * this guard only resolves who is calling and whether they may call at all.
 */
export function withAuth<P = Record<string, string>>(
  permission: Permission,
  handler: (ctx: AuthContext, req: NextRequest, params: P) => Promise<NextResponse>,
) {
  return async (req: NextRequest, routeCtx: { params: Promise<P> }): Promise<NextResponse> => {
    const traceId = req.headers.get('x-trace-id') ?? newTraceId();
    try {
      const ctx = await authService.resolveSession(req.headers);

      try {
        assertCan(ctx, permission);
      } catch {
        // rbac.ts throws a bare Error to stay framework-free; translate here.
        throw Errors.forbidden(`${ctx.roles.join('+')} lacks ${permission}`);
      }

      const params = await routeCtx.params;
      return await handler(ctx, req, params);
    } catch (err) {
      if (err instanceof ApiError) return problemResponse(err, { traceId });
      if (err instanceof ZodError) return problemResponse(Errors.validation(err.message), { traceId });
      // Unhandled/unexpected -- never leak internals, but do log for
      // observability (Vol. 9 §9.2); no PII in log lines.
      logger(traceId).error('unhandled route error', {
        message: err instanceof Error ? err.message : String(err),
      });
      return problemResponse(Errors.internal(), { traceId });
    }
  };
}
