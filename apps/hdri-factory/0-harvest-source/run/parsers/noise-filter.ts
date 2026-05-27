/*
<MODULE_CONTRACT>
<purpose>Provides shared logic for filtering out noise files during parsing.</purpose>
<keywords>parser, noise, filter, ignore</keywords>
<responsibilities>
  <item>Detects common noise files like favicons, robots.txt, and tag pages.</item>
  <item>Provides a standard way for parsers to skip irrelevant content.</item>
</responsibilities>
<non-goals>
  <item>Do not perform content-based parsing.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="isNoiseFile">Utility to check if a file path represents a noise file.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Create noise-filter utility for shared skip logic.</item>
  <item>Exclude handwerkernet.de new registration and search pages (redundant feed/search data).</item>
</CHANGE_SUMMARY>
*/

/**
 * Checks if a file should be ignored as noise based on its name or path.
 * Common patterns include favicons, robots.txt artifacts, and common directory-specific tags.
 */
export function isNoiseFile(fileName: string): boolean {
  const normalized = fileName.replace(/\\/g, '/').toLowerCase();

  // Common technical artifacts
  if (normalized.endsWith('favicon.ico.html') || normalized.endsWith('/favicon.ico')) return true;
  if (normalized.endsWith('robots.txt.html') || normalized.endsWith('/robots.txt')) return true;
  if (normalized.endsWith('.png.html') || normalized.endsWith('.jpg.html') || normalized.endsWith('.gif.html')) return true;
  if (normalized.endsWith('.css.html') || normalized.endsWith('.js.html')) return true;

  // Common directory noise patterns
  if (normalized.includes('/infos/tag/')) return true; // branchenverzeichnis.org
  if (normalized.includes('/tags/')) return true;
  if (normalized.includes('/search/')) return true;
  if (normalized.includes('/suche/')) return true;

  // handwerkernet.de noise (redundant feed/search data in /php/ directory)
  if (normalized.includes('/handwerkernet.de/php/')) return true;

  return false;
}
