import { Module } from '@nestjs/common';
import { AgentGatewayModule } from '../agent-gateway/agent-gateway.module';
import { TokensModule } from '../tokens/tokens.module';
import { NodesController } from './nodes.controller';
import { NodesService } from './nodes.service';

@Module({
  imports: [AgentGatewayModule, TokensModule],
  controllers: [NodesController],
  providers: [NodesService],
  exports: [NodesService],
})
export class NodesModule {}
