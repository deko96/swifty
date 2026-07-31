import { Body, Controller, Get, Post, Req, Res } from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { errorResponseSchema } from '../../common/error.schemas';
import { apiSchema } from '../../common/openapi';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { setSessionCookie } from '../../common/session-cookie';
import { type AuthenticatedRequest, SESSION_COOKIE } from '../../common/types';
import { EnvService } from '../../config/env.service';
import type { User } from '../../db/schema';
import { toUserResponse } from '../users/users.serializer';
import { type LoginBody, loginSchema, userResponseSchema } from './auth.schemas';
import { AuthService, SESSION_TTL_MS } from './auth.service';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly env: EnvService,
  ) {}

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  @ApiOperation({
    summary: 'Sign in',
    description:
      'Checks the email and password of a panel account. On success, a session cookie is set ' +
      'on the response; the browser sends it automatically on every later request. Sessions ' +
      'last 7 days.',
  })
  @ApiOkResponse({
    description: 'Signed in; session cookie set.',
    schema: apiSchema(userResponseSchema),
  })
  @ApiUnauthorizedResponse({
    description: 'Unknown email or wrong password.',
    schema: apiSchema(errorResponseSchema),
  })
  async login(
    @Body(new ZodValidationPipe(loginSchema)) body: LoginBody,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { user, token } = await this.authService.login(body.email, body.password, {
      ip: request.ip,
      userAgent: request.headers['user-agent'],
    });

    setSessionCookie(response, token, {
      secure: this.env.nodeEnv === 'production',
      maxAge: SESSION_TTL_MS,
    });

    return toUserResponse(user);
  }

  @Post('logout')
  @ApiCookieAuth()
  @ApiOperation({
    summary: 'Sign out',
    description: 'Ends the current session and clears the session cookie.',
  })
  @ApiOkResponse({ description: 'Signed out.' })
  async logout(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    const token = request.cookies?.[SESSION_COOKIE];
    if (typeof token === 'string') {
      await this.authService.logout(token);
    }
    response.clearCookie(SESSION_COOKIE, { path: '/' });
    return { success: true };
  }

  @Get('me')
  @ApiCookieAuth()
  @ApiOperation({
    summary: 'Who am I',
    description: 'Returns the account that owns the current session or API key.',
  })
  @ApiOkResponse({ description: 'The signed-in account.', schema: apiSchema(userResponseSchema) })
  me(@CurrentUser() user: User) {
    return toUserResponse(user);
  }
}
