/*
<MODULE_CONTRACT>
<purpose>Capture detailed environment profile for audit reproducibility and transparency.</purpose>
<keywords>environment, profile, system, hardware, transparency, reproducibility</keywords>
<responsibilities>
  <item>Collect CPU, memory, OS, and Node.js version information.</item>
  <item>Collect tool versions (lighthouse, chrome, playwright, axe-core).</item>
  <item>Record network location and brief configuration.</item>
  <item>Emit environment-profile.json and environment-profile.md artifacts.</item>
</responsibilities>
<non-goals>
  <item>Do not modify system state.</item>
  <item>Do not perform network speed tests.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="getCpuInfo">CPU model, cores, speed via systeminformation.</entry>
  <entry key="getMemInfo">Total memory via systeminformation.</entry>
  <entry key="getOsInfo">Platform, distro, release, arch via systeminformation.</entry>
  <entry key="getToolVersions">Dynamic import versions of playwright, axe-core, and systeminformation.</entry>
  <entry key="CaptureEnvironmentProfileGogol">Gogol that captures environment profile.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Initial implementation: capture OS, Node, and tool versions into JSON and Markdown artifacts.</item>
  <item>Remove axe prefix from brief field references - this app is Axe-only.</item>
  <item>Phase B cleanup: remove deprecated auditYear, auditToken, cohortId, auditSampleSize, randomSeed, fixtureDir from brief snapshot.</item>
  <item>Skip re-run when environment-profile.json already exists in output directory.</item>
  <item>Fix formatMarkdown: replace stale lighthouse/cohort fields with actual brief fields (sourceToken, auditYear, concurrency, timeoutMs, retries).</item>
</CHANGE_SUMMARY>
*/

import os from 'node:os';
import path from 'node:path';
import { parseSourceToken } from '@org/observatory-crypto';
import si from 'systeminformation';
import { fileExists } from '@org/pipeline-node';
import { Gogol } from '../pipeline/Gogol.js';
import type { PipelineContext } from '../pipeline/types.js';

type ToolVersion = {
  name: string;
  version: string | null;
  error?: string;
};

export class CaptureEnvironmentProfileGogol extends Gogol {
  override readonly id = 'capture-environment-profile';

  override async shouldSkip(ctx: PipelineContext): Promise<boolean> {
    if (await super.shouldSkip(ctx)) return true;
    const resultsPath = path.join(ctx.getGogolOutputDir(this.id), 'environment-profile.json');
    if (await fileExists(resultsPath)) {
      console.log('[capture-environment-profile] Results already exist, skipping.');
      return true;
    }
    return false;
  }

  override async run(ctx: PipelineContext): Promise<void> {
    const { brief } = ctx.state;

    // Derive year from sourceToken (B.1 cleanup)
    const { year } = parseSourceToken(brief.sourceToken);

    console.log('[capture-environment-profile] Collecting system information...');

    // Collect system information
    const [cpu, mem, osInfo] = await Promise.all([
      si.cpu(),
      si.mem(),
      si.osInfo(),
    ]);

    // Collect tool versions
    const toolVersions = await this.getToolVersions();

    // Build profile
    const profile = {
      capturedAt: new Date().toISOString(),
      nodejs: {
        version: process.version,
        arch: process.arch,
        platform: process.platform,
        execPath: process.execPath,
      },
      system: {
        platform: os.platform(),
        release: os.release(),
        arch: os.arch(),
        cpus: os.cpus().length,
        totalMemory: os.totalmem(),
        freeMemory: os.freemem(),
      },
      hardware: {
        cpu: {
          manufacturer: cpu.manufacturer,
          brand: cpu.brand,
          speed: cpu.speed,
          cores: cpu.cores,
          physicalCores: cpu.physicalCores,
          processors: cpu.processors,
        },
        memory: {
          total: mem.total,
          totalFormatted: this.formatBytes(mem.total),
          free: mem.free,
          freeFormatted: this.formatBytes(mem.free),
          used: mem.used,
          usedFormatted: this.formatBytes(mem.used),
        },
      },
      os: {
        platform: osInfo.platform,
        distro: osInfo.distro,
        release: osInfo.release,
        codename: osInfo.codename,
        kernel: osInfo.kernel,
        arch: osInfo.arch,
        hostname: osInfo.hostname,
      },
      tools: toolVersions,
      brief: {
        sourceToken: brief.sourceToken,
        auditYear: year,
        concurrency: brief.concurrency,
        timeoutMs: brief.timeoutMs,
        retries: brief.retries,
      },
    };

    const outDir = ctx.getGogolOutputDir(this.id);

    // Write JSON artifact
    await ctx.writeTextFile(
      path.join(outDir, 'environment-profile.json'),
      JSON.stringify(profile, null, 2),
    );

    // Write Markdown artifact
    await ctx.writeTextFile(
      path.join(outDir, 'environment-profile.md'),
      this.formatMarkdown(profile),
    );

    console.log(`[capture-environment-profile] Done. CPU: ${profile.hardware.cpu.brand}, Memory: ${profile.hardware.memory.totalFormatted}`);
  }

  private async getToolVersions(): Promise<ToolVersion[]> {
    const tools: ToolVersion[] = [];

    // Lighthouse version
    try {
      const lighthouse = await import('lighthouse');
      tools.push({
        name: 'lighthouse',
        version: (lighthouse as { default?: { version?: string } }).default?.version ?? null,
      });
    } catch (_e) {
      tools.push({ name: 'lighthouse', version: null, error: 'Not installed or import failed' });
    }

    // Chrome/Chrome-launcher info
    try {
      const chromeLauncher = await import('chrome-launcher');
      tools.push({
        name: 'chrome-launcher',
        version: (chromeLauncher as { Launcher?: { getInstallations?: unknown } }).Launcher ? 'installed' : null,
      });
    } catch (_e) {
      tools.push({ name: 'chrome-launcher', version: null, error: 'Not installed' });
    }

    // Playwright version
    try {
      const playwright = await import('playwright');
      tools.push({
        name: 'playwright',
        version: (playwright as { chromium?: { browserType?: { version?: () => string } } }).chromium?.browserType?.version?.() ?? 'installed',
      });
    } catch (_e) {
      tools.push({ name: 'playwright', version: null, error: 'Not installed' });
    }

    // Axe-core version
    try {
      const axeCore = await import('axe-core');
      tools.push({
        name: 'axe-core',
        version: (axeCore as { default?: { version?: string } }).default?.version ?? null,
      });
    } catch (_e) {
      tools.push({ name: 'axe-core', version: null, error: 'Not installed' });
    }

    // Systeminformation version (used by this gogol)
    try {
      const siModule = await import('systeminformation');
      tools.push({
        name: 'systeminformation',
        version: (siModule as { version?: () => string }).version?.() ?? 'installed',
      });
    } catch (_e) {
      tools.push({ name: 'systeminformation', version: null, error: 'Not installed' });
    }

    return tools;
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  }

  private formatMarkdown(profile: Record<string, unknown>): string {
    const lines: string[] = [
      '# Environment Profile',
      '',
      `**Captured:** ${profile.capturedAt as string}  `,
      '',
      '## System',
      '',
      `- **Platform:** ${(profile.system as { platform: string }).platform}  `,
      `- **OS:** ${(profile.os as { distro: string }).distro} ${(profile.os as { release: string }).release}  `,
      `- **Kernel:** ${(profile.os as { kernel: string }).kernel}  `,
      `- **Architecture:** ${(profile.system as { arch: string }).arch}  `,
      `- **Hostname:** ${(profile.os as { hostname: string }).hostname}  `,
      '',
      '## Hardware',
      '',
      `- **CPU:** ${(profile.hardware as { cpu: { brand: string } }).cpu.brand}  `,
      `- **CPU Cores:** ${(profile.hardware as { cpu: { cores: number } }).cpu.cores} logical / ${(profile.hardware as { cpu: { physicalCores: number } }).cpu.physicalCores} physical  `,
      `- **CPU Speed:** ${(profile.hardware as { cpu: { speed: number } }).cpu.speed} GHz  `,
      `- **Memory:** ${(profile.hardware as { memory: { totalFormatted: string } }).memory.totalFormatted} total / ${(profile.hardware as { memory: { freeFormatted: string } }).memory.freeFormatted} free  `,
      '',
      '## Node.js',
      '',
      `- **Version:** ${(profile.nodejs as { version: string }).version}  `,
      `- **Architecture:** ${(profile.nodejs as { arch: string }).arch}  `,
      `- **Platform:** ${(profile.nodejs as { platform: string }).platform}  `,
      '',
      '## Tools',
      '',
      ...((profile.tools as ToolVersion[]).map((t) =>
        `- **${t.name}:** ${t.version ?? 'N/A'}${t.error ? ` (${t.error})` : ''}  `
      )),
      '',
      '## Audit Configuration',
      '',
      `- **Source Token:** ${(profile.brief as { sourceToken: string }).sourceToken}  `,
      `- **Audit Year:** ${(profile.brief as { auditYear: number }).auditYear}  `,
      `- **Concurrency:** ${(profile.brief as { concurrency: number }).concurrency}  `,
      `- **Timeout:** ${(profile.brief as { timeoutMs: number }).timeoutMs}ms  `,
      `- **Retries:** ${(profile.brief as { retries: number }).retries}  `,
    ];

    return lines.join('\n');
  }
}
