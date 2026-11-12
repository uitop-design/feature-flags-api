import { z } from 'zod';
import {
  environmentKeySchema,
  flagKeySchema,
  nameSchema,
  userIdSchema,
} from '../../common/dto/keys.schema.js';
import { limitQuerySchema, pageQuerySchema } from '../../common/dto/pagination.dto.js';
import type { Prisma } from '../../generated/prisma/client.js';

export const MAX_TARGETED_USERS = 1000;

const descriptionSchema = z
  .string()
  .trim()
  .max(500)
  .transform((value) => (value === '' ? null : value))
  .nullable()
  .describe('Optional description, empty string clears it');

const userListSchema = z
  .array(userIdSchema)
  .max(MAX_TARGETED_USERS)
  .refine((users) => new Set(users).size === users.length, 'must not contain duplicates');

export const createFlagSchema = z.strictObject({
  key: flagKeySchema,
  name: nameSchema,
  description: descriptionSchema.optional(),
});

export type CreateFlagInput = z.infer<typeof createFlagSchema>;

export const updateFlagSchema = z
  .strictObject({
    name: nameSchema.optional(),
    description: descriptionSchema.optional(),
  })
  .refine((body) => body.name !== undefined || body.description !== undefined, {
    message: 'at least one of name or description is required',
  });

export type UpdateFlagInput = z.infer<typeof updateFlagSchema>;

export const listFlagsQuerySchema = z.object({
  page: pageQuerySchema,
  limit: limitQuerySchema,
  q: z.string().trim().max(64).optional().describe('Case-insensitive search in key and name'),
});

export type ListFlagsQuery = z.infer<typeof listFlagsQuerySchema>;

export const flagStateInputSchema = z
  .strictObject({
    enabled: z.boolean(),
    rolloutPercentage: z.int().min(0).max(100).describe('Share of users in the rollout, 0-100'),
    includeUsers: userListSchema.describe('Users that always get true unless excluded'),
    excludeUsers: userListSchema.describe('Users that always get false'),
  })
  .superRefine((state, context) => {
    const included = new Set(state.includeUsers);
    const overlap = state.excludeUsers.filter((user) => included.has(user));
    if (overlap.length > 0) {
      context.addIssue({
        code: 'custom',
        path: ['excludeUsers'],
        message: `must not overlap with includeUsers: ${overlap.slice(0, 5).join(', ')}`,
      });
    }
  });

export type FlagStateInput = z.infer<typeof flagStateInputSchema>;

export const flagStateSchema = z.object({
  enabled: z.boolean(),
  rolloutPercentage: z.int().min(0).max(100),
  includeUsers: z.array(userIdSchema),
  excludeUsers: z.array(userIdSchema),
  updatedAt: z.iso.datetime(),
});

export const flagSchema = z.object({
  id: z.uuid(),
  key: flagKeySchema,
  name: nameSchema,
  description: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  environments: z.record(environmentKeySchema, flagStateSchema).describe('State per environment'),
});

export const flagStateResultSchema = flagStateSchema.extend({
  flagKey: flagKeySchema,
  environmentKey: environmentKeySchema,
});

export const flagStateSelect = {
  enabled: true,
  rolloutPercentage: true,
  includeUsers: true,
  excludeUsers: true,
  updatedAt: true,
} satisfies Prisma.FlagStateSelect;

export const flagSelect = {
  id: true,
  key: true,
  name: true,
  description: true,
  createdAt: true,
  updatedAt: true,
  states: {
    select: { ...flagStateSelect, environment: { select: { key: true } } },
    orderBy: [{ environment: { createdAt: 'asc' } }, { environment: { key: 'asc' } }],
  },
} satisfies Prisma.FlagSelect;

export type FlagRecord = Prisma.FlagGetPayload<{ select: typeof flagSelect }>;

export type FlagStateView = Prisma.FlagStateGetPayload<{ select: typeof flagStateSelect }>;

export interface FlagView extends Omit<FlagRecord, 'states'> {
  environments: Record<string, FlagStateView>;
}

export interface FlagStateResult extends FlagStateView {
  flagKey: string;
  environmentKey: string;
}
