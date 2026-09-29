/*
<MODULE_CONTRACT>
  <purpose>Wait at twenty-minute intervals for one pinned bundle service invocation before preparing availability.</purpose>
  <non-goals><item>Does not restart the bundle, publish results, accept a replacement invocation or treat disappearance as success.</item></non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY><item>RFC-0115: automate the private preparation dependency without interactive model polling.</item></CHANGE_SUMMARY>
*/
// @ai-invariant: Only a proven successful exit of the pinned invocation unlocks private preparation.

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { setTimeout } from "node:timers/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { main as prepareAvailability } from "./prepare-availability";

export function bundleDependencyState(
  raw: string,
  expectedInvocation: string,
): "wait" | "complete" {
  const state = Object.fromEntries(
    raw
      .trim()
      .split("\n")
      .map((line) => {
        const equal = line.indexOf("=");
        return [line.slice(0, equal), line.slice(equal + 1)];
      }),
  );
  if (state.LoadState !== "loaded" || state.InvocationID !== expectedInvocation)
    throw new Error("BUNDLE_DEPENDENCY_MISSING_OR_REPLACED");
  if (state.ActiveState === "failed" || state.Result !== "success")
    throw new Error(`BUNDLE_DEPENDENCY_FAILED:${state.Result}`);
  if (
    state.ActiveState === "active" ||
    state.ActiveState === "activating" ||
    state.ActiveState === "deactivating"
  )
    return "wait";
  if (
    state.ActiveState === "inactive" &&
    state.ExecMainCode === "1" &&
    state.ExecMainStatus === "0" &&
    /^[1-9]\d*$/.test(state.ExecMainExitTimestampMonotonic ?? "")
  )
    return "complete";
  throw new Error("BUNDLE_DEPENDENCY_EXIT_NOT_PROVEN");
}

export async function main(args = process.argv.slice(2)): Promise<void> {
  const { values } = parseArgs({
    args,
    strict: true,
    allowPositionals: false,
    options: {
      unit: { type: "string" },
      invocation: { type: "string" },
      "first-check-at": { type: "string" },
      "capsule-dir": { type: "string" },
      "keys-dir": { type: "string" },
    },
  });
  if (
    !values.unit ||
    !/^hdri-q3-bundle-[a-zA-Z0-9-]+\.service$/.test(values.unit) ||
    !values.invocation ||
    !/^[a-f0-9]{32}$/.test(values.invocation) ||
    !values["capsule-dir"] ||
    !values["keys-dir"] ||
    !values["first-check-at"]
  )
    throw new Error("EXPLICIT_BUNDLE_INVOCATION_START_AND_INPUTS_REQUIRED");
  const firstCheck = Date.parse(values["first-check-at"]);
  if (!Number.isFinite(firstCheck)) throw new Error("INVALID_FIRST_CHECK_TIME");
  if (firstCheck > Date.now()) await setTimeout(firstCheck - Date.now());
  for (;;) {
    const { stdout } = await promisify(execFile)(
      "systemctl",
      [
        "--user",
        "show",
        values.unit,
        "-p",
        "LoadState",
        "-p",
        "InvocationID",
        "-p",
        "ActiveState",
        "-p",
        "Result",
        "-p",
        "ExecMainCode",
        "-p",
        "ExecMainStatus",
        "-p",
        "ExecMainExitTimestampMonotonic",
      ],
      { timeout: 30000 },
    );
    const state = bundleDependencyState(stdout, values.invocation);
    process.stdout.write(
      `${JSON.stringify({ checkedAt: new Date().toISOString(), unit: values.unit, dependency: state })}\n`,
    );
    if (state === "complete") break;
    await setTimeout(20 * 60 * 1000);
  }
  await prepareAvailability([
    "--capsule-dir",
    values["capsule-dir"],
    "--keys-dir",
    values["keys-dir"],
  ]);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href)
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
