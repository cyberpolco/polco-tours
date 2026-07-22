import { Receiver } from '@upstash/qstash';

/**
 * Real QStash-backed scheduled jobs (DR-067) -- env-gated behind
 * QSTASH_CURRENT_SIGNING_KEY/QSTASH_NEXT_SIGNING_KEY (OI-11, no account
 * provisioned yet). Same "real adapter, graceful degradation" precedent as
 * the notification gateways (DR-013) and Upstash Redis rate limiting
 * (DR-066, charter rule 8) -- but unlike those, there is no safe fallback
 * BEHAVIOR for an unsigned request to a bulk-mutation job route (unlike a
 * notification send failing silently, or a rate limit degrading to its
 * pre-existing counter), so "unconfigured" here means the route rejects
 * every request rather than skipping verification.
 *
 * Deliberately does NOT use @upstash/qstash/nextjs's verifySignatureAppRouter
 * -- that wrapper throws synchronously (at handler-wrap time, i.e. module
 * load) when the signing key env vars are absent, which would crash this
 * route's module for every request instead of degrading gracefully. Using
 * the lower-level Receiver class directly lets the route check
 * configuration explicitly and return a clean, un-thrown 503 instead.
 */
export function isQstashConfigured(): boolean {
  return Boolean(process.env.QSTASH_CURRENT_SIGNING_KEY && process.env.QSTASH_NEXT_SIGNING_KEY);
}

/**
 * Verifies a request actually came from QStash. Returns false (never
 * throws) on a missing signature, missing signing keys, or an invalid
 * signature -- callers should respond 401 either way, never revealing
 * which check failed.
 */
export async function verifyQstashSignature(signature: string | null, body: string): Promise<boolean> {
  const currentSigningKey = process.env.QSTASH_CURRENT_SIGNING_KEY;
  const nextSigningKey = process.env.QSTASH_NEXT_SIGNING_KEY;
  if (!signature || !currentSigningKey || !nextSigningKey) return false;

  const receiver = new Receiver({ currentSigningKey, nextSigningKey });
  try {
    return await receiver.verify({ signature, body });
  } catch {
    return false;
  }
}
