/*
<MODULE_CONTRACT>
<purpose>Provides filesystem isolation for the independent rebuild worker by intercepting fs calls, logging accessed paths, and denying access to undeclared paths.</purpose>
<non-goals>
  <item>Does not intercept native addon file access (e.g., better-sqlite3 internal reads).</item>
  <item>Does not provide OS-level process isolation — use a child process for that if needed.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0110: initial sandbox with fs.promises interception, path allowlist, access logging, and isolation proof hashing.</item>
</CHANGE_SUMMARY>
*/

import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export class RebuildSandbox {
  private readonly allowedRoots: string[];
  private readonly accessLog = new Set<string>();
  private readonly originalFs = { ...fs };

  constructor(allowedRoots: readonly string[]) {
    this.allowedRoots = allowedRoots.map((p) => path.resolve(p));
  }

  private isPathAllowed(target: string): boolean {
    const resolved = path.resolve(target);
    return this.allowedRoots.some((root) => {
      const rel = path.relative(root, resolved);
      return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
    });
  }

  private checkAccess(target: string): void {
    if (!this.isPathAllowed(target)) {
      const err = new Error(
        `isolation_boundary_violation: ${target} is outside declared evidence paths`,
      );
      err.name = "IsolationBoundaryViolation";
      throw err;
    }
    this.accessLog.add(path.resolve(target));
  }

  getFs(): typeof fs {
    const self = this;
    return new Proxy(this.originalFs, {
      get(target, prop: string) {
        const original = target[prop as keyof typeof target];
        if (typeof original !== "function") return original;

        const wrapped = (...args: unknown[]) => {
          for (const a of args) {
            if (
              typeof a === "string" &&
              (a.includes("/") || a.includes(path.sep) || a.startsWith(".") || a.startsWith("~"))
            ) {
              self.checkAccess(a);
            }
          }
          return (original as (...a: unknown[]) => unknown)(...args);
        };
        return wrapped;
      },
    });
  }

  getAccessLog(): string[] {
    return [...this.accessLog].sort();
  }

  computeIsolationProof(): string {
    return createHash("sha256").update(this.getAccessLog().join("\n")).digest("hex");
  }
}
