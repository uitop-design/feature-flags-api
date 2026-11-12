import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import type { Page } from '../common/dto/pagination.dto.js';
import { isPrismaError, PrismaErrorCode } from '../common/errors/prisma-errors.js';
import { SnapshotCacheService } from '../evaluation/snapshot-cache.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import { AuditAction } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { findProjectId, lockProject } from '../projects/project-lookup.js';
import {
  flagSelect,
  flagStateSelect,
  type CreateFlagInput,
  type FlagRecord,
  type FlagStateInput,
  type FlagStateResult,
  type FlagStateView,
  type FlagView,
  type ListFlagsQuery,
  type UpdateFlagInput,
} from './dto/flag.schemas.js';

interface Mutation<T> {
  result: T;
  environmentIds: string[];
}

@Injectable()
export class FlagsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly cache: SnapshotCacheService,
  ) {}

  async create(projectKey: string, input: CreateFlagInput): Promise<FlagView> {
    try {
      return await this.mutate(projectKey, async (tx, projectId, environmentIds) => {
        const flag = await tx.flag.create({
          data: {
            projectId,
            key: input.key,
            name: input.name,
            description: input.description ?? null,
            states: {
              create: environmentIds.map((environmentId) => ({
                environmentId,
                enabled: false,
                rolloutPercentage: 100,
              })),
            },
          },
          select: flagSelect,
        });
        await this.audit.record(tx, [
          {
            projectId,
            action: AuditAction.FLAG_CREATED,
            flagKey: flag.key,
            after: flagDetails(flag),
          },
        ]);
        return toFlagView(flag);
      });
    } catch (error) {
      if (isPrismaError(error, PrismaErrorCode.UniqueViolation)) {
        throw new ConflictException(
          `Flag "${input.key}" already exists in project "${projectKey}"`,
        );
      }
      throw error;
    }
  }

  async list(projectKey: string, query: ListFlagsQuery): Promise<Page<FlagView>> {
    const projectId = await findProjectId(this.prisma, projectKey);
    const where: Prisma.FlagWhereInput = { projectId };
    if (query.q) {
      const contains = escapeLikePattern(query.q);
      where.OR = [
        { key: { contains, mode: 'insensitive' } },
        { name: { contains, mode: 'insensitive' } },
      ];
    }
    const [flags, total] = await Promise.all([
      this.prisma.flag.findMany({
        where,
        select: flagSelect,
        orderBy: { key: 'asc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.flag.count({ where }),
    ]);
    return { items: flags.map(toFlagView), total, page: query.page, limit: query.limit };
  }

  async get(projectKey: string, flagKey: string): Promise<FlagView> {
    const projectId = await findProjectId(this.prisma, projectKey);
    const flag = await this.prisma.flag.findUnique({
      where: { projectId_key: { projectId, key: flagKey } },
      select: flagSelect,
    });
    if (!flag) {
      throw flagNotFound(projectKey, flagKey);
    }
    return toFlagView(flag);
  }

  update(projectKey: string, flagKey: string, input: UpdateFlagInput): Promise<FlagView> {
    return this.mutate(projectKey, async (tx, projectId) => {
      const current = await this.findFlag(tx, projectId, projectKey, flagKey);
      const flag = await tx.flag.update({
        where: { id: current.id },
        data: { name: input.name, description: input.description },
        select: flagSelect,
      });
      await this.audit.record(tx, [
        {
          projectId,
          action: AuditAction.FLAG_UPDATED,
          flagKey,
          before: { name: current.name, description: current.description },
          after: { name: flag.name, description: flag.description },
        },
      ]);
      return toFlagView(flag);
    });
  }

  async remove(projectKey: string, flagKey: string): Promise<void> {
    await this.mutate(projectKey, async (tx, projectId) => {
      const current = await this.findFlag(tx, projectId, projectKey, flagKey);
      await tx.flag.delete({ where: { id: current.id } });
      await this.audit.record(tx, [
        {
          projectId,
          action: AuditAction.FLAG_DELETED,
          flagKey,
          before: flagDetails(current),
        },
      ]);
    });
  }

  async updateState(
    projectKey: string,
    flagKey: string,
    environmentKey: string,
    input: FlagStateInput,
  ): Promise<FlagStateResult> {
    const { result, environmentIds } = await this.prisma.$transaction(
      async (tx): Promise<Mutation<FlagStateResult>> => {
        const projectId = await lockProject(tx, projectKey);
        const flag = await this.findFlag(tx, projectId, projectKey, flagKey);
        const environment = await tx.environment.findUnique({
          where: { projectId_key: { projectId, key: environmentKey } },
          select: { id: true },
        });
        if (!environment) {
          throw new NotFoundException(
            `Environment "${environmentKey}" not found in project "${projectKey}"`,
          );
        }
        const where = { flagId_environmentId: { flagId: flag.id, environmentId: environment.id } };
        const before = await tx.flagState.findUnique({ where, select: flagStateSelect });
        const state = await tx.flagState.upsert({
          where,
          create: { flagId: flag.id, environmentId: environment.id, ...input },
          update: input,
          select: flagStateSelect,
        });
        await this.audit.record(tx, [
          {
            projectId,
            action: AuditAction.STATE_UPDATED,
            flagKey,
            environmentKey,
            before: before ? stateDetails(before) : undefined,
            after: stateDetails(state),
          },
        ]);
        return {
          result: { flagKey, environmentKey, ...state },
          environmentIds: [environment.id],
        };
      },
    );
    await this.cache.invalidate(environmentIds);
    return result;
  }

  private async mutate<T>(
    projectKey: string,
    action: (
      tx: Prisma.TransactionClient,
      projectId: string,
      environmentIds: string[],
    ) => Promise<T>,
  ): Promise<T> {
    const { result, environmentIds } = await this.prisma.$transaction(
      async (tx): Promise<Mutation<T>> => {
        const projectId = await lockProject(tx, projectKey);
        const environments = await tx.environment.findMany({
          where: { projectId },
          select: { id: true },
        });
        const ids = environments.map(({ id }) => id);
        return { result: await action(tx, projectId, ids), environmentIds: ids };
      },
    );
    await this.cache.invalidate(environmentIds);
    return result;
  }

  private async findFlag(
    tx: Prisma.TransactionClient,
    projectId: string,
    projectKey: string,
    flagKey: string,
  ) {
    const flag = await tx.flag.findUnique({
      where: { projectId_key: { projectId, key: flagKey } },
      select: { id: true, key: true, name: true, description: true },
    });
    if (!flag) {
      throw flagNotFound(projectKey, flagKey);
    }
    return flag;
  }
}

function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

function flagNotFound(projectKey: string, flagKey: string): NotFoundException {
  return new NotFoundException(`Flag "${flagKey}" not found in project "${projectKey}"`);
}

function toFlagView({ states, ...flag }: FlagRecord): FlagView {
  return {
    ...flag,
    environments: Object.fromEntries(
      states.map(({ environment, ...state }) => [environment.key, state]),
    ),
  };
}

function flagDetails(flag: Pick<FlagRecord, 'key' | 'name' | 'description'>) {
  return { key: flag.key, name: flag.name, description: flag.description };
}

function stateDetails(state: FlagStateView) {
  return {
    enabled: state.enabled,
    rolloutPercentage: state.rolloutPercentage,
    includeUsers: state.includeUsers,
    excludeUsers: state.excludeUsers,
  };
}
