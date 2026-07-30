import 'reflect-metadata';
import { describe, expect, it } from 'bun:test';
import { Test } from '@nestjs/testing';
import { PANEL_API_VERSION } from '@swifty/sdk';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('reports ok with the current panel API version', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
    }).compile();

    const controller = moduleRef.get(HealthController);
    const response = controller.check();

    expect(response.status).toBe('ok');
    expect(response.panelApiVersion).toBe(PANEL_API_VERSION);
    expect(response.uptimeSeconds).toBeGreaterThanOrEqual(0);
  });
});
