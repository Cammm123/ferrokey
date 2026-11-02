# ferrokey

Post-quantum encrypted messages where each person's key has a shape: a ferrofluid
avatar whose spike layout comes from their key and whose look they choose. Cameron's
product, treated as a real one. Private repo `Cammm123/ferrokey`; in Cameron's
starbase workspace it lives at `projects/ferrokey/` (graduated from
`playground/matrix-cipher/` on 2026-11-02). `idea.md` has how it started.

**Rule: no homemade crypto.** All locking and signing goes through vetted libraries
(`@hpke/*`, `@noble/*`). Don't invent constructions; if something new is needed,
follow a published standard and add attack tests for it. See `SECURITY.md`.

## Layout

- `web/`: Next.js 15 app (TypeScript, Vitest). Deploy root on Vercel.
  - `lib/crypto/`: identity (one 32-byte seed → X-Wing, ML-DSA-65, Ed25519 keys),
    `letter.ts` (sign, then lock with HPKE X-Wing), `profile.ts` (signed public profiles),
    `backup.ts` (Argon2id + AES-GCM file), `sign.ts` (hybrid signatures), `encoding.ts`.
  - `lib/keystore.ts`: IndexedDB, seed wrapped by a non-extractable AES key.
  - `lib/avatar/`: `params.ts` (fingerprint → spike layout), `ferrofluid.ts` (three.js renderer).
  - `lib/server/api.ts`: drop/profile request handling (rate limits, burn tokens);
    `app/api/*` are thin wrappers. `lib/store/`: memory store (dev) or Supabase (prod).
  - `app/page.tsx` forge / your key / backup / restore; `app/p/[id]` profile + write;
    `app/m/[id]` read + reply. `components/ui.tsx` is the numbered-line panel style.
  - `middleware.ts`: strict CSP with a per-request nonce. `next.config.ts`: other security headers.
  - `supabase/schema.sql`: tables, RLS (no public access), RPCs, hourly cleanup.
- `prototype/ferrofluid/`: the original single-file shape toy.

## Run

```bash
cd web && npm install && npm test && npm run dev
```

Without Supabase keys the dev server uses an in-memory store. Dev only: add `?slot=b`
to a URL to give that tab a second identity, to test sending between two people.
In starbase, `.claude/launch.json` has `ferrokey` (dev, port 3002) and `ferrokey-prod`
(`next start`, port 3003, after `npm run build`).

## Status (2026-11-02)

- v1 built and tested locally: forge, profile links + QR + share sheet, locked messages
  as drops with expiry and burn-after-reading, verified sender + reply, backup/restore,
  style editing. 32 unit tests (crypto attacks, API, keystore, backup, avatar).
  End-to-end checked in the browser with two identities.
- **Not deployed.** Needs Cameron's one-time setup (below).
- Next ideas: inbox of received messages on the device, contact list ("saved ids"),
  attachments, a drop API rate limit that doesn't rely on IPs alone.

## Connect Supabase and Vercel (Cameron, one time)

1. supabase.com → New project `ferrokey` (US East). Save the DB password in a password manager.
2. Database → Extensions: enable `pg_cron`. Then SQL Editor → paste and run `web/supabase/schema.sql`.
3. Project Settings → API: copy the project URL and the `service_role` key (secret).
4. vercel.com → Add New → Project → import `Cammm123/ferrokey`, root directory `web`.
5. Environment variables: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `RATE_SALT`
   (any long random string). Deploy.
6. Tell Claude the URL; it will run the two-identity check against the live site.
