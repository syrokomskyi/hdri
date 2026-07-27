/*
<MODULE_CONTRACT>
<purpose>Define constants and a function for site metadata</purpose>
<non-goals>
  <item>Does not handle dynamic content fetching</item>
  <item>Does not perform any network requests</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial creation of site metadata constants and publisher function</item>
</CHANGE_SUMMARY>
*/

export const site = "https://handwerk-index.org";
export const ogImage = `${site}/og-image.webp`;

export function publisher() {
  return {
    "@type": "Person" as const,
    name: "Andrii Syrokomskyi",
    url: site,
  };
}
