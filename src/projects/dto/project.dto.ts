import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { projectKeySchema } from '../../common/dto/keys.schema.js';
import { pageSchema } from '../../common/dto/pagination.dto.js';
import {
  createProjectSchema,
  listProjectsQuerySchema,
  projectDetailsSchema,
  projectSchema,
} from './project.schemas.js';

export class CreateProjectDto extends createZodDto(createProjectSchema) {}

export class ListProjectsQueryDto extends createZodDto(listProjectsQuerySchema) {}

export class ProjectKeyParamDto extends createZodDto(z.object({ key: projectKeySchema })) {}

export class ProjectPageDto extends createZodDto(pageSchema(projectSchema)) {}

export class ProjectDetailsDto extends createZodDto(projectDetailsSchema) {}
