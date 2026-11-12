import { Controller, Get, HttpStatus } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { ApiErrorResponses } from '../common/swagger/api-error-responses.decorator.js';
import { HealthService, type HealthReport } from './health.service.js';

class HealthDto extends createZodDto(
  z.object({
    status: z.literal('ok'),
    checks: z.object({ postgres: z.literal('up'), redis: z.literal('up') }),
  }),
) {}

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  @ApiOperation({ summary: 'Check Postgres and Redis availability' })
  @ApiOkResponse({ type: HealthDto })
  @ApiErrorResponses(HttpStatus.SERVICE_UNAVAILABLE)
  check(): Promise<HealthReport> {
    return this.health.check();
  }
}
