import { UnauthorizedException } from '@nestjs/common';
import { beforeEach, describe, expect, it } from '@jest/globals';
import { generateSdkKey } from '../environments/sdk-key.js';
import { createPrismaMock, PROD_ENV_ID } from '../test/mocks.js';
import { SdkKeyService } from './sdk-key.service.js';

describe('SdkKeyService', () => {
  let prisma: ReturnType<typeof createPrismaMock>['mock'];
  let service: SdkKeyService;

  beforeEach(() => {
    const prismaMock = createPrismaMock();
    prisma = prismaMock.mock;
    service = new SdkKeyService(prismaMock.service);
  });

  it('resolves the environment of a valid key', async () => {
    const sdkKey = generateSdkKey();
    prisma.environment.findUnique.mockResolvedValue({ id: PROD_ENV_ID, key: 'production' });

    await expect(service.resolve(sdkKey)).resolves.toEqual({
      id: PROD_ENV_ID,
      key: 'production',
    });
    expect(prisma.environment.findUnique).toHaveBeenCalledWith({
      where: { sdkKey },
      select: { id: true, key: true },
    });
  });

  it.each([
    ['a missing header', undefined],
    ['an empty header', ''],
    ['a repeated header', ['sdk_a', 'sdk_b']],
    ['a key without the prefix', 'A'.repeat(36)],
    ['a key of the wrong length', 'sdk_short'],
  ])('rejects %s without querying the database', async (_case, header) => {
    await expect(service.resolve(header)).rejects.toThrow(UnauthorizedException);
    expect(prisma.environment.findUnique).not.toHaveBeenCalled();
  });

  it('rejects an unknown or rotated key', async () => {
    prisma.environment.findUnique.mockResolvedValue(null);

    await expect(service.resolve(generateSdkKey())).rejects.toThrow(
      new UnauthorizedException('Missing or invalid X-SDK-Key header'),
    );
  });

  it('generates keys with the sdk_ prefix and 24 random bytes', () => {
    const keys = new Set(Array.from({ length: 100 }, generateSdkKey));

    expect(keys.size).toBe(100);
    for (const key of keys) {
      expect(key).toMatch(/^sdk_[A-Za-z0-9_-]{32}$/);
      expect(Buffer.from(key.slice(4), 'base64url')).toHaveLength(24);
    }
  });
});
