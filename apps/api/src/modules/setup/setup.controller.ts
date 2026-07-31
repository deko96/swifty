import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { errorResponseSchema } from '../../common/error.schema';
import { apiSchema } from '../../common/openapi';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { setSessionCookie } from '../../common/session-cookie';
import type { AuthenticatedRequest } from '../../common/types';
import { EnvService } from '../../config/env.service';
import { userResponseSchema } from '../auth/auth.schemas';
import { AuthService, SESSION_TTL_MS } from '../auth/auth.service';
import { toUserResponse } from '../users/users.serializer';
import { DatabaseTestService } from './database-test.service';
import {
  type CompleteSetupBody,
  completeSetupSchema,
  type DatabaseSetupBody,
  databaseSetupSchema,
  databaseTestResponseSchema,
  setupChecksResponseSchema,
  setupStatusSchema,
} from './setup.schemas';
import { SetupService } from './setup.service';
import { SetupChecksService } from './setup-checks.service';

@ApiTags('Setup')
@Controller('setup')
export class SetupController {
  constructor(
    private readonly setupService: SetupService,
    private readonly checksService: SetupChecksService,
    private readonly databaseTestService: DatabaseTestService,
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
    return {
      required: await this.setupService.isRequired(),
      databaseConfigured: this.setupService.isDatabaseConfigured(),
    };
  }

  @Public()
  @Get('checks')
  @ApiOperation({
    summary: 'Check the host environment',
    description:
      'Probes the machine the panel runs on for the requirements the setup wizard cares ' +
      'about: a writable temp directory, outbound HTTPS access, the ability to open ' +
      'listening sockets, and enough memory and disk. Each check reports pass or fail with ' +
      'a plain-language detail line. Only available until setup is completed.',
  })
  @ApiOkResponse({
    description: 'One result per requirement.',
    schema: apiSchema(setupChecksResponseSchema),
  })
  @ApiConflictResponse({
    description: 'Setup has already been completed.',
    schema: apiSchema(errorResponseSchema),
  })
  async checks() {
    await this.setupService.ensurePending();
    return this.checksService.run();
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('database-test')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Test a database connection',
    description:
      'Opens a fresh connection to the PostgreSQL server described in the request and reports ' +
      'what it found: the server version, its encoding (the panel requires UTF8), and whether ' +
      'the database user is allowed to create tables. The wizard calls this while you fill in ' +
      'the database step, before anything is saved. A failed connection is reported in the ' +
      'response, not as an error. Requires the one-time setup code and is only available ' +
      'until setup is completed.',
  })
  @ApiOkResponse({
    description: 'What the connection attempt found.',
    schema: apiSchema(databaseTestResponseSchema),
  })
  @ApiForbiddenResponse({
    description: 'Missing or wrong setup code.',
    schema: apiSchema(errorResponseSchema),
  })
  @ApiConflictResponse({
    description: 'Setup has already been completed.',
    schema: apiSchema(errorResponseSchema),
  })
  async databaseTest(@Body(new ZodValidationPipe(databaseSetupSchema)) body: DatabaseSetupBody) {
    await this.setupService.ensurePending();
    await this.setupService.verifyCode(body.setupCode);
    return this.databaseTestService.run(body.database);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('database')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Save the database and run migrations',
    description:
      'Makes the PostgreSQL server described in the request the panel database. The ' +
      'connection is tested first; if it works, the credentials are saved to the panel ' +
      "config file (config/config.yml, readable only by the panel's user), the panel " +
      'connects, and all pending migrations run. After this step the rest of the wizard — ' +
      'creating the administrator — can complete. Requires the one-time setup code, works ' +
      'only while no database is configured yet, and is only available until setup is ' +
      'completed.',
  })
  @ApiOkResponse({
    description: 'The database was saved and migrated; details of the tested connection.',
    schema: apiSchema(databaseTestResponseSchema),
  })
  @ApiForbiddenResponse({
    description: 'Missing or wrong setup code.',
    schema: apiSchema(errorResponseSchema),
  })
  @ApiConflictResponse({
    description: 'Setup has already been completed, or a database is already configured.',
    schema: apiSchema(errorResponseSchema),
  })
  @ApiUnprocessableEntityResponse({
    description: 'The database could not be reached or is not usable.',
    schema: apiSchema(errorResponseSchema),
  })
  async configureDatabase(
    @Body(new ZodValidationPipe(databaseSetupSchema)) body: DatabaseSetupBody,
  ) {
    return this.setupService.configureDatabase(body);
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
