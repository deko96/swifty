import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PANEL_API_VERSION } from '@swifty/sdk';
import { Public } from '../../common/decorators/public.decorator';

interface HealthResponse {
  status: 'ok';
  uptimeSeconds: number;
  panelApiVersion: string;
}

@ApiTags('Health')
@Controller('health')
export class HealthController {
  @Public()
  @Get()
  @ApiOperation({
    summary: 'Panel health',
    description:
      'Always available without signing in; used by monitoring to check the panel is up.',
  })
  @ApiOkResponse({ description: 'The panel is running.' })
  check(): HealthResponse {
    return {
      status: 'ok',
      uptimeSeconds: Math.round(process.uptime()),
      panelApiVersion: PANEL_API_VERSION,
    };
  }
}
