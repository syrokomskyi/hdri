/**
 * Thin helpers around @duckdb/node-api to isolate the native module boundary.
 * Both writer and reader go through this module — nowhere else in the package
 * imports from @duckdb/node-api directly.
 */

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DuckDBInstance } from '@duckdb/node-api';

/**
 * Writes an array of plain objects to a Parquet file via DuckDB.
 * Uses a temp NDJSON file as the bridge from JS → DuckDB → Parquet.
 * ZSTD compression, row-group size tuned for small shards.
 */
export async function writeParquet(
  objects: object[],
  outPath: string,
): Promise<void> {
  if (objects.length === 0) {
    throw new Error('writeParquet: objects array must not be empty');
  }

  const tmp = path.join(
    os.tmpdir(),
    `vault-${Date.now()}-${Math.random().toString(36).slice(2)}.ndjson`,
  );

  try {
    await new Promise<void>((resolve, reject) => {
      const stream = fs.createWriteStream(tmp, { encoding: 'utf-8' });
      stream.on('error', reject);
      stream.on('finish', resolve);
      for (let i = 0; i < objects.length; i++) {
        stream.write(JSON.stringify(objects[i]));
        stream.write('\n');
      }
      stream.end();
    });

    const fwdTmp = tmp.replace(/\\/g, '/');
    const fwdOut = outPath.replace(/\\/g, '/');

    const db = await DuckDBInstance.create(':memory:');
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
export async function queryParquet<T = Record<string, unknown>>(
  sql: string,
): Promise<T[]> {
  const db = await DuckDBInstance.create(':memory:');
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
