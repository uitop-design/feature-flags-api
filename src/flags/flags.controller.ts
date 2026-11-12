import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Page } from '../common/dto/pagination.dto.js';
import { ApiErrorResponses } from '../common/swagger/api-error-responses.decorator.js';
import { ProjectKeyParamDto } from '../projects/dto/project.dto.js';
import {
  CreateFlagDto,
  FlagDto,
  FlagPageDto,
  FlagParamsDto,
  FlagStateInputDto,
  FlagStateParamsDto,
  FlagStateResultDto,
  ListFlagsQueryDto,
  UpdateFlagDto,
} from './dto/flag.dto.js';
import type { FlagStateResult, FlagView } from './dto/flag.schemas.js';
import { FlagsService } from './flags.service.js';

@ApiTags('flags')
@Controller('projects/:key/flags')
export class FlagsController {
  constructor(private readonly flags: FlagsService) {}

  @Post()
  @ApiOperation({
    summary: 'Create a flag',
    description: 'The flag starts disabled in every environment with a 100% rollout.',
  })
  @ApiCreatedResponse({ type: FlagDto })
  @ApiErrorResponses(HttpStatus.BAD_REQUEST, HttpStatus.NOT_FOUND, HttpStatus.CONFLICT)
  create(@Param() { key }: ProjectKeyParamDto, @Body() dto: CreateFlagDto): Promise<FlagView> {
    return this.flags.create(key, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List flags with their state in every environment' })
  @ApiOkResponse({ type: FlagPageDto })
  @ApiErrorResponses(HttpStatus.BAD_REQUEST, HttpStatus.NOT_FOUND)
  list(
    @Param() { key }: ProjectKeyParamDto,
    @Query() query: ListFlagsQueryDto,
  ): Promise<Page<FlagView>> {
    return this.flags.list(key, query);
  }

  @Get(':flagKey')
  @ApiOperation({ summary: 'Get a flag with its state in every environment' })
  @ApiOkResponse({ type: FlagDto })
  @ApiErrorResponses(HttpStatus.BAD_REQUEST, HttpStatus.NOT_FOUND)
  get(@Param() { key, flagKey }: FlagParamsDto): Promise<FlagView> {
    return this.flags.get(key, flagKey);
  }

  @Patch(':flagKey')
  @ApiOperation({ summary: 'Rename a flag or change its description' })
  @ApiOkResponse({ type: FlagDto })
  @ApiErrorResponses(HttpStatus.BAD_REQUEST, HttpStatus.NOT_FOUND)
  update(@Param() { key, flagKey }: FlagParamsDto, @Body() dto: UpdateFlagDto): Promise<FlagView> {
    return this.flags.update(key, flagKey, dto);
  }

  @Delete(':flagKey')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a flag in every environment' })
  @ApiNoContentResponse()
  @ApiErrorResponses(HttpStatus.BAD_REQUEST, HttpStatus.NOT_FOUND)
  remove(@Param() { key, flagKey }: FlagParamsDto): Promise<void> {
    return this.flags.remove(key, flagKey);
  }

  @Put(':flagKey/environments/:envKey')
  @ApiOperation({
    summary: 'Replace the flag state in an environment',
    description:
      'includeUsers and excludeUsers hold up to 1000 unique user ids each and must not overlap.',
  })
  @ApiOkResponse({ type: FlagStateResultDto })
  @ApiErrorResponses(HttpStatus.BAD_REQUEST, HttpStatus.NOT_FOUND)
  updateState(
    @Param() { key, flagKey, envKey }: FlagStateParamsDto,
    @Body() dto: FlagStateInputDto,
  ): Promise<FlagStateResult> {
    return this.flags.updateState(key, flagKey, envKey, dto);
  }
}
