// In-memory per-reference lockout for the public lookup. Resets when the server restarts.
// Keys are whatever reference string was submitted (real or not), so a lock reveals nothing.
const MAX_FAILURES = 5;
const LOCK_MS = 15 * 60 * 1000;
const MAX_ENTRIES = 10000;

const entries = new Map(); // key -> { count, until }

function prune(now) {
  for (const [key, e] of entries) if (e.until <= now) entries.delete(key);
}

exports.isLocked = (key) => {
  const e = entries.get(key);
  return Boolean(e && e.count >= MAX_FAILURES && e.until > Date.now());
};

exports.recordFailure = (key) => {
  const now = Date.now();
  let e = entries.get(key);
  if (!e || e.until <= now) {
    entries.delete(key);
    if (entries.size >= MAX_ENTRIES) prune(now);
    while (entries.size >= MAX_ENTRIES) entries.delete(entries.keys().next().value); // oldest first
    e = { count: 0, until: now + LOCK_MS };
  }
  e.count += 1;
  if (e.count >= MAX_FAILURES) e.until = now + LOCK_MS; // lock runs 15 min from the 5th failure
  entries.set(key, e);
};

exports.clear = (key) => entries.delete(key);