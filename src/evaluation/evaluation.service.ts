import { Injectable, NotFoundException } from '@nestjs/common';
import { evaluateFlag, type EvaluationReason } from './flag-evaluator.js';
import type { SdkEnvironment } from './sdk-key.service.js';
import { SnapshotCacheService } from './snapshot-cache.service.js';

export interface EnvironmentEvaluation {
  environment: string;
  flags: Record<string, boolean>;
}

export interface FlagEvaluation {
  flagKey: string;
  value: boolean;
  reason: EvaluationReason;
}

@Injectable()
export class EvaluationService {
  constructor(private readonly cache: SnapshotCacheService) {}

  async evaluateAll(environment: SdkEnvironment, userId: string): Promise<EnvironmentEvaluation> {
    const snapshot = await this.cache.get(environment.id);
    const flags = Object.fromEntries(
      Array.from(snapshot, ([flagKey, rule]) => [
        flagKey,
        evaluateFlag(flagKey, rule, userId).value,
      ]),
    );
    return { environment: environment.key, flags };
  }

  async evaluateOne(
    environment: SdkEnvironment,
    flagKey: string,
    userId: string,
  ): Promise<FlagEvaluation> {
    const rule = (await this.cache.get(environment.id)).get(flagKey);
    if (!rule) {
      throw new NotFoundException(`Flag "${flagKey}" not found`);
    }
    return { flagKey, ...evaluateFlag(flagKey, rule, userId) };
  }
}
