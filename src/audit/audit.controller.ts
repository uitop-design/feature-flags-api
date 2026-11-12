import { Controller, Get, HttpStatus, Param, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Page } from '../common/dto/pagination.dto.js';
import { ApiErrorResponses } from '../common/swagger/api-error-responses.decorator.js';
import { ProjectKeyParamDto } from '../projects/dto/project.dto.js';
import { AuditService, type AuditEntryView } from './audit.service.js';
import { AuditEntryPageDto, ListAuditQueryDto } from './dto/audit.dto.js';

@ApiTags('audit')
@Controller('projects/:key/audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @ApiOperation({ summary: 'List audit entries of a project, newest first' })
  @ApiOkResponse({ type: AuditEntryPageDto })
  @ApiErrorResponses(HttpStatus.BAD_REQUEST, HttpStatus.NOT_FOUND)
  list(
    @Param() { key }: ProjectKeyParamDto,
    @Query() query: ListAuditQueryDto,
  ): Promise<Page<AuditEntryView>> {
    return this.audit.list(key, query);
  }
}
