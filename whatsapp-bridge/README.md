# POLCO WhatsApp bridge (DR-258)

> **Status (2026-09-06):** live at `https://polco-whatsapp-bridge.fly.dev`
> (Fly.io, `fra` region), paired to a real dedicated business number
> (OI-21/OI-22 resolved). `WHATSAPP_BRIDGE_URL`/`WHATSAPP_BRIDGE_SECRET` are
> set in Vercel Production + Preview and local `.env`.

A small always-on process that holds a [Baileys](https://github.com/WhiskeySockets/Baileys)
WhatsApp Web session open and exposes it as a plain HTTP API, so the main
Next.js app's `notifications` module can send WhatsApp messages without
itself holding a WebSocket connection.

## Why this is a separate deployable

Baileys pairs with a real WhatsApp account (via QR code, like WhatsApp Web)
and keeps a persistent WebSocket connection open to WhatsApp's servers. A
Vercel serverless function cannot hold a connection like that open between
requests, so this can't live inside the main app or be deployed to Vercel —
it needs its own always-on host (a small VPS, a Fly.io/Railway app, a Docker
container, etc.).

## Important: this is an unofficial client, not the WhatsApp Business API

Baileys automates a regular WhatsApp account by reverse-engineering the
WhatsApp Web protocol — it is **not** Meta's official WhatsApp Business
Platform. Number-ban risk is real. Use a dedicated business phone number for
this (never a personal one, never a number anyone still needs day-to-day),
and treat pairing/backups accordingly. See `docs/decisions/DECISION_LOG.md`
DR-258 for the tradeoffs against the previously-planned WhatsApp Cloud API
(OI-06).

## Setup

```bash
cd whatsapp-bridge
npm install
cp .env.example .env   # set WHATSAPP_BRIDGE_SECRET to a long random value
npm start
```

On first run it prints a QR code to the terminal — scan it from the
dedicated WhatsApp account's app (**Linked Devices → Link a Device**). The
paired session is persisted to `WHATSAPP_BRIDGE_AUTH_DIR` (default
`./auth_info`, gitignored) so it survives restarts; back that directory up,
since losing it means re-pairing.

## Deploying

Deploy this directory to any always-on Node host as a long-running process
(`npm start`, or the compiled `node dist/index.js` after `npm run build` —
see `Dockerfile`), not a serverless/on-demand one. Whatever host you pick:

- Persist `WHATSAPP_BRIDGE_AUTH_DIR` across restarts/redeploys (a volume, not
  ephemeral container storage), or every deploy will require re-pairing.
- Disable any scale-to-zero/idle-sleep behavior — Baileys needs its
  WebSocket held open continuously, not woken up per-request.
- Put it on a private network, or firewall it to only accept traffic from
  the Vercel app — the only access control this bridge has is the shared
  `WHATSAPP_BRIDGE_SECRET`, and this is a service that can send messages as
  a real WhatsApp number.
- Point the main app's `WHATSAPP_BRIDGE_URL` env var (Vercel Production +
  Preview, plus local `.env`) at this service's reachable HTTPS URL, and set
  the matching `WHATSAPP_BRIDGE_SECRET` on both sides.

### Deploying to Fly.io

```bash
curl -L https://fly.io/install.sh | sh   # if flyctl isn't installed yet
fly auth login                            # opens a browser -- run this yourself

cd whatsapp-bridge
fly apps create <your-app-name>           # pick a globally-unique name
# edit fly.toml: set app = "<your-app-name>" (already scaffolded otherwise)

fly volumes create whatsapp_auth --region fra --size 1
fly secrets set WHATSAPP_BRIDGE_SECRET="$(openssl rand -base64 32)"

fly deploy --remote-only                  # builds on Fly's builder, not your machine
fly logs                                  # confirm it started and is listening
```

Then pair (see below), and point the main app's `WHATSAPP_BRIDGE_URL` at
`https://<your-app-name>.fly.dev` with the matching
`WHATSAPP_BRIDGE_SECRET` (`fly secrets set` doesn't print the value back —
copy it from your own `openssl rand` output before running that command).

## Pairing (QR code)

On a headless host, reading an ASCII QR code out of a log stream is
unreliable — use the browser-based `/qr` endpoint instead:

1. Deploy/start the bridge with no existing `auth_info` (a fresh pairing).
2. Open `https://<your-bridge-host>/qr?secret=<WHATSAPP_BRIDGE_SECRET>` in a
   browser — it returns a scannable QR code as a PNG image.
3. Scan it from the dedicated business number's WhatsApp app: **Linked
   Devices → Link a Device**.
4. Reload `/health` (or check `fly logs`) — `connected: true` means pairing
   succeeded. `/qr` itself starts returning 404 once connected (no QR
   pending), and again if the session is ever lost and needs re-pairing.

The QR rotates periodically until scanned; just reload `/qr` if it expires
before you get to it. `GET /qr` is unauthenticated apart from the query-param
secret (a browser GET can't send a custom header), so treat that URL itself
as sensitive — it's a live invitation to link a device to this account.

**If the phone shows "Can't link new devices right now" instead of pairing**:
this is WhatsApp's own restriction, not something the bridge logs an error
for (check with `fly logs` / your host's logs — a clean pairing attempt with
no rejection there means the account genuinely refused it). Real observed
cause on 2026-09-06: generating and scanning several QR codes back-to-back
while testing tripped a short-lived throttle — waiting a few minutes and
trying exactly one fresh QR scan resolved it. Before assuming that, rule out
the two more common causes: the account already has 4 linked devices
(**Settings → Linked Devices**, unlink an unused one), or it's a very
recently registered number still under WhatsApp's own new-account cooldown.

## API

- `GET /health` → `{ ok: true, connected: boolean }` — no auth required.
- `GET /qr?secret=<WHATSAPP_BRIDGE_SECRET>` → a PNG QR code while a pairing
  is pending, 404 once connected or before the first QR has been generated.
- `POST /send` (`Authorization: Bearer <WHATSAPP_BRIDGE_SECRET>`) → body
  `{ "to": "+264811234567", "message": "...", "document"?: { "filename":
  "invoice.pdf", "mimeType": "application/pdf", "contentBase64": "..." } }`.
  With no `document`, sends a plain text message. With one (DR-259 —
  the main app only ever sends one, a PDF), sends it as a WhatsApp document
  message with `message` as its caption instead. Returns `{ "id": "..." }`
  on success. Non-2xx on any failure (unauthorized, not connected, send
  error) — the main app's gateway treats that as a normal `WhatsApp` channel
  failure and falls through to SMS → email, same as any other outage
  (charter rule 8).
