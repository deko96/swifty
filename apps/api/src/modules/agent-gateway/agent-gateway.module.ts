import { Module } from '@nestjs/common';
import { AgentGateway } from './agent.gateway';
import { AgentAuthService } from './agent-auth.service';
import { AgentGatewayService } from './agent-gateway.service';
import { AgentRegistry } from './agent-registry';

@Module({
  providers: [AgentRegistry, AgentAuthService, AgentGatewayService, AgentGateway],
  exports: [AgentRegistry, AgentGatewayService],
})
export class AgentGatewayModule {}
