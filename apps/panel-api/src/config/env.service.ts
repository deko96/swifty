import { Injectable } from '@nestjs/common';
// Value import required: Nest resolves the injection token from decorator
// metadata, which a type-only import would erase.
import { ConfigService } from '@nestjs/config';
import type { Env } from './env';

/** Typed accessor over the validated environment; inject this, not ConfigService. */
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

  get databaseUrl(): string {
    return this.config.get('DATABASE_URL', { infer: true });
  }

  get redisUrl(): string {
    return this.config.get('REDIS_URL', { infer: true });
  }

  get appSecret(): string {
    return this.config.get('APP_SECRET', { infer: true });
  }
}
