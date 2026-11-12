import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { environmentKeySchema, projectKeySchema } from '../../common/dto/keys.schema.js';
import { createEnvironmentSchema, environmentSchema } from './environment.schemas.js';

export class CreateEnvironmentDto extends createZodDto(createEnvironmentSchema) {}

export class EnvironmentDto extends createZodDto(environmentSchema) {}

export class EnvironmentParamsDto extends createZodDto(
  z.object({ key: projectKeySchema, envKey: environmentKeySchema }),
) {}
