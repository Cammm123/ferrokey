# matrix-cipher

Idea (2026-10-28, from 21-241): encrypt a message with a linear transformation.
Write the message as vectors, multiply by a secret invertible matrix $A$, publish
the result. Only the holder of $A$ can undo it with $A^{-1}$.

## Questions to work through

- The key is the whole matrix $A$, not its determinant. Many matrices share a
  determinant; $\det A \neq 0$ only guarantees $A^{-1}$ exists.
- Why is plain $Ax$ weak? With $n$ known (message, ciphertext) pairs an attacker
  solves $AX = Y$ for $A$ (known-plaintext attack). This is the classic Hill cipher.
- Circle -> ellipse (2026-11-01): the ellipse's axes show which directions $A$
  stretches and by how much (its SVD), so a published shape leaks most of the key.
  The message must be the vectors, not the shape. $A$ and $A^{-1}$ hold the same
  secret, so this is shared-key, not public-key.
- Encrypting $e_1, \dots, e_n$ gives the columns of $A$ directly; linearity also
  means sums of messages encrypt to sums of ciphertexts.
- Over the reals, rounding errors break decryption; work mod a prime instead.
- The modern fix: add small random noise, $b = As + e$. Removing the noise without
  the key is believed hard (Learning With Errors, the basis of post-quantum
  crypto like Kyber/ML-KEM).

## Product vision (2026-11-01)

Each user molds a personal 3D shape with ferrofluid-like dynamics (spiky, round,
anything): their avatar and their key, used to send messages.

Design notes so far:
- Mod-p arithmetic has no geometry, so the shape can't literally be the matrix.
  It's the interface: the shape is drawn from the key (or molding feeds the key's
  randomness), not read back from the shape each time.
- Public-key split fits: secret key stays on the device, public key is shared, and
  the avatar is a visual fingerprint of the public key (like SSH randomart), safe
  to show anyone.
- Hand-molded shapes alone have too little randomness and can't be reproduced
  exactly; mix with a real random generator.

## Plan

1. Build a Hill cipher in Python (mod 26 or mod a prime): encrypt, decrypt.
2. Break it with a known-plaintext attack using linear algebra.
3. Toy LWE scheme; try the same attack and see why it fails.

Not started. No code yet.
