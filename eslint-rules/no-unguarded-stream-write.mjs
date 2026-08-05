/**
 * ESLint custom rule: no-unguarded-stream-write
 *
 * Flags `stream.write(data)` calls whose boolean return value is discarded
 * (i.e., the call appears as a bare expression statement). Writable streams
 * return `false` when the internal buffer exceeds the high-water mark — ignoring
 * this signal leads to unbounded memory growth.
 *
 * Correct patterns:
 *   if (!stream.write(data)) { await once(stream, "drain"); }
 *   const ok = stream.write(data); if (!ok) { ... }
 *
 * Exclusions:
 *   process.stdout.write(...)  — console output, backpressure not applicable
 *   process.stderr.write(...)  — same
 *   *.test.ts / *.test.tsx     — test files may use mock streams
 */

export const noUnguardedStreamWrite = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow stream.write() without handling the boolean return value (backpressure)",
    },
    schema: [],
    messages: {
      unguarded:
        'stream.write() return value is ignored — handle backpressure with `if (!stream.write(...)) { await once(stream, "drain"); }` or use process.stdout/process.stderr for console output',
    },
  },

  create(context) {
    const filename = context.filename ?? "";

    // node is the callee MemberExpression: e.g. process.stderr.write
    // node.object is process.stderr (a MemberExpression)
    function isProcessStdoutOrStderr(node) {
      const obj = node.object;
      if (obj.type !== "MemberExpression") return false;
      const rootObj = obj.object;
      const rootProp = obj.property;
      if (rootObj.type !== "Identifier" || rootObj.name !== "process") return false;
      if (rootProp.type !== "Identifier") return false;
      return rootProp.name === "stdout" || rootProp.name === "stderr";
    }

    return {
      CallExpression(node) {
        const callee = node.callee;
        if (callee.type !== "MemberExpression") return;
        const prop = callee.property;
        if (prop.type !== "Identifier" || prop.name !== "write") return;

        // Exclude process.stdout / process.stderr
        if (isProcessStdoutOrStderr(callee)) return;

        // Only flag when the return value is discarded (bare expression statement)
        const parent = node.parent;
        if (!parent || parent.type !== "ExpressionStatement") return;

        // Exclude test files
        if (filename.endsWith(".test.ts") || filename.endsWith(".test.tsx")) return;

        // Check if there's a nearby drain listener or await on the same stream
        // (heuristic: if the expression statement is inside a try block with
        //  an await once(stream, "drain") nearby, it's likely fine — but this
        //  is hard to detect reliably, so we rely on the explicit pattern check)
        context.report({ node, messageId: "unguarded" });
      },
    };
  },
};

export const backpressurePlugin = {
  rules: {
    "no-unguarded-stream-write": noUnguardedStreamWrite,
  },
};
