import { z } from 'zod';
import { environmentKeySchema, nameSchema } from '../../common/dto/keys.schema.js';
import type { Prisma } from '../../generated/prisma/client.js';

export const createEnvironmentSchema = z.strictObject({
  key: environmentKeySchema,
  name: nameSchema,
});

export type CreateEnvironmentInput = z.infer<typeof createEnvironmentSchema>;

export const environmentSchema = z.object({
  id: z.uuid(),
  key: environmentKeySchema,
  name: nameSchema,
  sdkKey: z.string().describe('Secret key used by SDKs in the X-SDK-Key header'),
  createdAt: z.iso.datetime(),
});

export const environmentSelect = {
  id: true,
  key: true,
  name: true,
  sdkKey: true,
  createdAt: true,
} satisfies Prisma.EnvironmentSelect;

export const environmentOrder = [
  { createdAt: 'asc' },
  { key: 'asc' },
] satisfies Prisma.EnvironmentOrderByWithRelationInput[];

export type EnvironmentView = Prisma.EnvironmentGetPayload<{ select: typeof environmentSelect }>;
