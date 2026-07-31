import { Body, Controller, Get, Post, Req, Res } from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { errorResponseSchema } from '../../common/error.schemas';
import { apiSchema } from '../../common/openapi';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { setSessionCookie } from '../../common/session-cookie';
import type { AuthenticatedRequest } from '../../common/types';
import { EnvService } from '../../config/env.service';
import { userResponseSchema } from '../auth/auth.schemas';
import { AuthService, SESSION_TTL_MS } from '../auth/auth.service';
import { toUserResponse } from '../users/users.serializer';
import { type CompleteSetupBody, completeSetupSchema, setupStatusSchema } from './setup.schemas';
import { SetupService } from './setup.service';

@ApiTags('Setup')
@Controller('setup')
export class SetupController {
  constructor(
    private readonly setupService: SetupService,
    private readonly authService: AuthService,
    private readonly env: EnvService,
  ) {}

  @Public()
  @Get()
  @ApiOperation({
    summary: 'Is setup required?',
    description:
      'Tells you whether this panel still needs its first-run setup. The web UI calls this to ' +
      'decide whether to show the setup wizard or the login screen.',
  })
  @ApiOkResponse({ description: 'Current setup state.', schema: apiSchema(setupStatusSchema) })
  async status() {
    return { required: await this.setupService.isRequired() };
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post()
  @ApiOperation({
    summary: 'Complete first-run setup',
    description:
      'Creates the first administrator account and names the panel. Requires the one-time ' +
      'setup code printed in the panel console at startup, so only the person who installed ' +
      'the panel can claim it. Works exactly once: after an administrator exists, this ' +
      'endpoint always responds with a conflict error. On success you are signed in ' +
      'immediately via a session cookie.',
  })
  @ApiCreatedResponse({
    description: 'Setup completed; the created administrator is signed in.',
    schema: apiSchema(userResponseSchema),
  })
  @ApiForbiddenResponse({
    description: 'Missing or wrong setup code.',
    schema: apiSchema(errorResponseSchema),
  })
  @ApiConflictResponse({
    description: 'Setup has already been completed.',
    schema: apiSchema(errorResponseSchema),
  })
  async complete(
    @Body(new ZodValidationPipe(completeSetupSchema)) body: CompleteSetupBody,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    const admin = await this.setupService.complete(body);

    const token = await this.authService.createSession(admin, {
      ip: request.ip,
      userAgent: request.headers['user-agent'],
    });
    setSessionCookie(response, token, {
      secure: this.env.nodeEnv === 'production',
      maxAge: SESSION_TTL_MS,
    });

    return toUserResponse(admin);
  }
}
