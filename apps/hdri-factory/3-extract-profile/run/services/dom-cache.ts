/*
<MODULE_CONTRACT>
<purpose>LRU cache for Cheerio DOM instances keyed by content_sha256.</purpose>
<keywords>cache, dom, cheerio, lru, extraction</keywords>
<responsibilities>
  <item>Load HTML from disk and parse it into a CheerioAPI instance once per sha256.</item>
  <item>Retain parsed DOM in memory with an LRU eviction policy bounded by capacity.</item>
  <item>Provide cache statistics for observability.</item>
</responsibilities>
<non-goals>
  <item>Does not persist DOM to disk — this is a volatile in-memory cache only.</item>
  <item>Does not manage concurrency — callers must not mutate the shared CheerioAPI instance.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="DomCache.getOrLoad">Reads HTML, parses with Cheerio, caches and returns the CheerioAPI.</entry>
  <entry key="DomCache.evict">Removes a single entry from the cache so its heavy DOM can be GC'd.</entry>
  <entry key="DomCache.stats">Returns hit/miss counters and current cache size.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Created DomCache to eliminate redundant Cheerio.parse() calls across ~44 extractor gogols.</item>
  <item>Add in-flight promise deduplication so concurrent gogol workers do not parse the same page twice.</item>
  <item>Respect capacity ≤ 0 as unlimited (no eviction) instead of accidentally dropping every entry.</item>
  <item>Remove `html` from DomCacheEntry — callers only need the CheerioAPI, halving per-entry memory.</item>
  <item>Add `evict()` method so callers can drop a DOM immediately after use, preventing memory accumulation across thousands of unique pages.</item>
</CHANGE_SUMMARY>
*/

import fs from 'node:fs/promises';
import { load } from 'cheerio';
import { type CheerioAPI } from '@org/business-crawler/extract';

export type DomCacheEntry = {
  /** Parsed Cheerio DOM — the only thing callers need after load(). */
  $: CheerioAPI;
};

export class DomCache {
  private readonly capacity: number;
  private readonly map = new Map<string, DomCacheEntry>();
  private readonly inFlight = new Map<string, Promise<DomCacheEntry>>();
  private hitCount = 0;
  private missCount = 0;

  constructor(capacity: number) {
    this.capacity = capacity;
  }

  /**
   * Returns a cached CheerioAPI for the given sha256, or loads the HTML from
   * filePath, parses it, stores it, and returns it.
   *
   * The entry is moved to the end of the LRU order on every hit.
   * Concurrent requests for the same sha256 share a single in-flight promise
   * so the page is parsed only once.
   */
  async getOrLoad(sha256: string, filePath: string): Promise<DomCacheEntry> {
    const existing = this.map.get(sha256);
    if (existing) {
      // Move to end to mark as most-recently-used.
      this.map.delete(sha256);
      this.map.set(sha256, existing);
      this.hitCount++;
      return existing;
    }

    const pending = this.inFlight.get(sha256);
    if (pending) {
      return pending;
    }

    const promise = (async (): Promise<DomCacheEntry> => {
      try {
        const html = await fs.readFile(filePath, 'utf-8');
        const $ = load(html) as CheerioAPI;
        const entry: DomCacheEntry = { $ };

        if (this.capacity > 0 && this.map.size >= this.capacity) {
          const firstKey = this.map.keys().next().value as string;
          this.map.delete(firstKey);
        }
        this.map.set(sha256, entry);
        this.missCount++;
        return entry;
      } finally {
        this.inFlight.delete(sha256);
      }
    })();

    this.inFlight.set(sha256, promise);
    return promise;
  }

  /**
   * Explicitly remove an entry from the cache.
   * Callers should evict after they are done with the CheerioAPI so the
   * heavy DOM object can be garbage-collected instead of retained until
   * the capacity limit is hit.
   */
  evict(sha256: string): void {
    this.map.delete(sha256);
  }

  get stats(): { hitCount: number; missCount: number; size: number } {
    return { hitCount: this.hitCount, missCount: this.missCount, size: this.map.size };
  }
}
