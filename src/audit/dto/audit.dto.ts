import { createZodDto } from 'nestjs-zod';
import { pageSchema } from '../../common/dto/pagination.dto.js';
import { auditEntrySchema, listAuditQuerySchema } from './audit.schemas.js';

export class ListAuditQueryDto extends createZodDto(listAuditQuerySchema) {}

export class AuditEntryPageDto extends createZodDto(pageSchema(auditEntrySchema)) {}
