import { createHash } from 'node:crypto';

export const EvaluationReason = {
  Excluded: 'EXCLUDED',
  Included: 'INCLUDED',
  Disabled: 'DISABLED',
  RolloutIn: 'ROLLOUT_IN',
  RolloutOut: 'ROLLOUT_OUT',
} as const;

export type EvaluationReason = (typeof EvaluationReason)[keyof typeof EvaluationReason];

export const BUCKET_COUNT = 100;

export interface FlagRule {
  enabled: boolean;
  rolloutPercentage: number;
  includeUsers: readonly string[];
  excludeUsers: readonly string[];
}

export interface Evaluation {
  value: boolean;
  reason: EvaluationReason;
}

export function bucketFor(flagKey: string, userId: string): number {
  const digest = createHash('sha256').update(`${flagKey}:${userId}`).digest();
  return digest.readUInt32BE(0) % BUCKET_COUNT;
}

export function evaluateFlag(flagKey: string, rule: FlagRule, userId: string): Evaluation {
  if (rule.excludeUsers.includes(userId)) {
    return { value: false, reason: EvaluationReason.Excluded };
  }
  if (rule.includeUsers.includes(userId)) {
    return { value: true, reason: EvaluationReason.Included };
  }
  if (!rule.enabled) {
    return { value: false, reason: EvaluationReason.Disabled };
  }
  return bucketFor(flagKey, userId) < rule.rolloutPercentage
    ? { value: true, reason: EvaluationReason.RolloutIn }
    : { value: false, reason: EvaluationReason.RolloutOut };
}
