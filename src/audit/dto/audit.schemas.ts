import { z } from 'zod';
import { environmentKeySchema, flagKeySchema } from '../../common/dto/keys.schema.js';
import { limitQuerySchema, pageQuerySchema } from '../../common/dto/pagination.dto.js';
import { AuditAction } from '../../generated/prisma/enums.js';

export const listAuditQuerySchema = z.object({
  page: pageQuerySchema,
  limit: limitQuerySchema,
  flagKey: flagKeySchema.optional().describe('Only entries about this flag'),
});

export type ListAuditQuery = z.infer<typeof listAuditQuerySchema>;

const auditStateSchema = z.record(z.string(), z.unknown()).nullable();

export const auditEntrySchema = z.object({
  id: z.uuid(),
  action: z.enum(AuditAction),
  flagKey: flagKeySchema.nullable(),
  environmentKey: environmentKeySchema.nullable(),
  before: auditStateSchema.describe('State before the change'),
  after: auditStateSchema.describe('State after the change'),
  createdAt: z.iso.datetime(),
});
