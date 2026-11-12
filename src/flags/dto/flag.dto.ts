import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import {
  environmentKeySchema,
  flagKeySchema,
  projectKeySchema,
} from '../../common/dto/keys.schema.js';
import { pageSchema } from '../../common/dto/pagination.dto.js';
import {
  createFlagSchema,
  flagSchema,
  flagStateInputSchema,
  flagStateResultSchema,
  listFlagsQuerySchema,
  updateFlagSchema,
} from './flag.schemas.js';

export class CreateFlagDto extends createZodDto(createFlagSchema) {}

export class UpdateFlagDto extends createZodDto(updateFlagSchema) {}

export class ListFlagsQueryDto extends createZodDto(listFlagsQuerySchema) {}

export class FlagStateInputDto extends createZodDto(flagStateInputSchema) {}

export class FlagParamsDto extends createZodDto(
  z.object({ key: projectKeySchema, flagKey: flagKeySchema }),
) {}

export class FlagStateParamsDto extends createZodDto(
  z.object({ key: projectKeySchema, flagKey: flagKeySchema, envKey: environmentKeySchema }),
) {}

export class FlagDto extends createZodDto(flagSchema) {}

export class FlagPageDto extends createZodDto(pageSchema(flagSchema)) {}

export class FlagStateResultDto extends createZodDto(flagStateResultSchema) {}
