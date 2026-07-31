import { describe, expect, it } from 'bun:test';
import { SETUP_CHECK_VALUES, SetupCheck } from '@swifty/sdk';
import type { EnvService } from '../../config/env.service';
import { SetupChecksService } from './setup-checks.service';

describe('SetupChecksService', () => {
  const service = new SetupChecksService({ httpHost: '127.0.0.1' } as EnvService);

  it('reports one result per requirement, each with a detail line', async () => {
    const result = await service.run();

    expect(result.checks.map((check) => check.id)).toEqual([...SETUP_CHECK_VALUES]);
    for (const check of result.checks) {
      expect(check.detail.length).toBeGreaterThan(0);
    }
    expect(result.ok).toBe(result.checks.every((check) => check.ok));
  });

  it('passes the machine-local checks on a working host', async () => {
    const result = await service.run();
    const byId = new Map(result.checks.map((check) => [check.id, check]));

    expect(byId.get(SetupCheck.DataWrite)?.ok).toBe(true);
    expect(byId.get(SetupCheck.PortBind)?.ok).toBe(true);
    expect(byId.get(SetupCheck.Memory)?.ok).toBe(true);
    expect(byId.get(SetupCheck.Disk)?.ok).toBe(true);
  });
});
