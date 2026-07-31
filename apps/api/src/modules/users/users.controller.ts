import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { z } from 'zod';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { apiSchema } from '../../common/openapi';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { User } from '../../db/schema';
import { userResponseSchema } from '../auth/auth.schemas';
import { type CreateUserBody, createUserSchema } from './users.schemas';
import { toUserResponse } from './users.serializer';
import { UsersService } from './users.service';

@ApiTags('Users')
@ApiCookieAuth()
@ApiForbiddenResponse({ description: 'Requires the admin role.' })
@Roles('admin')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiOperation({
    summary: 'List all users',
    description: 'Returns every panel account, oldest first. Admin only.',
  })
  @ApiOkResponse({ description: 'All accounts.', schema: apiSchema(z.array(userResponseSchema)) })
  async list() {
    return (await this.usersService.list()).map(toUserResponse);
  }

  @Post()
  @ApiOperation({
    summary: 'Create a user',
    description: 'Creates a new panel account with the given role. Admin only.',
  })
  @ApiCreatedResponse({
    description: 'The created account.',
    schema: apiSchema(userResponseSchema),
  })
  async create(@Body(new ZodValidationPipe(createUserSchema)) body: CreateUserBody) {
    return toUserResponse(await this.usersService.create(body));
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get a user',
    description: 'Returns one account by its ID. Admin only.',
  })
  @ApiOkResponse({ description: 'The account.', schema: apiSchema(userResponseSchema) })
  @ApiNotFoundResponse({ description: 'No account with this ID.' })
  async get(@Param('id', ParseUUIDPipe) id: string) {
    return toUserResponse(await this.usersService.findById(id));
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Delete a user',
    description:
      'Permanently deletes an account and its sessions and API keys. You cannot delete your ' +
      'own account. Admin only.',
  })
  @ApiNoContentResponse({ description: 'Account deleted.' })
  @ApiNotFoundResponse({ description: 'No account with this ID.' })
  async delete(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    if (user.id === id) {
      throw new BadRequestException('You cannot delete your own account');
    }
    await this.usersService.delete(id);
  }
}
