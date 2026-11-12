import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
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
import {
  CreateProjectDto,
  ListProjectsQueryDto,
  ProjectDetailsDto,
  ProjectKeyParamDto,
  ProjectPageDto,
} from './dto/project.dto.js';
import type { ProjectView } from './dto/project.schemas.js';
import { ProjectsService, type ProjectDetails } from './projects.service.js';

@ApiTags('projects')
@Controller('projects')
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a project with development and production environments' })
  @ApiCreatedResponse({ type: ProjectDetailsDto })
  @ApiErrorResponses(HttpStatus.BAD_REQUEST, HttpStatus.CONFLICT)
  create(@Body() dto: CreateProjectDto): Promise<ProjectDetails> {
    return this.projects.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List projects sorted by key' })
  @ApiOkResponse({ type: ProjectPageDto })
  @ApiErrorResponses(HttpStatus.BAD_REQUEST)
  list(@Query() query: ListProjectsQueryDto): Promise<Page<ProjectView>> {
    return this.projects.list(query);
  }

  @Get(':key')
  @ApiOperation({ summary: 'Get a project with its environments, SDK keys and flag count' })
  @ApiOkResponse({ type: ProjectDetailsDto })
  @ApiErrorResponses(HttpStatus.BAD_REQUEST, HttpStatus.NOT_FOUND)
  details(@Param() { key }: ProjectKeyParamDto): Promise<ProjectDetails> {
    return this.projects.details(key);
  }

  @Delete(':key')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a project with all environments, flags and audit entries' })
  @ApiNoContentResponse()
  @ApiErrorResponses(HttpStatus.BAD_REQUEST, HttpStatus.NOT_FOUND)
  remove(@Param() { key }: ProjectKeyParamDto): Promise<void> {
    return this.projects.remove(key);
  }
}
