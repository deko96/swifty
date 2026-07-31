import 'reflect-metadata';
import { Logger, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { WsAdapter } from '@nestjs/platform-ws';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { apiReference } from '@scalar/nestjs-api-reference';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { TOKEN_PREFIX } from './common/crypto';
import { SESSION_COOKIE } from './common/types';
import { EnvService } from './config/env.service';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  app.use(cookieParser());
  app.useWebSocketAdapter(new WsAdapter(app));
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.enableShutdownHooks();

  const openApiConfig = new DocumentBuilder()
    .setTitle('Swifty API')
    .setDescription(
      'The Swifty panel API: everything the web UI can do, you can do here too — manage ' +
        'accounts, game servers, and the machines they run on.\n\n' +
        '**Getting access.** Sign in with `POST /api/v1/auth/login`; the session cookie it ' +
        'sets authenticates later requests. For scripts and integrations, use an API key ' +
        `instead: send it as \`Authorization: Bearer ${TOKEN_PREFIX.ApiKey}_...\`.\n\n` +
        '**Roles.** `admin` accounts manage the whole panel; `user` accounts only see their ' +
        'own game servers.\n\n' +
        '**Errors.** Every error response has the same shape: `{ code, message, details?, ' +
        'requestId }`. `code` is a stable identifier (for example `auth.invalid_credentials`) ' +
        'that you can rely on and translate; `message` is an English fallback. Validation ' +
        'errors (`validation.failed`) list each invalid field under `details`. Include the ' +
        '`requestId` when reporting a problem — it lets the operator find the exact request ' +
        'in the logs.',
    )
    .setVersion('0.1.0')
    .addCookieAuth(SESSION_COOKIE)
    .addBearerAuth({
      type: 'http',
      scheme: 'bearer',
      description: `API key (${TOKEN_PREFIX.ApiKey}_...)`,
    })
    .build();
  const document = SwaggerModule.createDocument(app, openApiConfig);

  app.use('/api/openapi.json', (_req: unknown, res: { json: (body: unknown) => void }) =>
    res.json(document),
  );
  app.use('/api/docs', apiReference({ content: document, theme: 'purple' }));

  const env = app.get(EnvService);
  await app.listen(env.httpPort, env.httpHost);

  const logger = new Logger('Bootstrap');
  logger.log(`Panel API listening on http://${env.httpHost}:${env.httpPort}/api/v1`);
  logger.log(`API reference available at http://${env.httpHost}:${env.httpPort}/api/docs`);
}

await bootstrap();
