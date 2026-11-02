# ferrokey security notes

## What protects a message

- **Locking:** HPKE (RFC 9180) base mode with the X-Wing hybrid KEM (ML-KEM-768 + X25519),
  HKDF-SHA256 and AES-256-GCM (`@hpke/core`, `@hpke/hybridkem-x-wing`). An attacker has to
  break both ML-KEM and X25519 to read a message, including with a future quantum computer.
- **Signing:** every message and profile is signed with ML-DSA-65 *and* Ed25519
  (`@noble/post-quantum`, `@noble/curves`); both must verify. Signatures are labeled by
  purpose (letter vs profile) so one can't be passed off as the other.
- **Recipient binding:** the sender signs the recipient's fingerprint, then locks. A
  recipient can't re-lock a signed message to a third person as if it were written to them.
- **Profiles are self-certifying:** a profile link holds the first 128 bits of the hash of
  the public keys. Browsers re-hash what the server returns, so the server can't swap keys.
- **Keys on the device:** the 32-byte seed is stored in IndexedDB encrypted under a
  non-extractable WebCrypto key. Backups use Argon2id (64 MiB, 3 passes) + AES-256-GCM.
- **Burn after reading:** the delete token is sealed inside the message; the server stores
  only its hash, so only the recipient can delete a drop.
- **The page:** strict CSP with a per-request nonce, no third-party scripts, fonts or
  requests; `Referrer-Policy: no-referrer`; framing denied.

## What the server can see

Drop sizes, creation and expiry times, which IP-hash created a drop and when it was
fetched, and public profiles (public keys + avatar style). It can't read messages or see
who sent a drop (the sender's identity is inside the locked part).

## Known limits (v1)

- **No forward secrecy.** If someone steals your seed, they can read every unexpired
  message sent to you. (Fix later: rotating prekeys, as in Signal.)
- **Trust in the site's code.** A web app is only as safe as the code the server sends.
  If the site were hacked, it could serve code that leaks keys. A browser extension or
  native app with pinned code would close this gap.
- **The avatar is a hint, not proof.** Someone can make a similar-looking shape. Compare
  the ID (26 characters) in person or on a call when it matters.
- **Rate limits use IP hashes**, which shared networks and VPNs can skew.
- **Library audits:** `@noble/curves` and `@noble/hashes` have public audits.
  `@noble/post-quantum` and `@hpke/*` are widely used but check their current audit status
  before a public launch. `@hpke/core` 1.9.0's one-shot `suite.seal/open` didn't round-trip
  in testing, so the code uses the context API (`createSenderContext`), which does.
- **Anyone with your profile link can write to you.** There's no blocking yet.
