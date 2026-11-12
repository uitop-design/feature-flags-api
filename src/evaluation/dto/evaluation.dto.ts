import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { environmentKeySchema, flagKeySchema, userIdSchema } from '../../common/dto/keys.schema.js';
import { EvaluationReason } from '../flag-evaluator.js';

export class EvaluateAllDto extends createZodDto(z.strictObject({ userId: userIdSchema })) {}

export class EvaluateOneQueryDto extends createZodDto(z.object({ userId: userIdSchema })) {}

export class FlagKeyParamDto extends createZodDto(z.object({ flagKey: flagKeySchema })) {}

export class EnvironmentEvaluationDto extends createZodDto(
  z.object({
    environment: environmentKeySchema,
    flags: z.record(z.string(), z.boolean()).describe('Flag key to evaluated value'),
  }),
) {}

export class FlagEvaluationDto extends createZodDto(
  z.object({
    flagKey: flagKeySchema,
    value: z.boolean(),
    reason: z.enum(Object.values(EvaluationReason)).describe('Rule that produced the value'),
  }),
) {}
