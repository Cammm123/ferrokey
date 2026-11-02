# ferrokey

Post-quantum encrypted messages with a personal ferrofluid avatar.

Every person forges a key in their browser. Its public half is drawn as a ferrofluid
shape (spike layout from the key, style chosen by the owner), so you can recognize who
you're writing to. Messages are locked in the browser with standard cryptography
(HPKE with the X-Wing hybrid KEM, ML-KEM-768 + X25519; ML-DSA-65 + Ed25519 signatures)
and stored on the server only as scrambled "drops" behind short links.

- `web/`: the Next.js app (see `web/README` section in `CLAUDE.md` for running it).
- `prototype/ferrofluid/`: the original single-file shape toy.
- `idea.md`: how the idea started (matrix encryption, Hill cipher, LWE).
- `SECURITY.md`: threat model and known limits.
