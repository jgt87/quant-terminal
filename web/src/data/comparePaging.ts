// Which compare legs need an older history page so they cover the main series again. Pure.

export interface PagingLeg {
  /** The first page arrived. */
  loaded: boolean;
  /** A page request is in flight. */
  busy: boolean;
  /** The provider has older bars. */
  hasMore: boolean;
  /** Time of the leg's first bar (null when empty). */
  first: number | null;
}

/** Indexes of legs whose first bar is newer than the main series' first bar and can page. */
export function legsToPage(mainFirst: number | null | undefined, legs: readonly PagingLeg[]): number[] {
  if (mainFirst == null) return [];
  const out: number[] = [];
  legs.forEach((l, i) => {
    if (l.loaded && !l.busy && l.hasMore && l.first != null && l.first > mainFirst) out.push(i);
  });
  return out;
}
