/**
 * Minimal structured logger. Every log line carries a traceId so requests can
 * be correlated across Sentry/Axiom (Vol. 9 §9.2). No PII in logs (Vol. 8).
 */
type Level = 'debug' | 'info' | 'warn' | 'error';

function emit(level: Level, traceId: string, msg: string, meta?: Record<string, unknown>) {
  const line = JSON.stringify({ t: new Date().toISOString(), level, traceId, msg, ...meta });
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export function logger(traceId: string) {
  return {
    debug: (msg: string, meta?: Record<string, unknown>) => emit('debug', traceId, msg, meta),
    info: (msg: string, meta?: Record<string, unknown>) => emit('info', traceId, msg, meta),
    warn: (msg: string, meta?: Record<string, unknown>) => emit('warn', traceId, msg, meta),
    error: (msg: string, meta?: Record<string, unknown>) => emit('error', traceId, msg, meta),
  };
}

export function newTraceId(): string {
  return `req_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
}
