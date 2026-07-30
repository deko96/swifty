import { Controller, Get } from '@nestjs/common';
import { PANEL_API_VERSION } from '@swifty/sdk';

interface HealthResponse {
  status: 'ok';
  uptimeSeconds: number;
  panelApiVersion: string;
}

@Controller('health')
export class HealthController {
  @Get()
  check(): HealthResponse {
    return {
      status: 'ok',
      uptimeSeconds: Math.round(process.uptime()),
      panelApiVersion: PANEL_API_VERSION,
    };
  }
}
