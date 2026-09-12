import {
  runPreflight,
  DEFAULT_EGRESS_POLICY,
  computePolicySha256,
  isAddressBlocked,
} from "./capture-policy.js";
import { promises as dns } from "node:dns";

const checkEgress = async () => {
  const violations: { code: string; message: string }[] = [];
  try {
    const addresses = await dns.lookup("example.com", { all: true });
    for (const addr of addresses) {
      if (isAddressBlocked(addr.address, DEFAULT_EGRESS_POLICY)) {
        violations.push({
          code: "egress-violation",
          message: `Resolved address ${addr.address} is blocked by egress policy`,
        });
      }
    }
  } catch {
    violations.push({
      code: "egress-dns-failed",
      message: "Unable to resolve test hostname for egress verification",
    });
  }
  return violations;
};

const main = async (): Promise<void> => {
  const args = process.argv.slice(2);
  const jsonFlag = args.includes("--json");

  const capsuleDir = process.env.CAPSULE_DIR ?? process.cwd();
  const egressPolicy = DEFAULT_EGRESS_POLICY;
  const policySha256 = computePolicySha256(egressPolicy);

  const result = await runPreflight({
    capsuleDir,
    egressPolicy,
    checkEgress,
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
