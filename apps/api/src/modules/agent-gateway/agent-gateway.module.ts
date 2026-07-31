import { Module } from '@nestjs/common';
import { AgentGateway } from './agent.gateway';
import { AgentRegistry } from './agent.registry';
import { AgentAuthService } from './agent-auth.service';
import { AgentGatewayService } from './agent-gateway.service';
import { ServerStateService } from './server-state.service';

@Module({
  providers: [
    AgentRegistry,
    AgentAuthService,
    AgentGatewayService,
    AgentGateway,
    ServerStateService,
  ],
  exports: [AgentRegistry, AgentGatewayService],
})
export class AgentGatewayModule {}
