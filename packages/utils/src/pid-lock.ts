/*
<MODULE_CONTRACT>
<purpose>Shared PID-checked file lock for preventing concurrent operations on the same root.</purpose>
<non-goals>
  <item>Does not implement distributed locking across network hosts.</item>
  <item>Does not handle lock inheritance or process groups.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0100: extracted from apps/gen/news batch-lock.ts and apps/hdri/observatory inventory.ts to eliminate DNA-3 duplication.</item>
</CHANGE_SUMMARY>
*/

import fs from "node:fs/promises";
import path from "node:path";

export type PidLockHandle = {
  lockPath: string;
  release: () => Promise<void>;
};

export type PidLockOptions = {
  /** Lock file name, e.g. ".preserve-lock.json" or ".batch-lock.json". */
  lockFileName: string;
  /** Lock timeout in milliseconds. Stale locks older than this are overwritten. */
  timeoutMs: number;
};

const isProcessAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

/**
 * Acquire a PID-checked file lock in `lockRoot`. If an existing lock belongs to a
 * live process and has not expired, throws with a message starting with the
 * caller-provided `violationPrefix`. Stale locks (dead PID, expired, or
 * corrupted) are overwritten atomically.
 */
export const acquirePidLock = async (
  lockRoot: string,
  opts: PidLockOptions,
  violationPrefix = "LOCK_VIOLATION",
): Promise<PidLockHandle> => {
  const lockPath = path.join(lockRoot, opts.lockFileName);

  let fileExists = false;
  try {
    const content = await fs.readFile(lockPath, "utf8");
    fileExists = true;
    const existing = JSON.parse(content) as { pid: number; acquiredAt: string };
    if (isProcessAlive(existing.pid)) {
      const age = Date.now() - Date.parse(existing.acquiredAt);
      if (age < opts.timeoutMs) {
        throw new Error(
          `${violationPrefix}: root is locked by another active process (pid ${existing.pid})`,
        );
      }
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith(violationPrefix)) {
      throw error;
    }
    // No lock file, corrupted JSON, or stale lock — proceed
  }

  const lock = { pid: process.pid, acquiredAt: new Date().toISOString() };
  await fs.mkdir(lockRoot, { recursive: true });
  const lockBytes = JSON.stringify(lock, null, 2);

  if (fileExists) {
    // Stale lock: overwrite directly (we already verified it's not held by a live process)
    await fs.writeFile(lockPath, lockBytes, "utf8");
  } else {
    // No existing file: use wx for atomic creation (fails if another process races us)
    try {
      const handle = await fs.open(lockPath, "wx");
      try {
        await handle.writeFile(lockBytes, "utf8");
        await handle.sync();
      } finally {
        await handle.close();
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      throw new Error(`${violationPrefix}: root is already locked`);
    }
  }

  return {
    lockPath,
    release: async () => {
      await fs.rm(lockPath, { force: true });
    },
  };
};
