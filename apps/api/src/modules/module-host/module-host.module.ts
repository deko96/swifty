import { Module } from '@nestjs/common';
import { ModuleLoaderService } from './module-loader.service';

@Module({
  providers: [ModuleLoaderService],
  exports: [ModuleLoaderService],
})
export class ModuleHostModule {}
