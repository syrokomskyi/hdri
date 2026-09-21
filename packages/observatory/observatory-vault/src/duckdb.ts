/*
<MODULE_CONTRACT>
<purpose>Facilitates interaction with DuckDB for writing to and querying from Parquet files. Exposes DuckDbSession for pooled in-memory connections and thin write/query helpers for one-shot use.</purpose>
<non-goals>
  <item>Does not handle direct interactions with @duckdb/node-api outside this module.</item>
  <item>Does not provide persistent database connections or storage solutions.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial implementation of Parquet writing and querying functions using DuckDB.</item>
  <item>Architectural refactoring: added DuckDbSession for pooled in-memory connections, reducing per-call startup overhead for readers that issue multiple queries.</item>
</CHANGE_SUMMARY>
*/

/**
 * Thin helpers around @duckdb/node-api to isolate the native module boundary.
 * Both writer and reader go through this module — nowhere else in the package
 * imports from @duckdb/node-api directly.
 */

import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { once } from "node:events";
import { DuckDBInstance, type DuckDBConnection } from "@duckdb/node-api";

/**
 * Pooled in-memory DuckDB session. Keeps a single DuckDBInstance + connection alive
 * across multiple queries, avoiding the per-call startup cost of create+close.
 * Use for readers that issue several queries in sequence; use the one-shot
 * `writeParquet` / `queryParquet` helpers for single operations.
 */
export class DuckDbSession {
  private db: DuckDBInstance | null = null;
  private conn: DuckDBConnection | null = null;

  async connect(): Promise<DuckDBConnection> {
    if (!this.conn) {
      this.db = await DuckDBInstance.create(":memory:");
      this.conn = await this.db.connect();
    }
    return this.conn;
  }

  async query<T = Record<string, unknown>>(sql: string): Promise<T[]> {
    const conn = await this.connect();
    const reader = await conn.runAndReadAll(sql);
    return reader.getRowObjectsJS() as unknown as T[];
  }

  async run(sql: string): Promise<void> {
    const conn = await this.connect();
    await conn.run(sql);
  }

  /** Streams result chunks without retaining prior chunks in the V8 heap. */
  async *stream<T = Record<string, unknown>>(sql: string): AsyncIterable<T[]> {
    const conn = await this.connect();
    const result = await conn.stream(sql);
    for await (const chunk of result.yieldRowObjectJs()) {
      yield chunk as unknown as T[];
    }
  }

  close(): void {
    if (this.conn) {
      this.conn.closeSync();
      this.conn = null;
    }
    if (this.db) {
      this.db.closeSync();
      this.db = null;
    }
  }
}

/**
 * Writes an array of plain objects to a Parquet file via DuckDB.
 * Uses a temp NDJSON file as the bridge from JS → DuckDB → Parquet.
 * ZSTD compression, row-group size tuned for small shards.
 */
export async function writeParquet(objects: readonly object[], outPath: string): Promise<void> {
  if (objects.length === 0) {
    throw new Error("writeParquet: objects array must not be empty");
  }

  const tmp = path.join(
    os.tmpdir(),
    `vault-${Date.now()}-${Math.random().toString(36).slice(2)}.ndjson`,
  );

  try {
    const stream = fs.createWriteStream(tmp, { encoding: "utf-8", highWaterMark: 16 * 1024 * 1024 });
    const streamError = once(stream, "error").then(([error]) => Promise.reject(error));
    for (let i = 0; i < objects.length; i++) {
      if (!stream.write(`${JSON.stringify(objects[i])}\n`)) {
        await Promise.race([once(stream, "drain"), streamError]);
      }
    }
    stream.end();
    await Promise.race([once(stream, "finish"), streamError]);

    const fwdTmp = tmp.replace(/\\/g, "/");
    const fwdOut = outPath.replace(/\\/g, "/");

    const db = await DuckDBInstance.create(":memory:");
    try {
      const conn = await db.connect();
      try {
        await conn.run(`CREATE TABLE _t AS SELECT * FROM read_ndjson_auto('${fwdTmp}')`);
        await conn.run(
          `COPY _t TO '${fwdOut}' (FORMAT PARQUET, COMPRESSION ZSTD, ROW_GROUP_SIZE 100000)`,
        );
      } finally {
        conn.closeSync();
      }
    } finally {
      db.closeSync();
    }
  } finally {
    await fsp.unlink(tmp).catch(() => undefined);
  }
}

/**
 * Executes a SQL query against the vault using an ephemeral in-memory DuckDB.
 * Returns rows as plain JS objects (JSON-compatible values only).
 */
export async function queryParquet<T = Record<string, unknown>>(sql: string): Promise<T[]> {
  const db = await DuckDBInstance.create(":memory:");
  try {
    const conn = await db.connect();
    try {
      const reader = await conn.runAndReadAll(sql);
      return reader.getRowObjectsJS() as unknown as T[];
    } finally {
      conn.closeSync();
    }
  } finally {
    db.closeSync();
  }
}
