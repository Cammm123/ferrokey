# ferrokey

Post-quantum encrypted messages with a personal ferrofluid avatar.

Every person forges a key in their browser. Its public half is drawn as a ferrofluid
shape (spike layout from the key, style chosen by the owner), so you can recognize who
you're writing to. Messages are locked in the browser with standard cryptography
(HPKE with the X-Wing hybrid KEM, ML-KEM-768 + X25519; ML-DSA-65 + Ed25519 signatures)
and stored on the server only as scrambled "drops" behind short links.

- `web/`: the Next.js app. Run: `cd web && npm install && npm test && npm run dev`.
- `prototype/ferrofluid/`: the original single-file shape toy.
- `idea.md`: how the idea started (matrix encryption, Hill cipher, LWE).
- `SECURITY.md`: threat model, known limits, and how to report a vulnerability.

## License

ferrokey is free software under the GNU Affero General Public License v3.0 or later
(`LICENSE`). If you run a modified copy as a public service, you must share its source
with its users.
