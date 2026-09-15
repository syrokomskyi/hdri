/*
<MODULE_CONTRACT>
<purpose>Compare complete declared methodology content identities without granting panel or population eligibility.</purpose>
<non-goals><item>Does not authenticate snapshot provenance, verify population frames or select a longitudinal panel.</item></non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY><item>Reject partial hash fallback and separate methodology equality from product-specific scientific proof.</item></CHANGE_SUMMARY>
*/
// @ai-invariant: Matching one component or a caller-supplied aggregate never proves complete methodology equality.

export const METHODOLOGY_CONTENT_FIELDS = [
  "codebookSha256",
  "ontologySha256",
  "scoringSemanticsSha256",
  "signalMapSha256",
  "missingnessPolicySha256",
  "classificationPolicySha256",
  "populationPolicySha256",
  "suppressionPolicySha256",
] as const;
type MethodologyContentIdentity = Record<(typeof METHODOLOGY_CONTENT_FIELDS)[number], string>;

export function compareMethodologySnapshots(previous: unknown, current: unknown) {
  const violations: string[] = [];
  const valid = (value: unknown, side: string): value is MethodologyContentIdentity => {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      violations.push(`${side}_methodology_object_required`);
      return false;
    }
    let complete = true;
    for (const field of METHODOLOGY_CONTENT_FIELDS) {
      const digest: unknown = Reflect.get(value, field);
      if (
        !Object.hasOwn(value, field) ||
        typeof digest !== "string" ||
        !/^[a-f0-9]{64}$/.test(digest)
      ) {
        violations.push(`${side}_methodology_invalid_${field}`);
        complete = false;
      }
    }
    return complete;
  };
  const previousValid = valid(previous, "previous");
  const currentValid = valid(current, "current");
  const changedComponents =
    previousValid && currentValid
      ? METHODOLOGY_CONTENT_FIELDS.filter((field) => previous[field] !== current[field])
      : [];
  const scoreComparable = previousValid && currentValid && changedComponents.length === 0;
  return {
    violations,
    changedComponents,
    // This is a necessary methodology check only, not a product admission verdict.
    scoreComparable,
    panelComparable: false,
    postStratComparable: false,
    hardSuppressions: [
      ...(!scoreComparable
        ? ["direct_score_delta_suppressed_methodology_unverified_or_changed"]
        : []),
      "panel_comparison_requires_verified_membership_and_attrition",
      "post_stratification_requires_verified_population_and_weights",
    ],
  };
}
