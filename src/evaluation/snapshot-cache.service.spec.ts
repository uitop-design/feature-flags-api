import { Logger } from '@nestjs/common';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { createPrismaMock, createRedisMock, DEV_ENV_ID, PROD_ENV_ID } from '../test/mocks.js';
import {
  CACHE_KEY_PATTERN,
  generationKey,
  snapshotKey,
  SnapshotCacheService,
} from './snapshot-cache.service.js';

const rule = { enabled: true, rolloutPercentage: 25, includeUsers: ['qa'], excludeUsers: [] };
const snapshot = { flags: [{ key: 'new-checkout', ...rule }] };

describe('SnapshotCacheService', () => {
  let prisma: ReturnType<typeof createPrismaMock>['mock'];
  let redis: ReturnType<typeof createRedisMock>['mock'];
  let cache: SnapshotCacheService;

  function setup(available = true) {
    const prismaMock = createPrismaMock();
    const redisMock = createRedisMock(available);
    prisma = prismaMock.mock;
    redis = redisMock.mock;
    cache = new SnapshotCacheService(prismaMock.service, redisMock.service);
    prisma.flagState.findMany.mockResolvedValue([{ ...rule, flag: { key: 'new-checkout' } }]);
  }

  beforeEach(() => setup());

  it('serves a cached snapshot without querying Postgres', async () => {
    redis.client.mget.mockResolvedValue([JSON.stringify(snapshot), '3']);

    const result = await cache.get(PROD_ENV_ID);

    expect(redis.client.mget).toHaveBeenCalledWith(
      snapshotKey(PROD_ENV_ID),
      generationKey(PROD_ENV_ID),
    );
    expect(result.get('new-checkout')).toEqual(rule);
    expect(prisma.flagState.findMany).not.toHaveBeenCalled();
  });

  it('builds a missing snapshot from Postgres and stores it for the read generation', async () => {
    redis.client.mget.mockResolvedValue([null, '7']);

    const result = await cache.get(PROD_ENV_ID);

    expect(result.get('new-checkout')).toEqual(rule);
    expect(prisma.flagState.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { environmentId: PROD_ENV_ID } }),
    );
    expect(redis.client.eval).toHaveBeenCalledWith(
      expect.any(String),
      2,
      snapshotKey(PROD_ENV_ID),
      generationKey(PROD_ENV_ID),
      JSON.stringify(snapshot),
      '7',
    );
  });

  it('treats a missing generation as the initial one', async () => {
    redis.client.mget.mockResolvedValue([null, null]);

    await cache.get(PROD_ENV_ID);

    expect(redis.client.eval.mock.calls[0]?.at(-1)).toBe('');
  });

  it('rebuilds a corrupted snapshot', async () => {
    redis.client.mget.mockResolvedValue(['{"flags":"oops"}', '1']);

    const result = await cache.get(PROD_ENV_ID);

    expect(result.get('new-checkout')).toEqual(rule);
    expect(prisma.flagState.findMany).toHaveBeenCalledTimes(1);
  });

  it('does not treat inherited object keys as flags', async () => {
    redis.client.mget.mockResolvedValue([JSON.stringify(snapshot), '1']);

    const result = await cache.get(PROD_ENV_ID);

    expect(result.get('constructor')).toBeUndefined();
    expect(result.get('__proto__')).toBeUndefined();
  });

  it('falls back to Postgres without touching Redis when it is unavailable', async () => {
    setup(false);

    const result = await cache.get(PROD_ENV_ID);

    expect(result.get('new-checkout')).toEqual(rule);
    expect(redis.client.mget).not.toHaveBeenCalled();
    expect(redis.client.eval).not.toHaveBeenCalled();
  });

  it('falls back to Postgres when a Redis command fails', async () => {
    redis.client.mget.mockRejectedValue(new Error('Command timed out'));

    const result = await cache.get(PROD_ENV_ID);

    expect(result.get('new-checkout')).toEqual(rule);
    expect(redis.client.eval).not.toHaveBeenCalled();
  });

  it('still answers when storing the rebuilt snapshot fails', async () => {
    redis.client.mget.mockResolvedValue([null, '1']);
    redis.client.eval.mockRejectedValue(new Error('Connection is closed'));

    await expect(cache.get(PROD_ENV_ID)).resolves.toBeInstanceOf(Map);
  });

  it('bumps the generation and drops the snapshot of every affected environment', async () => {
    await cache.invalidate([DEV_ENV_ID, PROD_ENV_ID]);

    expect(redis.transaction.incr.mock.calls).toEqual([
      [generationKey(DEV_ENV_ID)],
      [generationKey(PROD_ENV_ID)],
    ]);
    expect(redis.transaction.del.mock.calls).toEqual([
      [snapshotKey(DEV_ENV_ID)],
      [snapshotKey(PROD_ENV_ID)],
    ]);
    expect(redis.transaction.exec).toHaveBeenCalledTimes(1);
  });

  it('skips invalidation while Redis is unavailable', async () => {
    setup(false);

    await cache.invalidate([PROD_ENV_ID]);

    expect(redis.client.multi).not.toHaveBeenCalled();
  });

  it('flushes every cache key when the connection becomes ready', async () => {
    redis.client.scan
      .mockResolvedValueOnce(['42', [snapshotKey(DEV_ENV_ID)]])
      .mockResolvedValueOnce(['0', [generationKey(DEV_ENV_ID)]]);
    redis.client.unlink.mockResolvedValue(1);
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    cache.onModuleInit();
    const [listener] = redis.onReady.mock.calls[0] as [() => Promise<void>];

    await listener();

    expect(redis.client.scan).toHaveBeenNthCalledWith(
      1,
      '0',
      'MATCH',
      CACHE_KEY_PATTERN,
      'COUNT',
      500,
    );
    expect(redis.client.scan).toHaveBeenNthCalledWith(
      2,
      '42',
      'MATCH',
      CACHE_KEY_PATTERN,
      'COUNT',
      500,
    );
    expect(redis.client.unlink).toHaveBeenCalledTimes(2);
  });
});
