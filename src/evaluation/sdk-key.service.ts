import { Injectable, UnauthorizedException } from '@nestjs/common';
import { SDK_KEY_PATTERN } from '../environments/sdk-key.js';
import { PrismaService } from '../prisma/prisma.service.js';

export interface SdkEnvironment {
  id: string;
  key: string;
}

@Injectable()
export class SdkKeyService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(sdkKey: unknown): Promise<SdkEnvironment> {
    if (typeof sdkKey !== 'string' || !SDK_KEY_PATTERN.test(sdkKey)) {
      throw invalidSdkKey();
    }
    const environment = await this.prisma.environment.findUnique({
      where: { sdkKey },
      select: { id: true, key: true },
    });
    if (!environment) {
      throw invalidSdkKey();
    }
    return environment;
  }
}

function invalidSdkKey(): UnauthorizedException {
  return new UnauthorizedException('Missing or invalid X-SDK-Key header');
}
