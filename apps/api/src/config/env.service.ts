import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from './env';
import { DEFAULT_CONFIG_DIR } from './panel-config';

@Injectable()
export class EnvService {
  constructor(private readonly config: ConfigService<Env, true>) {}

  get nodeEnv(): Env['NODE_ENV'] {
    return this.config.get('NODE_ENV', { infer: true });
  }

  get httpHost(): string {
    return this.config.get('HTTP_HOST', { infer: true });
  }

  get httpPort(): number {
    return this.config.get('HTTP_PORT', { infer: true });
  }

  get databaseUrl(): string | undefined {
    return this.config.get('DATABASE_URL', { infer: true });
  }

  get configDir(): string {
    return this.config.get('CONFIG_DIR', { infer: true }) ?? DEFAULT_CONFIG_DIR;
  }

  get redisUrl(): string {
    return this.config.get('REDIS_URL', { infer: true });
  }

  get appSecret(): string {
    return this.config.get('APP_SECRET', { infer: true });
  }

  get modulesDir(): string | undefined {
    return this.config.get('MODULES_DIR', { infer: true });
  }

  get panelUrl(): string | undefined {
    return this.config.get('PANEL_URL', { infer: true });
  }
}
