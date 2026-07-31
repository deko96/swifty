import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from '@swifty/sdk';
import { z } from 'zod';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { errorResponseSchema } from '../../common/error.schema';
import { apiSchema } from '../../common/openapi';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { User } from '../../db/schema';
import {
  type CreateServerBody,
  createServerSchema,
  serverResponseSchema,
  type UpdateServerBody,
  updateServerSchema,
} from './servers.schemas';
import { toServerResponse } from './servers.serializer';
import { ServersService } from './servers.service';

@ApiTags('Servers')
@ApiCookieAuth()
@Controller('servers')
export class ServersController {
  constructor(private readonly serversService: ServersService) {}

  @Get()
  @ApiOperation({
    summary: 'List servers',
    description:
      'Administrators see every game server on the panel; other accounts see only the ' +
      'servers they own.',
  })
  @ApiOkResponse({
    description: 'The servers you can access.',
    schema: apiSchema(z.array(serverResponseSchema)),
  })
  async list(@CurrentUser() user: User) {
    return (await this.serversService.listFor(user)).map(toServerResponse);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get a server',
    description:
      'Returns one game server. Non-admin accounts can only fetch servers they own; anything ' +
      'else responds as not found.',
  })
  @ApiOkResponse({ description: 'The server.', schema: apiSchema(serverResponseSchema) })
  @ApiNotFoundResponse({
    description: 'No server with this ID (or no access to it).',
    schema: apiSchema(errorResponseSchema),
  })
  async get(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return toServerResponse(await this.serversService.findFor(user, id));
  }

  @Post()
  @Roles(UserRole.Admin)
  @ApiForbiddenResponse({
    description: 'Requires the admin role.',
    schema: apiSchema(errorResponseSchema),
  })
  @ApiOperation({
    summary: 'Create a server',
    description:
      'Creates a game server for a user: picks the game template, places it on a node, and ' +
      'claims a free allocation as its primary IP:port. Template variables not provided use ' +
      'their defaults; every value is validated against the template rules. The server ' +
      'starts in the installing state. Admin only.',
  })
  @ApiCreatedResponse({
    description: 'The created server.',
    schema: apiSchema(serverResponseSchema),
  })
  @ApiConflictResponse({
    description: 'The allocation is unavailable on this node.',
    schema: apiSchema(errorResponseSchema),
  })
  async create(@Body(new ZodValidationPipe(createServerSchema)) body: CreateServerBody) {
    return toServerResponse(await this.serversService.create(body));
  }

  @Patch(':id')
  @Roles(UserRole.Admin)
  @ApiForbiddenResponse({
    description: 'Requires the admin role.',
    schema: apiSchema(errorResponseSchema),
  })
  @ApiOperation({
    summary: 'Update a server',
    description:
      'Changes name, resource limits, or template variables. Provided variables are merged ' +
      'into the existing ones and validated against the template rules. Admin only.',
  })
  @ApiOkResponse({ description: 'The updated server.', schema: apiSchema(serverResponseSchema) })
  @ApiNotFoundResponse({
    description: 'No server with this ID.',
    schema: apiSchema(errorResponseSchema),
  })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateServerSchema)) body: UpdateServerBody,
  ) {
    return toServerResponse(await this.serversService.update(id, body));
  }

  @Delete(':id')
  @Roles(UserRole.Admin)
  @HttpCode(204)
  @ApiForbiddenResponse({
    description: 'Requires the admin role.',
    schema: apiSchema(errorResponseSchema),
  })
  @ApiOperation({
    summary: 'Delete a server',
    description:
      'Permanently removes a game server and frees its allocations. Files on the node are ' +
      'removed by the daemon. Admin only.',
  })
  @ApiNoContentResponse({ description: 'Server deleted.' })
  @ApiNotFoundResponse({
    description: 'No server with this ID.',
    schema: apiSchema(errorResponseSchema),
  })
  async delete(@Param('id', ParseUUIDPipe) id: string) {
    await this.serversService.delete(id);
  }
}
