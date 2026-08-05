/*
<MODULE_CONTRACT>
<purpose>Writes bounded, backpressure-aware, crash-resumable immutable NDJSON partitions.</purpose>
<non-goals><item>Does not sign or interpret records.</item></non-goals>
</MODULE_CONTRACT>
*/

import crypto, { createHash } from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { once } from "node:events";
import type { AssetStateRecord, Observation } from "@syrokomskyi/observatory-core";
import type { EmitManifest, EmitPartition } from "./types.js";

type WriterInit = Omit<EmitManifest, "schema_version" | "format" | "emitted_at" | "partition_rows" | "observation_count" | "observation_partitions" | "evidence_count" | "evidence_partitions" | "evidence_hash" | "bundle_hash" | "asset_state_count" | "asset_state_partitions" | "asset_states_hash">;
type StreamKind = "observations" | "asset-states" | "evidence";
type Checkpoint = Readonly<{
  schemaVersion: "2";
  initSha256: string;
  partitionRows: number;
  observations: readonly EmitPartition[];
  assetStates: readonly EmitPartition[];
  evidence: readonly EmitPartition[];
}>;
type Tracker = {
  kind: StreamKind;
  committed: EmitPartition[];
  stream: fs.WriteStream | null;
  tempPath: string | null;
  hash: crypto.Hash | null;
  currentCount: number;
};

const checkpointName = "emit-checkpoint.json";

export class EmitBundleWriter {
  private readonly partitionRows: number;
  private readonly initSha256: string;
  private readonly obs: Tracker = { kind: "observations", committed: [], stream: null, tempPath: null, hash: null, currentCount: 0 };
  private readonly states: Tracker = { kind: "asset-states", committed: [], stream: null, tempPath: null, hash: null, currentCount: 0 };
  private readonly evidence: Tracker = { kind: "evidence", committed: [], stream: null, tempPath: null, hash: null, currentCount: 0 };
  private opened = false;
  private committed = false;
  private drainWaits = 0;

  constructor(private readonly emitDir: string, private readonly init: WriterInit, options: { partitionRows?: number } = {}) {
    this.partitionRows = options.partitionRows ?? 100_000;
    if (!Number.isInteger(this.partitionRows) || this.partitionRows < 1_000 || this.partitionRows > 1_000_000) {
      throw new Error("partitionRows must be an integer between 1,000 and 1,000,000");
    }
    this.initSha256 = createHash("sha256").update(JSON.stringify({ init, partitionRows: this.partitionRows })).digest("hex");
  }

  get committedObservationCount(): number { return this.obs.committed.reduce((sum, part) => sum + part.row_count, 0); }
  get committedAssetStateCount(): number { return this.states.committed.reduce((sum, part) => sum + part.row_count, 0); }
  get committedEvidenceCount(): number { return this.evidence.committed.reduce((sum, part) => sum + part.row_count, 0); }
  get backpressureWaits(): number { return this.drainWaits; }
  get evidenceDir(): string { return path.join(this.emitDir, "evidence"); }

  async open(): Promise<void> {
    if (this.opened) throw new Error("EmitBundleWriter already opened");
    try {
      await fsp.access(path.join(this.emitDir, "manifest.json"));
      throw new Error("Emit bundle is already committed");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    for (const name of ["evidence", "observations", "asset-states"]) await fsp.mkdir(path.join(this.emitDir, name), { recursive: true });
    try {
      const checkpoint = JSON.parse(await fsp.readFile(path.join(this.emitDir, checkpointName), "utf8")) as Checkpoint;
      if (checkpoint.schemaVersion !== "2" || checkpoint.initSha256 !== this.initSha256 || checkpoint.partitionRows !== this.partitionRows) {
        throw new Error("Emit checkpoint belongs to another stream configuration");
      }
      this.obs.committed.push(...checkpoint.observations);
      this.states.committed.push(...checkpoint.assetStates);
      this.evidence.committed.push(...checkpoint.evidence);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    await this.verifyAndAdopt(this.obs);
    await this.verifyAndAdopt(this.states);
    await this.verifyAndAdopt(this.evidence);
    this.opened = true;
  }

  async writeObservation(observation: Observation): Promise<void> { await this.write(this.obs, `${JSON.stringify(observation)}\n`); }
  async writeAssetState(state: AssetStateRecord): Promise<void> { await this.write(this.states, `${JSON.stringify(state)}\n`); }
  async writeEvidence(record: unknown): Promise<void> { await this.write(this.evidence, `${JSON.stringify(record)}\n`); }

  async abort(): Promise<void> {
    for (const tracker of [this.obs, this.states, this.evidence]) {
      if (tracker.stream) {
        const stream = tracker.stream;
        await new Promise<void>((resolve) => {
          let settled = false;
          const finish = (): void => {
            if (settled) return;
            settled = true;
            resolve();
          };
          stream.once("error", finish);
          stream.once("close", finish);
          stream.destroy();
        });
      }
      if (tracker.tempPath) await fsp.unlink(tracker.tempPath).catch(() => undefined);
      tracker.stream = null;
      tracker.tempPath = null;
      tracker.hash = null;
      tracker.currentCount = 0;
    }
  }

  async commit(): Promise<EmitManifest> {
    this.assertWritable();
    await this.finishPartition(this.obs);
    await this.finishPartition(this.states);
    await this.finishPartition(this.evidence);
    this.committed = true;
    const manifest: EmitManifest = {
      schema_version: "3",
      format: "ndjson-partitioned-v1",
      ...this.init,
      emitted_at: new Date().toISOString(),
      partition_rows: this.partitionRows,
      observation_count: this.committedObservationCount,
      observation_partitions: this.obs.committed,
      evidence_count: this.committedEvidenceCount,
      evidence_partitions: this.evidence.committed,
      evidence_hash: this.partitionSetHash(this.evidence.committed),
      bundle_hash: this.partitionSetHash(this.obs.committed),
      asset_state_count: this.committedAssetStateCount,
      asset_state_partitions: this.states.committed,
      asset_states_hash: this.partitionSetHash(this.states.committed),
    };
    await fsp.writeFile(path.join(this.emitDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx" });
    await fsp.unlink(path.join(this.emitDir, checkpointName)).catch(() => undefined);
    return manifest;
  }

  private assertWritable(): void {
    if (!this.opened) throw new Error("Call open() first");
    if (this.committed) throw new Error("Emit bundle is already committed");
  }

  private async write(tracker: Tracker, line: string): Promise<void> {
    this.assertWritable();
    if (!tracker.stream) await this.openPartition(tracker);
    if (!tracker.stream!.write(line)) {
      this.drainWaits++;
      await once(tracker.stream!, "drain");
    }
    tracker.hash!.update(line);
    tracker.currentCount++;
    if (tracker.currentCount >= this.partitionRows) await this.finishPartition(tracker);
  }

  private async openPartition(tracker: Tracker): Promise<void> {
    const index = tracker.committed.length;
    tracker.tempPath = path.join(this.emitDir, tracker.kind, `part-${String(index).padStart(6, "0")}.ndjson.${process.pid}.${crypto.randomUUID()}.tmp`);
    tracker.stream = fs.createWriteStream(tracker.tempPath, { encoding: "utf8", flags: "wx", highWaterMark: 16 * 1024 * 1024 });
    tracker.hash = createHash("sha256");
    tracker.currentCount = 0;
  }

  private async finishPartition(tracker: Tracker): Promise<void> {
    if (!tracker.stream || !tracker.tempPath || !tracker.hash || tracker.currentCount === 0) return;
    const stream = tracker.stream;
    await new Promise<void>((resolve, reject) => {
      stream.once("error", reject);
      stream.end(resolve);
    });
    const handle = await fsp.open(tracker.tempPath, "r");
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
    const index = tracker.committed.length;
    const uri = `${tracker.kind}/part-${String(index).padStart(6, "0")}.ndjson`;
    const finalPath = path.join(this.emitDir, uri);
    const sha256 = tracker.hash.digest("hex");
    try {
      await fsp.link(tracker.tempPath, finalPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST" || await this.hashFile(finalPath) !== sha256) throw error;
    } finally {
      await fsp.unlink(tracker.tempPath).catch(() => undefined);
    }
    tracker.committed.push({ uri, row_count: tracker.currentCount, sha256 });
    tracker.stream = null;
    tracker.tempPath = null;
    tracker.hash = null;
    tracker.currentCount = 0;
    await this.writeCheckpoint();
  }

  private async writeCheckpoint(): Promise<void> {
    const checkpoint: Checkpoint = {
      schemaVersion: "2",
      initSha256: this.initSha256,
      partitionRows: this.partitionRows,
      observations: this.obs.committed,
      assetStates: this.states.committed,
      evidence: this.evidence.committed,
    };
    const target = path.join(this.emitDir, checkpointName);
    const temp = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
    await fsp.writeFile(temp, `${JSON.stringify(checkpoint, null, 2)}\n`, { flag: "wx" });
    await fsp.rename(temp, target);
  }

  private async verifyAndAdopt(tracker: Tracker): Promise<void> {
    for (const part of tracker.committed) {
      const summary = await this.summarizeFile(path.join(this.emitDir, part.uri));
      if (summary.sha256 !== part.sha256 || summary.rowCount !== part.row_count) {
        throw new Error(`Emit checkpoint partition checksum mismatch: ${part.uri}`);
      }
    }
    const directory = path.join(this.emitDir, tracker.kind);
    const directoryNames = await fsp.readdir(directory);
    for (const name of directoryNames.filter((entry) => entry.endsWith(".tmp"))) {
      await fsp.unlink(path.join(directory, name));
    }
    const names = directoryNames.filter((name) => /^part-\d{6}\.ndjson$/.test(name)).sort();
    for (const name of names.slice(tracker.committed.length)) {
      const expectedName = `part-${String(tracker.committed.length).padStart(6, "0")}.ndjson`;
      if (name !== expectedName) throw new Error(`Non-contiguous orphan emit partition: ${name}`);
      const absolute = path.join(directory, name);
      const { rowCount, sha256 } = await this.summarizeFile(absolute);
      if (rowCount === 0 || rowCount > this.partitionRows) throw new Error(`Invalid orphan emit partition: ${name}`);
      tracker.committed.push({ uri: `${tracker.kind}/${name}`, row_count: rowCount, sha256 });
    }
    await this.writeCheckpoint();
  }

  private partitionSetHash(parts: readonly EmitPartition[]): string | null {
    if (parts.length === 0) return null;
    return createHash("sha256").update(parts.map((part) => `${part.uri}\0${part.row_count}\0${part.sha256}`).join("\n")).digest("hex");
  }

  private async hashFile(filePath: string): Promise<string> {
    return (await this.summarizeFile(filePath)).sha256;
  }
  private async summarizeFile(filePath: string): Promise<{ sha256: string; rowCount: number }> {
    const hash = createHash("sha256");
    let rowCount = 0;
    let lastByte: number | null = null;
    for await (const raw of fs.createReadStream(filePath)) {
      const chunk = raw as Buffer;
      hash.update(chunk);
      for (const byte of chunk) if (byte === 10) rowCount++;
      if (chunk.length > 0) lastByte = chunk[chunk.length - 1]!;
    }
    if (lastByte !== null && lastByte !== 10) {
      throw new Error(`Emit partition lacks terminal newline: ${path.basename(filePath)}`);
    }
    return { sha256: hash.digest("hex"), rowCount };
  }
}
