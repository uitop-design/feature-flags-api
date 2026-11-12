import { z } from 'zod';
import { nameSchema, projectKeySchema } from '../../common/dto/keys.schema.js';
import { limitQuerySchema, pageQuerySchema } from '../../common/dto/pagination.dto.js';
import { environmentSchema } from '../../environments/dto/environment.schemas.js';
import type { Prisma } from '../../generated/prisma/client.js';

export const createProjectSchema = z.strictObject({
  key: projectKeySchema,
  name: nameSchema,
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;

export const listProjectsQuerySchema = z.object({
  page: pageQuerySchema,
  limit: limitQuerySchema,
});

export type ListProjectsQuery = z.infer<typeof listProjectsQuerySchema>;

export const projectSchema = z.object({
  id: z.uuid(),
  key: projectKeySchema,
  name: nameSchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const projectDetailsSchema = projectSchema.extend({
  environments: z.array(environmentSchema),
  flagsCount: z.int().min(0),
});

export const projectSelect = {
  id: true,
  key: true,
  name: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ProjectSelect;

export type ProjectView = Prisma.ProjectGetPayload<{ select: typeof projectSelect }>;
