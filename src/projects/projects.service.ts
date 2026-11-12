import { ConflictException, Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import type { Page } from '../common/dto/pagination.dto.js';
import { isPrismaError, PrismaErrorCode } from '../common/errors/prisma-errors.js';
import {
  environmentOrder,
  environmentSelect,
  type EnvironmentView,
} from '../environments/dto/environment.schemas.js';
import { generateSdkKey } from '../environments/sdk-key.js';
import { SnapshotCacheService } from '../evaluation/snapshot-cache.service.js';
import { AuditAction } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  projectSelect,
  type CreateProjectInput,
  type ListProjectsQuery,
  type ProjectView,
} from './dto/project.schemas.js';
import { projectNotFound } from './project-lookup.js';

export const DEFAULT_ENVIRONMENTS = [
  { key: 'development', name: 'Development' },
  { key: 'production', name: 'Production' },
] as const;

export interface ProjectDetails extends ProjectView {
  environments: EnvironmentView[];
  flagsCount: number;
}

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly cache: SnapshotCacheService,
  ) {}

  async create(input: CreateProjectInput): Promise<ProjectDetails> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const { environments, ...project } = await tx.project.create({
          data: {
            key: input.key,
            name: input.name,
            environments: {
              create: DEFAULT_ENVIRONMENTS.map((environment) => ({
                ...environment,
                sdkKey: generateSdkKey(),
              })),
            },
          },
          select: {
            ...projectSelect,
            environments: { select: environmentSelect, orderBy: environmentOrder },
          },
        });
        await this.audit.record(
          tx,
          environments.map((environment) => ({
            projectId: project.id,
            action: AuditAction.ENVIRONMENT_CREATED,
            environmentKey: environment.key,
            after: { key: environment.key, name: environment.name },
          })),
        );
        return { ...project, environments, flagsCount: 0 };
      });
    } catch (error) {
      if (isPrismaError(error, PrismaErrorCode.UniqueViolation)) {
        throw new ConflictException(`Project "${input.key}" already exists`);
      }
      throw error;
    }
  }

  async list(query: ListProjectsQuery): Promise<Page<ProjectView>> {
    const [items, total] = await Promise.all([
      this.prisma.project.findMany({
        select: projectSelect,
        orderBy: { key: 'asc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.project.count(),
    ]);
    return { items, total, page: query.page, limit: query.limit };
  }

  async details(key: string): Promise<ProjectDetails> {
    const project = await this.prisma.project.findUnique({
      where: { key },
      select: {
        ...projectSelect,
        environments: { select: environmentSelect, orderBy: environmentOrder },
        _count: { select: { flags: true } },
      },
    });
    if (!project) {
      throw projectNotFound(key);
    }
    const { _count, ...details } = project;
    return { ...details, flagsCount: _count.flags };
  }

  async remove(key: string): Promise<void> {
    const project = await this.prisma.project.findUnique({
      where: { key },
      select: { id: true, environments: { select: { id: true } } },
    });
    if (!project) {
      throw projectNotFound(key);
    }
    await this.prisma.project.delete({ where: { id: project.id } });
    await this.cache.remove(project.environments.map(({ id }) => id));
  }
}
