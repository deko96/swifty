import 'reflect-metadata';
import { Logger, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { EnvService } from './config/env.service';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.enableShutdownHooks();

  const env = app.get(EnvService);
  await app.listen(env.httpPort, env.httpHost);

  new Logger('Bootstrap').log(
    `Panel API listening on http://${env.httpHost}:${env.httpPort}/api/v1`,
  );
}

await bootstrap();
