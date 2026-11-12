import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { RedisService } from '../redis/redis.service.js';
import {
  parseSnapshot,
  toSnapshot,
  type EnvironmentSnapshot,
  type SnapshotData,
} from './environment-snapshot.js';

export const CACHE_KEY_PATTERN = 'ff:*';
const SCAN_BATCH_SIZE = 500;

const SET_IF_GENERATION_UNCHANGED = `
if (redis.call('GET', KEYS[2]) or '') == ARGV[2] then
  redis.call('SET', KEYS[1], ARGV[1])
  return 1
end
return 0
`;

export function snapshotKey(environmentId: string): string {
  return `ff:env:${environmentId}:snapshot`;
}

export function generationKey(environmentId: string): string {
  return `ff:env:${environmentId}:generation`;
}

interface CachedEntry {
  snapshot: SnapshotData | null;
  generation: string;
}

@Injectable()
export class SnapshotCacheService implements OnModuleInit {
  private readonly logger = new Logger(SnapshotCacheService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  onModuleInit(): void {
    this.redis.onReady(async () => {
      await this.flushAll();
    });
  }

  async get(environmentId: string): Promise<EnvironmentSnapshot> {
    const cached = await this.read(environmentId);
    if (cached?.snapshot) {
      return toSnapshot(cached.snapshot);
    }
    const data = await this.load(environmentId);
    if (cached) {
      await this.store(environmentId, data, cached.generation);
    }
    return toSnapshot(data);
  }

  async invalidate(environmentIds: readonly string[]): Promise<void> {
    if (environmentIds.length === 0 || !this.redis.isAvailable()) {
      return;
    }
    const transaction = this.redis.client.multi();
    for (const id of environmentIds) {
      transaction.incr(generationKey(id)).del(snapshotKey(id));
    }
    await this.run(transaction.exec(), 'invalidate cached snapshots');
  }

  async remove(environmentIds: readonly string[]): Promise<void> {
    if (environmentIds.length === 0 || !this.redis.isAvailable()) {
      return;
    }
    const keys = environmentIds.flatMap((id) => [snapshotKey(id), generationKey(id)]);
    await this.run(this.redis.client.del(...keys), 'remove cached snapshots');
  }

  async flushAll(): Promise<number> {
    let cursor = '0';
    let removed = 0;
    do {
      const [next, keys] = await this.redis.client.scan(
        cursor,
        'MATCH',
        CACHE_KEY_PATTERN,
        'COUNT',
        SCAN_BATCH_SIZE,
      );
      if (keys.length > 0) {
        removed += await this.redis.client.unlink(...keys);
      }
      cursor = next;
    } while (cursor !== '0');
    this.logger.log(`Flag cache flushed, ${removed} keys removed`);
    return removed;
  }

  private async read(environmentId: string): Promise<CachedEntry | null> {
    if (!this.redis.isAvailable()) {
      return null;
    }
    try {
      const [raw, generation] = await this.redis.client.mget(
        snapshotKey(environmentId),
        generationKey(environmentId),
      );
      return { snapshot: raw ? parseSnapshot(raw) : null, generation: generation ?? '' };
    } catch {
      return null;
    }
  }

  private async store(environmentId: string, data: SnapshotData, generation: string) {
    try {
      await this.redis.client.eval(
        SET_IF_GENERATION_UNCHANGED,
        2,
        snapshotKey(environmentId),
        generationKey(environmentId),
        JSON.stringify(data),
        generation,
      );
    } catch {
      return;
    }
  }

  private async load(environmentId: string): Promise<SnapshotData> {
    const states = await this.prisma.flagState.findMany({
      where: { environmentId },
      select: {
        enabled: true,
        rolloutPercentage: true,
        includeUsers: true,
        excludeUsers: true,
        flag: { select: { key: true } },
      },
      orderBy: { flag: { key: 'asc' } },
    });
    return { flags: states.map(({ flag, ...rule }) => ({ key: flag.key, ...rule })) };
  }

  private async run(command: Promise<unknown>, action: string): Promise<void> {
    try {
      await command;
    } catch (error) {
      this.logger.warn(
        `Failed to ${action}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
