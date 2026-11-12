import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import { isPrismaError, PrismaErrorCode } from '../common/errors/prisma-errors.js';
import { SnapshotCacheService } from '../evaluation/snapshot-cache.service.js';
import { AuditAction } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { lockProject } from '../projects/project-lookup.js';
import {
  environmentSelect,
  type CreateEnvironmentInput,
  type EnvironmentView,
} from './dto/environment.schemas.js';
import { generateSdkKey, maskSdkKey } from './sdk-key.js';

@Injectable()
export class EnvironmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly cache: SnapshotCacheService,
  ) {}

  async create(projectKey: string, input: CreateEnvironmentInput): Promise<EnvironmentView> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const projectId = await lockProject(tx, projectKey);
        const flags = await tx.flag.findMany({ where: { projectId }, select: { id: true } });
        const environment = await tx.environment.create({
          data: {
            projectId,
            key: input.key,
            name: input.name,
            sdkKey: generateSdkKey(),
            states: { create: flags.map(({ id }) => ({ flagId: id, enabled: false })) },
          },
          select: environmentSelect,
        });
        await this.audit.record(tx, [
          {
            projectId,
            action: AuditAction.ENVIRONMENT_CREATED,
            environmentKey: environment.key,
            after: { key: environment.key, name: environment.name },
          },
        ]);
        return environment;
      });
    } catch (error) {
      if (isPrismaError(error, PrismaErrorCode.UniqueViolation)) {
        throw new ConflictException(
          `Environment "${input.key}" already exists in project "${projectKey}"`,
        );
      }
      throw error;
    }
  }

  async rotateSdkKey(projectKey: string, environmentKey: string): Promise<EnvironmentView> {
    const result = await this.prisma.$transaction(async (tx) => {
      const projectId = await lockProject(tx, projectKey);
      const current = await tx.environment.findUnique({
        where: { projectId_key: { projectId, key: environmentKey } },
        select: { id: true, sdkKey: true },
      });
      if (!current) {
        throw new NotFoundException(
          `Environment "${environmentKey}" not found in project "${projectKey}"`,
        );
      }
      const environment = await tx.environment.update({
        where: { id: current.id },
        data: { sdkKey: generateSdkKey() },
        select: environmentSelect,
      });
      await this.audit.record(tx, [
        {
          projectId,
          action: AuditAction.SDK_KEY_ROTATED,
          environmentKey,
          before: { sdkKey: maskSdkKey(current.sdkKey) },
          after: { sdkKey: maskSdkKey(environment.sdkKey) },
        },
      ]);
      return environment;
    });
    await this.cache.invalidate([result.id]);
    return result;
  }
}
