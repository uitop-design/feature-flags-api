import { Injectable } from '@nestjs/common';
import type { Page } from '../common/dto/pagination.dto.js';
import type { AuditAction, AuditEntry, Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { findProjectId } from '../projects/project-lookup.js';
import type { ListAuditQuery } from './dto/audit.schemas.js';

export interface AuditRecord {
  projectId: string;
  action: AuditAction;
  flagKey?: string;
  environmentKey?: string;
  before?: Prisma.InputJsonObject;
  after?: Prisma.InputJsonObject;
}

export type AuditEntryView = Omit<AuditEntry, 'projectId'>;

const auditEntrySelect = {
  id: true,
  action: true,
  flagKey: true,
  environmentKey: true,
  before: true,
  after: true,
  createdAt: true,
} satisfies Prisma.AuditEntrySelect;

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(tx: Prisma.TransactionClient, records: AuditRecord[]): Promise<void> {
    if (records.length > 0) {
      await tx.auditEntry.createMany({ data: records });
    }
  }

  async list(projectKey: string, query: ListAuditQuery): Promise<Page<AuditEntryView>> {
    const projectId = await findProjectId(this.prisma, projectKey);
    const where: Prisma.AuditEntryWhereInput = { projectId, flagKey: query.flagKey };
    const [items, total] = await Promise.all([
      this.prisma.auditEntry.findMany({
        where,
        select: auditEntrySelect,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.auditEntry.count({ where }),
    ]);
    return { items, total, page: query.page, limit: query.limit };
  }
}
