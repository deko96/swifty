import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DatabaseTestService } from './database-test.service';
import { SetupController } from './setup.controller';
import { SetupService } from './setup.service';
import { SetupChecksService } from './setup-checks.service';

@Module({
  imports: [AuthModule],
  controllers: [SetupController],
  providers: [SetupService, SetupChecksService, DatabaseTestService],
})
export class SetupModule {}
