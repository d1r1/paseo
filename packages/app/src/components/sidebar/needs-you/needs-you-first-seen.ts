/**
 * The client's record of when it first saw each Needs-you row waiting, keyed by row key.
 *
 * A key keeps its first time while it stays in `keys`, is dropped when it leaves (the wait is
 * over), and a key that comes back is a new wait with a new time. Returns `previous` itself when
 * nothing changed, so a state holding the map does not re-render for a no-op.
 */
export function reconcileFirstSeen(
  previous: ReadonlyMap<string, number>,
  keys: Iterable<string>,
  now: number,
): ReadonlyMap<string, number> {
  const current = new Set(keys);
  let changed = current.size !== previous.size;
  const next = new Map<string, number>();
  for (const key of current) {
    const seenAt = previous.get(key);
    if (seenAt === undefined) changed = true;
    next.set(key, seenAt ?? now);
  }
  return changed ? next : previous;
}
