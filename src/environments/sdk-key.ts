import { randomBytes } from 'node:crypto';

export const SDK_KEY_PREFIX = 'sdk_';
export const SDK_KEY_PATTERN = /^sdk_[A-Za-z0-9_-]{32}$/;

export function generateSdkKey(): string {
  return `${SDK_KEY_PREFIX}${randomBytes(24).toString('base64url')}`;
}

export function maskSdkKey(sdkKey: string): string {
  return `${SDK_KEY_PREFIX}...${sdkKey.slice(-4)}`;
}
