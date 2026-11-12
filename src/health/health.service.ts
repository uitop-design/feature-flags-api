import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { RedisService } from '../redis/redis.service.js';

const CHECK_TIMEOUT_MS = 2000;

export interface HealthReport {
  status: 'ok';
  checks: { postgres: 'up'; redis: 'up' };
}

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async check(): Promise<HealthReport> {
    const [postgres, redis] = await Promise.all([
      withTimeout(this.prisma.$queryRaw`SELECT 1`.then(() => true)),
      withTimeout(this.redis.ping()),
    ]);
    const down = [postgres ? null : 'postgres', redis ? null : 'redis'].filter(
      (name): name is string => name !== null,
    );
    if (down.length > 0) {
      throw new ServiceUnavailableException(`Unavailable dependencies: ${down.join(', ')}`);
    }
    return { status: 'ok', checks: { postgres: 'up', redis: 'up' } };
  }
}

async function withTimeout(check: Promise<boolean>): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => resolve(false), CHECK_TIMEOUT_MS);
  });
  try {
    return await Promise.race([check, timeout]);
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
