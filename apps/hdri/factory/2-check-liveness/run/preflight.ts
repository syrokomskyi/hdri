import { runPreflight, DEFAULT_EGRESS_POLICY, computePolicySha256 } from "./capture-policy.js";

const main = async (): Promise<void> => {
  const args = process.argv.slice(2);
  const jsonFlag = args.includes("--json");

  const capsuleDir = process.env.CAPSULE_DIR ?? process.cwd();
  const egressPolicy = DEFAULT_EGRESS_POLICY;
  const policySha256 = computePolicySha256(egressPolicy);

  const result = await runPreflight({
    capsuleDir,
    egressPolicy,
  });

  if (jsonFlag) {
    console.log(
      JSON.stringify({
        schema: "preflight@1",
        status: result.status,
        inputFingerprint: { policySha256, capsuleDir },
        violations: result.violations,
      }),
    );
  } else {
    if (result.status === "pass") {
      console.log("Preflight: PASS");
    } else {
      console.log("Preflight: BLOCKED");
      for (const v of result.violations) {
        console.log(`  [${v.code}] ${v.message}`);
      }
    }
  }

  process.exit(result.status === "pass" ? 0 : 1);
};

main().catch((err) => {
  console.error("Preflight failed:", err);
  process.exit(2);
});
