const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const ROUNDS = 10;

// 6 digits, uniformly random, leading zeros kept ("004821").
const generatePin = () => String(crypto.randomInt(0, 1000000)).padStart(6, '0');

const hashPin = (pin) => bcrypt.hash(pin, ROUNDS);

// Same cost as real hashes, so a compare against it takes as long as a real one.
const DUMMY_HASH = bcrypt.hashSync(crypto.randomBytes(16).toString('hex'), ROUNDS);

// Always performs one bcrypt compare; false when there is no stored hash.
async function verifyPin(pin, hash) {
  const matches = await bcrypt.compare(pin, hash || DUMMY_HASH);
  return Boolean(hash) && matches;
}

module.exports = { generatePin, hashPin, verifyPin };