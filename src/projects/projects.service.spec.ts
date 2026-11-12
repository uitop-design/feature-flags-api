import { ConflictException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it } from '@jest/globals';
import { SDK_KEY_PATTERN } from '../environments/sdk-key.js';
import { AuditAction } from '../generated/prisma/enums.js';
import {
  createAuditMock,
  createCacheMock,
  createPrismaMock,
  CREATED_AT,
  DEV_ENV_ID,
  prismaError,
  PROD_ENV_ID,
  PROJECT_ID,
} from '../test/mocks.js';
import { ProjectsService } from './projects.service.js';

interface EnvironmentCreate {
  key: string;
  name: string;
  sdkKey: string;
}

interface ProjectCreateArgs {
  data: { key: string; name: string; environments: { create: EnvironmentCreate[] } };
}

describe('ProjectsService', () => {
  let prisma: ReturnType<typeof createPrismaMock>['mock'];
  let audit: ReturnType<typeof createAuditMock>['mock'];
  let cache: ReturnType<typeof createCacheMock>['mock'];
  let service: ProjectsService;

  beforeEach(() => {
    const prismaMock = createPrismaMock();
    const auditMock = createAuditMock();
    const cacheMock = createCacheMock();
    prisma = prismaMock.mock;
    audit = auditMock.mock;
    cache = cacheMock.mock;
    service = new ProjectsService(prismaMock.service, auditMock.service, cacheMock.service);
  });

  describe('create', () => {
    beforeEach(() => {
      prisma.project.create.mockImplementation(async (args) => {
        const { data } = args as ProjectCreateArgs;
        return {
          id: PROJECT_ID,
          key: data.key,
          name: data.name,
          createdAt: CREATED_AT,
          updatedAt: CREATED_AT,
          environments: data.environments.create.map((environment, index) => ({
            id: [DEV_ENV_ID, PROD_ENV_ID][index],
            ...environment,
            createdAt: CREATED_AT,
          })),
        };
      });
    });

    it('creates development and production environments with fresh SDK keys', async () => {
      const project = await service.create({ key: 'storefront', name: 'Storefront' });

      const [args] = prisma.project.create.mock.calls[0] as [ProjectCreateArgs];
      const environments = args.data.environments.create;
      expect(environments.map(({ key, name }) => ({ key, name }))).toEqual([
        { key: 'development', name: 'Development' },
        { key: 'production', name: 'Production' },
      ]);
      expect(environments.every(({ sdkKey }) => SDK_KEY_PATTERN.test(sdkKey))).toBe(true);
      expect(environments[0]?.sdkKey).not.toBe(environments[1]?.sdkKey);
      expect(project).toMatchObject({
        key: 'storefront',
        flagsCount: 0,
        environments: [{ key: 'development' }, { key: 'production' }],
      });
    });

    it('records environment creation in the audit log inside the transaction', async () => {
      await service.create({ key: 'storefront', name: 'Storefront' });

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(audit.record).toHaveBeenCalledWith(prisma, [
        {
          projectId: PROJECT_ID,
          action: AuditAction.ENVIRONMENT_CREATED,
          environmentKey: 'development',
          after: { key: 'development', name: 'Development' },
        },
        {
          projectId: PROJECT_ID,
          action: AuditAction.ENVIRONMENT_CREATED,
          environmentKey: 'production',
          after: { key: 'production', name: 'Production' },
        },
      ]);
    });

    it('reports a taken key as a conflict', async () => {
      prisma.project.create.mockRejectedValue(prismaError('P2002'));

      await expect(service.create({ key: 'storefront', name: 'Storefront' })).rejects.toThrow(
        new ConflictException('Project "storefront" already exists'),
      );
      expect(audit.record).not.toHaveBeenCalled();
    });
  });

  it('returns details with the number of flags', async () => {
    prisma.project.findUnique.mockResolvedValue({
      id: PROJECT_ID,
      key: 'storefront',
      name: 'Storefront',
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT,
      environments: [],
      _count: { flags: 3 },
    });

    await expect(service.details('storefront')).resolves.toMatchObject({ flagsCount: 3 });
  });

  it('drops cached snapshots of every environment when a project is deleted', async () => {
    prisma.project.findUnique.mockResolvedValue({
      id: PROJECT_ID,
      environments: [{ id: DEV_ENV_ID }, { id: PROD_ENV_ID }],
    });
    prisma.project.delete.mockResolvedValue({});

    await service.remove('storefront');

    expect(prisma.project.delete).toHaveBeenCalledWith({ where: { id: PROJECT_ID } });
    expect(cache.remove).toHaveBeenCalledWith([DEV_ENV_ID, PROD_ENV_ID]);
  });

  it('rejects deleting an unknown project', async () => {
    prisma.project.findUnique.mockResolvedValue(null);

    await expect(service.remove('missing')).rejects.toThrow(NotFoundException);
    expect(cache.remove).not.toHaveBeenCalled();
  });
});
