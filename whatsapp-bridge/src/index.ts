// POLCO TOURS WhatsApp bridge (DR-258) -- a small always-on process that
// holds a Baileys WhatsApp Web session open and exposes it as a plain HTTP
// API. This exists as its own deployable, separate from the Next.js app,
// because Baileys needs a persistent WebSocket connection to WhatsApp's
// servers -- something a Vercel serverless function cannot hold open.
// Deploy it to any always-on host (small VPS, Fly.io, Railway, a Docker
// container) -- see README.md. Never import this package from the Next.js
// app; the two talk over HTTP only.
import { Boom } from '@hapi/boom';
import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
  type WASocket,
} from 'baileys';
import * as http from 'node:http';
import * as crypto from 'node:crypto';
import pino from 'pino';
import qrcode from 'qrcode';
import qrcodeTerminal from 'qrcode-terminal';

const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });

const PORT = Number(process.env.WHATSAPP_BRIDGE_PORT ?? 8787);
const AUTH_DIR = process.env.WHATSAPP_BRIDGE_AUTH_DIR ?? './auth_info';
// Shared secret the Next.js app authenticates with (Authorization: Bearer
// <secret>) -- this bridge has no other access control, so it must never be
// exposed on a public port with no secret set, and ideally sits behind a
// private network / firewall rather than a public IP at all.
const SHARED_SECRET = process.env.WHATSAPP_BRIDGE_SECRET;
if (!SHARED_SECRET) {
  logger.error('WHATSAPP_BRIDGE_SECRET is not set -- refusing to start with an unauthenticated API.');
  process.exit(1);
}

let sock: WASocket | undefined;
let isConnected = false;
// The QR code currently awaiting a scan, if any -- cleared once paired.
// Baileys rotates it periodically until scanned, so /qr always serves the
// latest one. Console printing (below) is a fallback for local pairing;
// GET /qr is the primary path on a headless host, since reading a QR out of
// a remote log stream is unreliable.
let latestQr: string | undefined;

async function connect(): Promise<void> {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    auth: state,
    logger,
    // This bridge only ever sends outbound notifications; it doesn't need
    // to sync/store the paired account's message history.
    syncFullHistory: false,
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      latestQr = qr;
      logger.info('New QR code ready -- open GET /qr?secret=<WHATSAPP_BRIDGE_SECRET> in a browser to scan it.');
      qrcodeTerminal.generate(qr, { small: true });
    }

    if (connection === 'open') {
      isConnected = true;
      latestQr = undefined;
      logger.info('WhatsApp bridge connected.');
    }

    if (connection === 'close') {
      isConnected = false;
      const statusCode = (lastDisconnect?.error as Boom | undefined)?.output?.statusCode;
      const loggedOut = statusCode === DisconnectReason.loggedOut;
      logger.warn({ statusCode, loggedOut }, 'WhatsApp bridge connection closed.');
      if (loggedOut) {
        logger.error(
          `Session logged out (paired device removed on the phone, or banned) -- delete ${AUTH_DIR} and re-pair via QR. Not reconnecting automatically.`,
        );
        return;
      }
      // Any other close reason (network blip, restart, etc.) is safe to
      // retry -- reconnect rather than exit, matching the "must not crash
      // the system" charter rule for third-party integrations.
      void connect();
    }
  });
}

function toWhatsAppJid(to: string): string {
  const digits = to.replace(/[^0-9]/g, '');
  return `${digits}@s.whatsapp.net`;
}

function timingSafeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function isAuthorized(req: http.IncomingMessage): boolean {
  const header = req.headers.authorization ?? '';
  const [scheme, token] = header.split(' ');
  return scheme === 'Bearer' && !!token && timingSafeEqual(token, SHARED_SECRET as string);
}

// GET /qr is opened directly in a browser (pairing is a one-time, by-hand
// step), so it authenticates via a query param rather than a header.
function isAuthorizedByQuery(url: URL): boolean {
  const token = url.searchParams.get('secret');
  return !!token && timingSafeEqual(token, SHARED_SECRET as string);
}

// DR-259: a base64-encoded PDF attachment (invoice/receipt) can run to a
// few MB once inflated by ~33% over its raw size -- large enough that the
// original 16KB (text-only) cap needed raising.
const MAX_BODY_BYTES = 16 * 1024 * 1024;

function readJsonBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {});
      } catch {
        reject(new Error('invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) });
  res.end(payload);
}

const server = http.createServer((req, res) => {
  void (async () => {
    const url = new URL(req.url ?? '/', 'http://internal');

    if (req.method === 'GET' && url.pathname === '/health') {
      sendJson(res, 200, { ok: true, connected: isConnected });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/qr') {
      if (!isAuthorizedByQuery(url)) {
        sendJson(res, 401, { error: 'unauthorized' });
        return;
      }
      if (isConnected || !latestQr) {
        sendJson(res, 404, { error: isConnected ? 'already connected -- no QR pending' : 'no QR pending yet, try again shortly' });
        return;
      }
      const png = await qrcode.toBuffer(latestQr, { type: 'png', width: 400 });
      res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': png.length, 'Cache-Control': 'no-store' });
      res.end(png);
      return;
    }

    if (req.method === 'POST' && url.pathname === '/send') {
      if (!isAuthorized(req)) {
        sendJson(res, 401, { error: 'unauthorized' });
        return;
      }
      if (!sock || !isConnected) {
        sendJson(res, 503, { error: 'whatsapp bridge not connected' });
        return;
      }

      let body: {
        to?: unknown;
        message?: unknown;
        // DR-259: an optional single document (the main app only ever sends
        // one -- an invoice/receipt PDF), sent as a WhatsApp document
        // message with `message` as its caption instead of a plain text one.
        document?: { filename?: unknown; mimeType?: unknown; contentBase64?: unknown };
      };
      try {
        body = (await readJsonBody(req)) as typeof body;
      } catch (err) {
        sendJson(res, 400, { error: err instanceof Error ? err.message : 'invalid request body' });
        return;
      }

      if (typeof body.to !== 'string' || !body.to.trim() || typeof body.message !== 'string' || !body.message) {
        sendJson(res, 400, { error: '"to" and "message" are required strings' });
        return;
      }

      let document: { filename: string; mimeType: string; content: Buffer } | undefined;
      if (body.document !== undefined) {
        const { filename, mimeType, contentBase64 } = body.document;
        if (typeof filename !== 'string' || typeof mimeType !== 'string' || typeof contentBase64 !== 'string') {
          sendJson(res, 400, { error: 'document.filename, document.mimeType and document.contentBase64 must all be strings' });
          return;
        }
        document = { filename, mimeType, content: Buffer.from(contentBase64, 'base64') };
      }

      try {
        const result = document
          ? await sock.sendMessage(toWhatsAppJid(body.to), {
              document: document.content,
              mimetype: document.mimeType,
              fileName: document.filename,
              caption: body.message,
            })
          : await sock.sendMessage(toWhatsAppJid(body.to), { text: body.message });
        sendJson(res, 200, { id: result?.key?.id ?? 'unknown' });
      } catch (err) {
        logger.error({ err }, 'WhatsApp send failed');
        sendJson(res, 502, { error: 'send failed' });
      }
      return;
    }

    sendJson(res, 404, { error: 'not found' });
  })();
});

server.listen(PORT, () => {
  logger.info(`WhatsApp bridge listening on :${PORT}`);
});

void connect();
