const crypto = require('crypto');

// Random, non-sequential reference numbers (10 characters, e.g. "K7M2QX9PAD").
// The alphabet leaves out characters that look alike (0/O, 1/I/L) so numbers are easy to read
// out loud and copy by hand. 31 characters ^ 10 positions is about 8 x 10^14 combinations,
// so guessing someone else's number is impractical (the lookup also needs a birth date and is
// rate limited). crypto.randomInt is a secure random source, unlike Math.random.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const LENGTH = 10;

function generateReferenceNo() {
  let out = '';
  for (let i = 0; i < LENGTH; i++) {
    out += ALPHABET[crypto.randomInt(ALPHABET.length)];
  }
  return out;
}

module.exports = { generateReferenceNo };