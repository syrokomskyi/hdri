/*
<MODULE_CONTRACT>
  <purpose>Run offline Linux subprocesses with explicit mounts, bounded output and measured descendants.</purpose>
  <non-goals>
    <item>Does not certify application results, select trusted inputs or provision a container runtime.</item>
    <item>Does not expose host environment, home directories or host networking to workers.</item>
  </non-goals>
  <!-- risk: network -->
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0115: enforce offline process isolation with bubblewrap, deadline cleanup and descendant RSS samples.</item>
</CHANGE_SUMMARY>
*/

import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";

export interface IsolatedMount {
  source: string;
  destination: string;
}

export interface ProcessMemorySample {
  elapsedMs: number;
  coordinatorRssBytes: number;
  descendantRssBytes: number;
  descendants: number;
}

export interface IsolatedProcessOptions {
  executable: string;
  args: readonly string[];
  readOnlyMounts: readonly IsolatedMount[];
  scratchRoot: string;
  timeoutMs: number;
  maxOutputBytes: number;
  sampleIntervalMs?: number;
  onSample?: (sample: ProcessMemorySample) => void | Promise<void>;
}

export interface IsolatedProcessResult {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  peakCoordinatorRssBytes: number;
  peakDescendantRssBytes: number;
  peakProcessTreeRssBytes: number;
  samples: number;
}

const isMissingProcess = (error: unknown): boolean =>
  ["ENOENT", "ESRCH"].includes((error as NodeJS.ErrnoException).code ?? "");

/** Inspect every thread because a non-main thread can create a child process. */
async function inspectDescendants(rootPid: number): Promise<{ bytes: number; count: number }> {
  const pending = [rootPid];
  const seen = new Set<number>();
  let bytes = 0;
  while (pending.length > 0) {
    const pid = pending.pop()!;
    if (seen.has(pid)) continue;
    seen.add(pid);
    try {
      const status = await fs.readFile(`/proc/${pid}/status`, "utf8");
      const rss = /^VmRSS:\s+(\d+) kB$/m.exec(status);
      bytes += rss ? Number(rss[1]) * 1024 : 0;
      for (const tid of await fs.readdir(`/proc/${pid}/task`)) {
        try {
          const children = await fs.readFile(`/proc/${pid}/task/${tid}/children`, "utf8");
          pending.push(...children.trim().split(/\s+/).filter(Boolean).map(Number));
        } catch (error) {
          if (!isMissingProcess(error)) throw error;
        }
      }
    } catch (error) {
      if (!isMissingProcess(error)) throw error;
    }
  }
  return { bytes, count: seen.size };
}

const overlaps = (left: string, right: string): boolean =>
  left === right ||
  left === "/" ||
  right === "/" ||
  left.startsWith(`${right}/`) ||
  right.startsWith(`${left}/`);

const isBroadRoot = (root: string): boolean =>
  ["/", "/tmp", "/var", "/home", "/usr", process.cwd(), process.env.HOME].includes(root);

async function canonicalPath(input: string): Promise<string> {
  if (!path.isAbsolute(input)) throw new Error("ISOLATION_PATH_MUST_BE_ABSOLUTE");
  const resolved = await fs.realpath(input);
  if (resolved !== path.resolve(input)) throw new Error(`ISOLATION_SYMLINK_ROOT:${input}`);
  return resolved;
}

// @ai-invariant: Isolation failure never falls back to an unrestricted host process.
export async function runIsolatedProcess(
  options: IsolatedProcessOptions,
): Promise<IsolatedProcessResult> {
  if (process.platform !== "linux") throw new Error("ISOLATION_UNAVAILABLE:Linux required");
  for (const value of [
    options.timeoutMs,
    options.maxOutputBytes,
    options.sampleIntervalMs ?? 100,
  ]) {
    if (!Number.isSafeInteger(value) || value <= 0) throw new Error("INVALID_PROCESS_LIMIT");
  }
  const scratch = await canonicalPath(options.scratchRoot);
  if (!(await fs.stat(scratch)).isDirectory()) throw new Error("ISOLATION_SCRATCH_NOT_DIRECTORY");
  if (isBroadRoot(scratch)) {
    throw new Error("ISOLATION_SCRATCH_TOO_BROAD");
  }
  const destinations = ["/scratch"];
  const mountArgs: string[] = [];
  for (const mount of options.readOnlyMounts) {
    const source = await canonicalPath(mount.source);
    if (isBroadRoot(source)) throw new Error("ISOLATION_INPUT_TOO_BROAD");
    const destination = mount.destination;
    if (
      !/^\/(input|runtime)\/[A-Za-z0-9._/-]+$/.test(destination) ||
      destination.split("/").some((part) => part === ".." || part === ".") ||
      path.posix.normalize(destination) !== destination
    ) {
      throw new Error(`ISOLATION_INVALID_DESTINATION:${destination}`);
    }
    if (overlaps(source, scratch) || destinations.some((other) => overlaps(destination, other))) {
      throw new Error("ISOLATION_OVERLAPPING_MOUNTS");
    }
    destinations.push(destination);
    mountArgs.push("--ro-bind", source, destination);
  }
  if (!options.executable.startsWith("/runtime/") && !options.executable.startsWith("/usr/bin/")) {
    throw new Error("ISOLATION_EXECUTABLE_NOT_IN_RUNTIME");
  }

  const started = performance.now();
  const child = spawn(
    "/usr/bin/bwrap",
    [
      "--unshare-all",
      "--die-with-parent",
      "--new-session",
      "--cap-drop",
      "ALL",
      "--clearenv",
      "--setenv",
      "PATH",
      "/usr/bin:/bin",
      "--setenv",
      "LANG",
      "C.UTF-8",
      "--setenv",
      "TZ",
      "UTC",
      "--setenv",
      "TMPDIR",
      "/tmp",
      // Vendored libraries (e.g. playwright-core) call os.homedir() at module
      // load; --clearenv leaves HOME unset which crashes them. /tmp is a tmpfs.
      "--setenv",
      "HOME",
      "/tmp",
      "--ro-bind",
      "/usr",
      "/usr",
      "--symlink",
      "usr/lib",
      "/lib",
      "--symlink",
      "usr/lib64",
      "/lib64",
      "--symlink",
      "usr/bin",
      "/bin",
      "--proc",
      "/proc",
      "--dev",
      "/dev",
      "--tmpfs",
      "/tmp",
      ...mountArgs,
      "--bind",
      scratch,
      "/scratch",
      "--chdir",
      "/scratch",
      "--",
      options.executable,
      ...options.args,
    ],
    { env: {}, stdio: ["ignore", "pipe", "pipe"], detached: true },
  );

  let fault: Error | undefined;
  let exited = false;
  child.once("exit", () => {
    exited = true;
  });
  const stop = (error: Error): void => {
    fault ??= error;
    if (child.pid && !exited) {
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch (killError) {
        if (!isMissingProcess(killError))
          fault = new Error("ISOLATION_CLEANUP_FAILED", { cause: killError });
      }
    }
  };
  const outputs: Buffer[][] = [[], []];
  let outputBytes = 0;
  for (const [index, stream] of [child.stdout, child.stderr].entries()) {
    stream.on("data", (chunk: Buffer) => {
      outputBytes += chunk.byteLength;
      if (outputBytes > options.maxOutputBytes) {
        stop(new Error("ISOLATED_OUTPUT_LIMIT_EXCEEDED"));
      } else {
        outputs[index]!.push(chunk);
      }
    });
    stream.on("error", (error) => stop(error));
  }
  let finished = false;
  let samples = 0;
  let peakCoordinatorRssBytes = process.memoryUsage().rss;
  let peakDescendantRssBytes = 0;
  let peakProcessTreeRssBytes = peakCoordinatorRssBytes;
  let sampling: Promise<void> = Promise.resolve();
  let samplingBusy = false;
  const sample = (): void => {
    if (samplingBusy || finished) return;
    samplingBusy = true;
    sampling = (async () => {
      if (finished || !child.pid) return;
      const tree = await inspectDescendants(child.pid);
      const coordinatorRssBytes = process.memoryUsage().rss;
      const point = {
        elapsedMs: Math.ceil(performance.now() - started),
        coordinatorRssBytes,
        descendantRssBytes: tree.bytes,
        descendants: tree.count,
      };
      samples++;
      peakCoordinatorRssBytes = Math.max(peakCoordinatorRssBytes, coordinatorRssBytes);
      peakDescendantRssBytes = Math.max(peakDescendantRssBytes, tree.bytes);
      peakProcessTreeRssBytes = Math.max(peakProcessTreeRssBytes, coordinatorRssBytes + tree.bytes);
      await options.onSample?.(point);
    })()
      .catch((error: unknown) => stop(new Error("PROCESS_MEASUREMENT_FAILED", { cause: error })))
      .finally(() => {
        samplingBusy = false;
      });
  };
  const timer = setTimeout(() => stop(new Error("ISOLATED_PROCESS_TIMEOUT")), options.timeoutMs);
  const telemetry = setInterval(sample, options.sampleIntervalMs ?? 100);
  try {
    sample();
    const closed = await new Promise<{ exitCode: number | null; signal: NodeJS.Signals | null }>(
      (resolve, reject) => {
        child.once("error", reject);
        child.once("close", (exitCode, signal) => resolve({ exitCode, signal }));
      },
    );
    await sampling;
    if (fault) throw fault;
    return {
      ...closed,
      stdout: Buffer.concat(outputs[0]!).toString("utf8"),
      stderr: Buffer.concat(outputs[1]!).toString("utf8"),
      durationMs: Math.ceil(performance.now() - started),
      peakCoordinatorRssBytes,
      peakDescendantRssBytes,
      peakProcessTreeRssBytes,
      samples,
    };
  } finally {
    finished = true;
    clearTimeout(timer);
    clearInterval(telemetry);
    await sampling;
  }
}
