import { ConflictException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it } from '@jest/globals';
import { AuditAction } from '../generated/prisma/enums.js';
import {
  createAuditMock,
  createCacheMock,
  createPrismaMock,
  CREATED_AT,
  DEV_ENV_ID,
  FLAG_ID,
  prismaError,
  PROD_ENV_ID,
  PROJECT_ID,
} from '../test/mocks.js';
import { FlagsService } from './flags.service.js';

interface StateCreate {
  environmentId: string;
  enabled: boolean;
  rolloutPercentage: number;
}

interface FlagCreateArgs {
  data: {
    key: string;
    name: string;
    description: string | null;
    states: { create: StateCreate[] };
  };
}

function state(overrides: Record<string, unknown> = {}) {
  return {
    enabled: false,
    rolloutPercentage: 100,
    includeUsers: [],
    excludeUsers: [],
    updatedAt: CREATED_AT,
    ...overrides,
  };
}

describe('FlagsService', () => {
  let prisma: ReturnType<typeof createPrismaMock>['mock'];
  let audit: ReturnType<typeof createAuditMock>['mock'];
  let cache: ReturnType<typeof createCacheMock>['mock'];
  let service: FlagsService;

  beforeEach(() => {
    const prismaMock = createPrismaMock();
    const auditMock = createAuditMock();
    const cacheMock = createCacheMock();
    prisma = prismaMock.mock;
    audit = auditMock.mock;
    cache = cacheMock.mock;
    service = new FlagsService(prismaMock.service, auditMock.service, cacheMock.service);
    prisma.$queryRaw.mockResolvedValue([{ id: PROJECT_ID }]);
  });

  describe('create', () => {
    beforeEach(() => {
      prisma.environment.findMany.mockResolvedValue([{ id: DEV_ENV_ID }, { id: PROD_ENV_ID }]);
      prisma.flag.create.mockImplementation(async (args) => {
        const { data } = args as FlagCreateArgs;
        return {
          id: FLAG_ID,
          key: data.key,
          name: data.name,
          description: data.description,
          createdAt: CREATED_AT,
          updatedAt: CREATED_AT,
          states: [
            { ...state(), environment: { key: 'development' } },
            { ...state(), environment: { key: 'production' } },
          ],
        };
      });
    });

    it('creates a disabled 100% state in every environment of the project', async () => {
      const flag = await service.create('storefront', { key: 'new-checkout', name: 'Checkout' });

      const [args] = prisma.flag.create.mock.calls[0] as [FlagCreateArgs];
      expect(args.data.states.create).toEqual([
        { environmentId: DEV_ENV_ID, enabled: false, rolloutPercentage: 100 },
        { environmentId: PROD_ENV_ID, enabled: false, rolloutPercentage: 100 },
      ]);
      expect(Object.keys(flag.environments)).toEqual(['development', 'production']);
      expect(flag.description).toBeNull();
    });

    it('locks the project, writes the audit entry and invalidates every environment', async () => {
      await service.create('storefront', { key: 'new-checkout', name: 'Checkout' });

      expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
      expect(audit.record).toHaveBeenCalledWith(prisma, [
        {
          projectId: PROJECT_ID,
          action: AuditAction.FLAG_CREATED,
          flagKey: 'new-checkout',
          after: { key: 'new-checkout', name: 'Checkout', description: null },
        },
      ]);
      expect(cache.invalidate).toHaveBeenCalledWith([DEV_ENV_ID, PROD_ENV_ID]);
    });

    it('reports a duplicate key as a conflict without touching the cache', async () => {
      prisma.flag.create.mockRejectedValue(prismaError('P2002'));

      await expect(
        service.create('storefront', { key: 'new-checkout', name: 'Checkout' }),
      ).rejects.toThrow(
        new ConflictException('Flag "new-checkout" already exists in project "storefront"'),
      );
      expect(cache.invalidate).not.toHaveBeenCalled();
    });

    it('reports an unknown project as not found', async () => {
      prisma.$queryRaw.mockResolvedValue([]);

      await expect(
        service.create('missing', { key: 'new-checkout', name: 'Checkout' }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.flag.create).not.toHaveBeenCalled();
    });
  });

  describe('updateState', () => {
    const input = {
      enabled: true,
      rolloutPercentage: 25,
      includeUsers: ['qa-alice'],
      excludeUsers: ['user-42'],
    };

    beforeEach(() => {
      prisma.flag.findUnique.mockResolvedValue({
        id: FLAG_ID,
        key: 'new-checkout',
        name: 'Checkout',
        description: null,
      });
      prisma.environment.findUnique.mockResolvedValue({ id: PROD_ENV_ID });
      prisma.flagState.findUnique.mockResolvedValue(state());
      prisma.flagState.upsert.mockResolvedValue(state(input));
    });

    it('stores the new state and returns it with flag and environment keys', async () => {
      const result = await service.updateState('storefront', 'new-checkout', 'production', input);

      expect(prisma.flagState.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { flagId_environmentId: { flagId: FLAG_ID, environmentId: PROD_ENV_ID } },
          update: input,
        }),
      );
      expect(result).toEqual({
        flagKey: 'new-checkout',
        environmentKey: 'production',
        ...state(input),
      });
    });

    it('writes before and after to the audit log', async () => {
      await service.updateState('storefront', 'new-checkout', 'production', input);

      expect(audit.record).toHaveBeenCalledWith(prisma, [
        {
          projectId: PROJECT_ID,
          action: AuditAction.STATE_UPDATED,
          flagKey: 'new-checkout',
          environmentKey: 'production',
          before: { enabled: false, rolloutPercentage: 100, includeUsers: [], excludeUsers: [] },
          after: input,
        },
      ]);
    });

    it('invalidates only the affected environment after the transaction commits', async () => {
      await service.updateState('storefront', 'new-checkout', 'production', input);

      expect(cache.invalidate).toHaveBeenCalledWith([PROD_ENV_ID]);
      const committed = prisma.$transaction.mock.invocationCallOrder[0] ?? 0;
      const audited = audit.record.mock.invocationCallOrder[0] ?? 0;
      const invalidated = cache.invalidate.mock.invocationCallOrder[0] ?? 0;
      expect(invalidated).toBeGreaterThan(audited);
      expect(invalidated).toBeGreaterThan(committed);
    });

    it('does not invalidate the cache when the transaction fails', async () => {
      audit.record.mockRejectedValue(new Error('audit insert failed'));

      await expect(
        service.updateState('storefront', 'new-checkout', 'production', input),
      ).rejects.toThrow('audit insert failed');
      expect(cache.invalidate).not.toHaveBeenCalled();
    });

    it('rejects an unknown environment', async () => {
      prisma.environment.findUnique.mockResolvedValue(null);

      await expect(service.updateState('storefront', 'new-checkout', 'qa', input)).rejects.toThrow(
        new NotFoundException('Environment "qa" not found in project "storefront"'),
      );
      expect(prisma.flagState.upsert).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('rejects an unknown flag', async () => {
      prisma.flag.findUnique.mockResolvedValue(null);

      await expect(
        service.updateState('storefront', 'missing', 'production', input),
      ).rejects.toThrow(new NotFoundException('Flag "missing" not found in project "storefront"'));
    });
  });

  it('escapes LIKE wildcards in the search query', async () => {
    prisma.project.findUnique.mockResolvedValue({ id: PROJECT_ID });
    prisma.flag.findMany.mockResolvedValue([]);
    prisma.flag.count.mockResolvedValue(0);

    await service.list('storefront', { page: 1, limit: 20, q: '50%_off\\' });

    expect(prisma.flag.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          projectId: PROJECT_ID,
          OR: [
            { key: { contains: '50\\%\\_off\\\\', mode: 'insensitive' } },
            { name: { contains: '50\\%\\_off\\\\', mode: 'insensitive' } },
          ],
        },
      }),
    );
  });
});
