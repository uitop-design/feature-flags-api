import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import type { Request } from 'express';
import { SdkKeyService, type SdkEnvironment } from './sdk-key.service.js';

export const SDK_KEY_HEADER = 'x-sdk-key';

interface SdkRequest extends Request {
  sdkEnvironment?: SdkEnvironment;
}

@Injectable()
export class SdkKeyGuard implements CanActivate {
  constructor(private readonly sdkKeys: SdkKeyService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<SdkRequest>();
    request.sdkEnvironment = await this.sdkKeys.resolve(request.headers[SDK_KEY_HEADER]);
    return true;
  }
}

export const CurrentEnvironment = createParamDecorator(
  (_data: unknown, context: ExecutionContext): SdkEnvironment => {
    const environment = context.switchToHttp().getRequest<SdkRequest>().sdkEnvironment;
    if (!environment) {
      throw new InternalServerErrorException('SDK environment is not resolved');
    }
    return environment;
  },
);
