import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { ApiErrorResponses } from '../common/swagger/api-error-responses.decorator.js';
import { SDK_KEY_SECURITY } from '../docs/swagger.js';
import {
  EnvironmentEvaluationDto,
  EvaluateAllDto,
  EvaluateOneQueryDto,
  FlagEvaluationDto,
  FlagKeyParamDto,
} from './dto/evaluation.dto.js';
import {
  EvaluationService,
  type EnvironmentEvaluation,
  type FlagEvaluation,
} from './evaluation.service.js';
import { CurrentEnvironment, SdkKeyGuard } from './sdk-key.guard.js';
import type { SdkEnvironment } from './sdk-key.service.js';

@ApiTags('evaluation')
@ApiSecurity(SDK_KEY_SECURITY)
@UseGuards(SdkKeyGuard)
@Controller('evaluate')
export class EvaluationController {
  constructor(private readonly evaluation: EvaluationService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Evaluate every flag of the SDK key environment for a user' })
  @ApiOkResponse({ type: EnvironmentEvaluationDto })
  @ApiErrorResponses(HttpStatus.BAD_REQUEST, HttpStatus.UNAUTHORIZED)
  evaluateAll(
    @CurrentEnvironment() environment: SdkEnvironment,
    @Body() { userId }: EvaluateAllDto,
  ): Promise<EnvironmentEvaluation> {
    return this.evaluation.evaluateAll(environment, userId);
  }

  @Get(':flagKey')
  @ApiOperation({ summary: 'Evaluate one flag for a user and explain the result' })
  @ApiOkResponse({ type: FlagEvaluationDto })
  @ApiErrorResponses(HttpStatus.BAD_REQUEST, HttpStatus.UNAUTHORIZED, HttpStatus.NOT_FOUND)
  evaluateOne(
    @CurrentEnvironment() environment: SdkEnvironment,
    @Param() { flagKey }: FlagKeyParamDto,
    @Query() { userId }: EvaluateOneQueryDto,
  ): Promise<FlagEvaluation> {
    return this.evaluation.evaluateOne(environment, flagKey, userId);
  }
}
