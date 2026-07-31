import { Controller, Get, Param } from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { z } from 'zod';
import { errorResponseSchema } from '../../common/error.schemas';
import { apiSchema } from '../../common/openapi';
import { templateResponseSchema, toTemplateResponse } from './templates.serializer';
import { TemplatesService } from './templates.service';

@ApiTags('Game templates')
@ApiCookieAuth()
@Controller('templates')
export class TemplatesController {
  constructor(private readonly templatesService: TemplatesService) {}

  @Get()
  @ApiOperation({
    summary: 'List game templates',
    description:
      'Returns every game this panel can install, with the variables each game exposes. ' +
      'Templates are data files; adding a game does not require code changes.',
  })
  @ApiOkResponse({
    description: 'All installable games.',
    schema: apiSchema(z.array(templateResponseSchema)),
  })
  list() {
    return this.templatesService.list().map(toTemplateResponse);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get a game template',
    description: 'Returns one game template by its identifier, e.g. `counter-strike-16`.',
  })
  @ApiOkResponse({ description: 'The template.', schema: apiSchema(templateResponseSchema) })
  @ApiNotFoundResponse({
    description: 'No template with this identifier.',
    schema: apiSchema(errorResponseSchema),
  })
  get(@Param('id') id: string) {
    return toTemplateResponse(this.templatesService.findById(id));
  }
}
