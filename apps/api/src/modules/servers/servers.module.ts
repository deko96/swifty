import { Module } from '@nestjs/common';
import { NodesModule } from '../nodes/nodes.module';
import { TemplatesModule } from '../templates/templates.module';
import { ServersController } from './servers.controller';
import { ServersService } from './servers.service';

@Module({
  imports: [TemplatesModule, NodesModule],
  controllers: [ServersController],
  providers: [ServersService],
  exports: [ServersService],
})
export class ServersModule {}
