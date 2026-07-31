import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { AuthGuard } from './common/guards/auth.guard';
import { isHttpContext } from './common/guards/is-http-context';
import { RolesGuard } from './common/guards/roles.guard';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { EnvModule } from './config/env.module';
import { DatabaseModule } from './db/database.module';
import { AgentGatewayModule } from './modules/agent-gateway/agent-gateway.module';
import { AuthModule } from './modules/auth/auth.module';
import { EventsModule } from './modules/events/events.module';
import { HealthModule } from './modules/health/health.module';
import { ModuleHostModule } from './modules/module-host/module-host.module';
import { NodesModule } from './modules/nodes/nodes.module';
import { ServersModule } from './modules/servers/servers.module';
import { SettingsModule } from './modules/settings/settings.module';
import { SetupModule } from './modules/setup/setup.module';
import { TemplatesModule } from './modules/templates/templates.module';
import { UsersModule } from './modules/users/users.module';

@Module({
  imports: [
    EnvModule,
    DatabaseModule,
    SettingsModule,
    EventsModule,
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60_000, limit: 120 }],
      skipIf: (context) => !isHttpContext(context),
    }),
    HealthModule,
    AgentGatewayModule,
    AuthModule,
    SetupModule,
    UsersModule,
    NodesModule,
    TemplatesModule,
    ServersModule,
    ModuleHostModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes('*path');
  }
}
