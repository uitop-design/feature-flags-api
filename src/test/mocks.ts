import { jest } from '@jest/globals';
import { Prisma } from '../generated/prisma/client.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { RedisService } from '../redis/redis.service.js';
import type { SnapshotCacheService } from '../evaluation/snapshot-cache.service.js';
import type { AuditService } from '../audit/audit.service.js';

export type AsyncFn = (...args: unknown[]) => Promise<unknown>;

function modelMock() {
  return {
    create: jest.fn<AsyncFn>(),
    findUnique: jest.fn<AsyncFn>(),
    findMany: jest.fn<AsyncFn>(),
    count: jest.fn<AsyncFn>(),
    update: jest.fn<AsyncFn>(),
    upsert: jest.fn<AsyncFn>(),
    delete: jest.fn<AsyncFn>(),
    createMany: jest.fn<AsyncFn>(),
  };
}

export function createPrismaMock() {
  const mock = {
    project: modelMock(),
    environment: modelMock(),
    flag: modelMock(),
    flagState: modelMock(),
    auditEntry: modelMock(),
    $queryRaw: jest.fn<AsyncFn>(),
    $transaction: jest.fn<AsyncFn>(),
  };
  mock.$transaction.mockImplementation((arg: unknown) =>
    typeof arg === 'function'
      ? (arg as (tx: typeof mock) => Promise<unknown>)(mock)
      : Promise.all(arg as Promise<unknown>[]),
  );
  return { mock, service: mock as unknown as PrismaService };
}

export function createRedisMock(available = true) {
  const transaction = {
    incr: jest.fn(),
    del: jest.fn(),
    exec: jest.fn<AsyncFn>().mockResolvedValue([]),
  };
  transaction.incr.mockReturnValue(transaction);
  transaction.del.mockReturnValue(transaction);
  const client = {
    mget: jest.fn<AsyncFn>(),
    eval: jest.fn<AsyncFn>().mockResolvedValue(1),
    del: jest.fn<AsyncFn>().mockResolvedValue(0),
    scan: jest.fn<AsyncFn>(),
    unlink: jest.fn<AsyncFn>(),
    multi: jest.fn(() => transaction),
  };
  const mock = {
    client,
    transaction,
    isAvailable: jest.fn(() => available),
    onReady: jest.fn(),
    ping: jest.fn<() => Promise<boolean>>().mockResolvedValue(available),
  };
  return { mock, service: mock as unknown as RedisService };
}

export function createCacheMock() {
  const mock = {
    get: jest.fn<AsyncFn>(),
    invalidate: jest.fn<AsyncFn>().mockResolvedValue(undefined),
    remove: jest.fn<AsyncFn>().mockResolvedValue(undefined),
  };
  return { mock, service: mock as unknown as SnapshotCacheService };
}

export function createAuditMock() {
  const mock = { record: jest.fn<AsyncFn>().mockResolvedValue(undefined) };
  return { mock, service: mock as unknown as AuditService };
}

export function prismaError(code: string): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError(`Prisma error ${code}`, {
    code,
    clientVersion: 'test',
  });
}

export const PROJECT_ID = '01a1e913-0bf9-776e-a587-000000000001';
export const DEV_ENV_ID = '01a1e913-0bf9-776e-a587-0000000000d1';
export const PROD_ENV_ID = '01a1e913-0bf9-776e-a587-0000000000d2';
export const FLAG_ID = '01a1e913-0bf9-776e-a587-0000000000f1';
export const CREATED_AT = new Date('2026-11-12T10:00:00Z');
