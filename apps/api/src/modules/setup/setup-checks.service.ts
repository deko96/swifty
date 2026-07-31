import { randomUUID } from 'node:crypto';
import { rm, statfs, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir, totalmem } from 'node:os';
import { join } from 'node:path';
import { Injectable } from '@nestjs/common';
import { SetupCheck } from '@swifty/sdk';
import { EnvService } from '../../config/env.service';
import type { SetupCheckResult, SetupChecksResponse } from './setup.schemas';

export const MIN_MEMORY_MIB = 1024;
export const MIN_DISK_MIB = 1024;
export const OUTBOUND_PROBE_URL = 'https://api.github.com';
export const PROBE_TIMEOUT_MS = 5_000;

const MIB = 1024 * 1024;

@Injectable()
export class SetupChecksService {
  constructor(private readonly env: EnvService) {}

  async run(): Promise<SetupChecksResponse> {
    const checks = await Promise.all([
      this.dataWrite(),
      this.outboundHttps(),
      this.portBind(),
      this.memory(),
      this.disk(),
    ]);
    return { ok: checks.every((check) => check.ok), checks };
  }

  private async dataWrite(): Promise<SetupCheckResult> {
    const probePath = join(tmpdir(), `swifty-setup-${randomUUID()}`);
    try {
      await writeFile(probePath, 'probe');
      return { id: SetupCheck.DataWrite, ok: true, detail: `${tmpdir()} is writable` };
    } catch (error) {
      return { id: SetupCheck.DataWrite, ok: false, detail: describeFailure(error) };
    } finally {
      await rm(probePath, { force: true });
    }
  }

  private async outboundHttps(): Promise<SetupCheckResult> {
    try {
      await fetch(OUTBOUND_PROBE_URL, {
        method: 'HEAD',
        signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      });
      return { id: SetupCheck.OutboundHttps, ok: true, detail: `Reached ${OUTBOUND_PROBE_URL}` };
    } catch (error) {
      return {
        id: SetupCheck.OutboundHttps,
        ok: false,
        detail: `Could not reach ${OUTBOUND_PROBE_URL}: ${describeFailure(error)}`,
      };
    }
  }

  private async portBind(): Promise<SetupCheckResult> {
    const host = this.env.httpHost;
    try {
      await new Promise<void>((resolve, reject) => {
        const probe = createServer();
        probe.unref();
        probe.once('error', reject);
        probe.listen({ host, port: 0 }, () => probe.close(() => resolve()));
      });
      return { id: SetupCheck.PortBind, ok: true, detail: `Can open listening sockets on ${host}` };
    } catch (error) {
      return {
        id: SetupCheck.PortBind,
        ok: false,
        detail: `Cannot bind on ${host}: ${describeFailure(error)}`,
      };
    }
  }

  private memory(): SetupCheckResult {
    const totalMib = Math.floor(totalmem() / MIB);
    return {
      id: SetupCheck.Memory,
      ok: totalMib >= MIN_MEMORY_MIB,
      detail: `${totalMib} MiB of system memory (minimum ${MIN_MEMORY_MIB} MiB)`,
    };
  }

  private async disk(): Promise<SetupCheckResult> {
    try {
      const stats = await statfs(process.cwd());
      const freeMib = Math.floor((stats.bavail * stats.bsize) / MIB);
      return {
        id: SetupCheck.Disk,
        ok: freeMib >= MIN_DISK_MIB,
        detail: `${freeMib} MiB of free disk space (minimum ${MIN_DISK_MIB} MiB)`,
      };
    } catch (error) {
      return { id: SetupCheck.Disk, ok: false, detail: describeFailure(error) };
    }
  }
}

function describeFailure(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
