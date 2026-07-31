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
import { Roles } from '../../common/decorators/roles.decorator';
import { errorResponseSchema } from '../../common/error.schema';
import { apiSchema } from '../../common/openapi';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import {
  allocationResponseSchema,
  type CreateAllocationsBody,
  type CreateNodeBody,
  createAllocationsResponseSchema,
  createAllocationsSchema,
  createNodeSchema,
  nodeConfigResponseSchema,
  nodeHealthResponseSchema,
  nodeResponseSchema,
  type UpdateNodeBody,
  updateNodeSchema,
} from './nodes.schemas';
import { toAllocationResponse, toNodeResponse } from './nodes.serializer';
import { NodesService } from './nodes.service';

@ApiTags('Nodes')
@ApiCookieAuth()
@ApiForbiddenResponse({
  description: 'Requires the admin role.',
  schema: apiSchema(errorResponseSchema),
})
@Roles(UserRole.Admin)
@Controller('nodes')
export class NodesController {
  constructor(private readonly nodesService: NodesService) {}

  @Get()
  @ApiOperation({
    summary: 'List all nodes',
    description: 'Returns every machine registered to host game servers. Admin only.',
  })
  @ApiOkResponse({ description: 'All nodes.', schema: apiSchema(z.array(nodeResponseSchema)) })
  async list() {
    return (await this.nodesService.list()).map(toNodeResponse);
  }

  @Post()
  @ApiOperation({
    summary: 'Register a node',
    description:
      'Registers a machine that will host game servers and generates its daemon token. ' +
      'Fetch the daemon configuration from the config endpoint afterwards. Admin only.',
  })
  @ApiCreatedResponse({
    description: 'The registered node.',
    schema: apiSchema(nodeResponseSchema),
  })
  @ApiConflictResponse({
    description: 'A node with this name already exists.',
    schema: apiSchema(errorResponseSchema),
  })
  async create(@Body(new ZodValidationPipe(createNodeSchema)) body: CreateNodeBody) {
    return toNodeResponse(await this.nodesService.create(body));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a node', description: 'Returns one node by its ID. Admin only.' })
  @ApiOkResponse({ description: 'The node.', schema: apiSchema(nodeResponseSchema) })
  @ApiNotFoundResponse({
    description: 'No node with this ID.',
    schema: apiSchema(errorResponseSchema),
  })
  async get(@Param('id', ParseUUIDPipe) id: string) {
    return toNodeResponse(await this.nodesService.findById(id));
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update a node',
    description: 'Changes name, address, visibility, or capacity of a node. Admin only.',
  })
  @ApiOkResponse({ description: 'The updated node.', schema: apiSchema(nodeResponseSchema) })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateNodeSchema)) body: UpdateNodeBody,
  ) {
    return toNodeResponse(await this.nodesService.update(id, body));
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Delete a node',
    description: 'Removes a node that no longer hosts any game servers. Admin only.',
  })
  @ApiNoContentResponse({ description: 'Node deleted.' })
  @ApiConflictResponse({
    description: 'The node still hosts game servers.',
    schema: apiSchema(errorResponseSchema),
  })
  async delete(@Param('id', ParseUUIDPipe) id: string) {
    await this.nodesService.delete(id);
  }

  @Post(':id/rotate-token')
  @ApiOperation({
    summary: 'Rotate the daemon token',
    description:
      'Generates a new secret for this node. The daemon keeps working with the old token ' +
      'until you update its configuration, so rotate and redeploy together. Admin only.',
  })
  @ApiOkResponse({
    description: 'New daemon configuration including the fresh token.',
    schema: apiSchema(nodeConfigResponseSchema),
  })
  async rotateToken(@Param('id', ParseUUIDPipe) id: string) {
    return this.nodesService.daemonConfig(await this.nodesService.rotateToken(id));
  }

  @Get(':id/config')
  @ApiOperation({
    summary: 'Get daemon configuration',
    description:
      'Returns the configuration file content for this node’s daemon (swiftyd), including ' +
      'its secret token. Save it as /etc/swifty/swiftyd.json on the machine. Admin only.',
  })
  @ApiOkResponse({
    description: 'Daemon configuration for this node.',
    schema: apiSchema(nodeConfigResponseSchema),
  })
  async config(@Param('id', ParseUUIDPipe) id: string) {
    return this.nodesService.daemonConfig(await this.nodesService.findById(id));
  }

  @Get(':id/health')
  @ApiOperation({
    summary: 'Check node health',
    description:
      'Reports whether this node’s agent channel is connected, the daemon version it reported, and when it was last seen. Admin only.',
  })
  @ApiOkResponse({
    description: 'Reachability of the daemon.',
    schema: apiSchema(nodeHealthResponseSchema),
  })
  async health(@Param('id', ParseUUIDPipe) id: string) {
    return this.nodesService.health(await this.nodesService.findById(id));
  }

  @Get(':id/allocations')
  @ApiOperation({
    summary: 'List allocations of a node',
    description:
      'Returns the IP and port pairs game servers can bind on this node, sorted by IP and ' +
      'port. Admin only.',
  })
  @ApiOkResponse({
    description: 'All allocations of the node.',
    schema: apiSchema(z.array(allocationResponseSchema)),
  })
  async listAllocations(@Param('id', ParseUUIDPipe) id: string) {
    return (await this.nodesService.listAllocations(id)).map(toAllocationResponse);
  }

  @Post(':id/allocations')
  @ApiOperation({
    summary: 'Add allocations to a node',
    description:
      'Adds IP and port pairs in bulk; ports accept single values and ranges like ' +
      '"27015-27030". Pairs that already exist are skipped, not duplicated. Admin only.',
  })
  @ApiCreatedResponse({
    description: 'How many allocations were created and skipped.',
    schema: apiSchema(createAllocationsResponseSchema),
  })
  async createAllocations(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(createAllocationsSchema)) body: CreateAllocationsBody,
  ) {
    return this.nodesService.createAllocations(id, body);
  }

  @Delete(':id/allocations/:allocationId')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Delete an allocation',
    description: 'Removes an IP and port pair that no server is using. Admin only.',
  })
  @ApiNoContentResponse({ description: 'Allocation deleted.' })
  @ApiConflictResponse({
    description: 'The allocation is assigned to a server.',
    schema: apiSchema(errorResponseSchema),
  })
  async deleteAllocation(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('allocationId', ParseUUIDPipe) allocationId: string,
  ) {
    await this.nodesService.deleteAllocation(id, allocationId);
  }
}
