import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import { Redis } from 'ioredis';
import { AppConfigService } from '../config/app-config.service.js';

type ConnectionState = 'connecting' | 'up' | 'down';
type ReadyListener = () => Promise<void>;

@Injectable()
export class RedisService implements OnApplicationShutdown {
  readonly client: Redis;
  private readonly logger = new Logger('Redis');
  private readonly readyListeners: ReadyListener[] = [];
  private state: ConnectionState = 'connecting';
  private stopping = false;

  constructor(config: AppConfigService) {
    this.client = new Redis(config.get('REDIS_URL'), {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      connectTimeout: 2000,
      commandTimeout: 1000,
      retryStrategy: (times) => Math.min(times * 1000, 5000),
    });
    this.client.on('ready', () => this.markUp());
    this.client.on('error', (error) => this.markDown(error));
    this.client.on('close', () => this.markDown());
    this.client.on('reconnecting', () => this.markDown());
  }

  isAvailable(): boolean {
    return this.state === 'up';
  }

  onReady(listener: ReadyListener): void {
    this.readyListeners.push(listener);
  }

  async ping(): Promise<boolean> {
    try {
      return (await this.client.ping()) === 'PONG';
    } catch {
      return false;
    }
  }

  async onApplicationShutdown(): Promise<void> {
    this.stopping = true;
    try {
      await this.client.quit();
    } catch {
      this.client.disconnect();
    }
  }

  private markUp(): void {
    const restored = this.state === 'down';
    this.state = 'up';
    this.logger.log(restored ? 'Redis connection restored' : 'Redis connected');
    for (const listener of this.readyListeners) {
      listener().catch((error: unknown) =>
        this.logger.warn(`Redis ready handler failed: ${describe(error)}`),
      );
    }
  }

  private markDown(error?: unknown): void {
    if (this.stopping || this.state === 'down') {
      return;
    }
    this.state = 'down';
    const reason = error === undefined ? 'connection closed' : describe(error);
    this.logger.warn(`Redis unavailable: ${reason}`);
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
