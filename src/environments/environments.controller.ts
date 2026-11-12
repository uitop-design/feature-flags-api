import { Body, Controller, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiErrorResponses } from '../common/swagger/api-error-responses.decorator.js';
import { ProjectKeyParamDto } from '../projects/dto/project.dto.js';
import {
  CreateEnvironmentDto,
  EnvironmentDto,
  EnvironmentParamsDto,
} from './dto/environment.dto.js';
import type { EnvironmentView } from './dto/environment.schemas.js';
import { EnvironmentsService } from './environments.service.js';

@ApiTags('environments')
@Controller('projects/:key/environments')
export class EnvironmentsController {
  constructor(private readonly environments: EnvironmentsService) {}

  @Post()
  @ApiOperation({
    summary: 'Create an environment',
    description: 'Every existing flag of the project gets a disabled state in the new environment.',
  })
  @ApiCreatedResponse({ type: EnvironmentDto })
  @ApiErrorResponses(HttpStatus.BAD_REQUEST, HttpStatus.NOT_FOUND, HttpStatus.CONFLICT)
  create(
    @Param() { key }: ProjectKeyParamDto,
    @Body() dto: CreateEnvironmentDto,
  ): Promise<EnvironmentView> {
    return this.environments.create(key, dto);
  }

  @Post(':envKey/rotate-sdk-key')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Issue a new SDK key',
    description: 'The previous key stops working immediately.',
  })
  @ApiOkResponse({ type: EnvironmentDto })
  @ApiErrorResponses(HttpStatus.BAD_REQUEST, HttpStatus.NOT_FOUND)
  rotateSdkKey(@Param() { key, envKey }: EnvironmentParamsDto): Promise<EnvironmentView> {
    return this.environments.rotateSdkKey(key, envKey);
  }
}
