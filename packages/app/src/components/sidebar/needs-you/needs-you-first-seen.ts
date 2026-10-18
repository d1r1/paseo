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

/** The shared first-seen record, reconciled to the keys of every hook that reads it. */
export interface FirstSeenStore {
  subscribe(listener: () => void): () => void;
  get(): ReadonlyMap<string, number>;
  /** Sets the keys `owner` sees now. */
  record(owner: symbol, keys: readonly string[]): void;
  /** Forgets `owner`'s keys when it unmounts. */
  release(owner: symbol): void;
}

/**
 * Each mounted user of the record (the section, the badge) may see a different set of rows for a
 * moment, since each reads the board on its own. Reconciling to one user's keys would drop the
 * other's and the two would rewrite the record in turn forever, so the record follows the union
 * of every owner's keys: a key is dropped only once no owner sees it.
 */
export function createFirstSeenStore(clock: () => number = Date.now): FirstSeenStore {
  let seen: ReadonlyMap<string, number> = new Map();
  const keysByOwner = new Map<symbol, readonly string[]>();
  const listeners = new Set<() => void>();

  function reconcile(): void {
    const keys: string[] = [];
    for (const ownerKeys of keysByOwner.values()) keys.push(...ownerKeys);
    const next = reconcileFirstSeen(seen, keys, clock());
    if (next === seen) return;
    seen = next;
    for (const listener of listeners) listener();
  }

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    get: () => seen,
    record(owner, keys) {
      keysByOwner.set(owner, keys);
      reconcile();
    },
    release(owner) {
      if (!keysByOwner.delete(owner)) return;
      reconcile();
    },
  };
}
