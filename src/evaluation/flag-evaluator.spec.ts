import { describe, expect, it } from '@jest/globals';
import { createHash } from 'node:crypto';
import { bucketFor, evaluateFlag, EvaluationReason, type FlagRule } from './flag-evaluator.js';

const FLAG = 'new-checkout';
const USERS = Array.from({ length: 10_000 }, (_, index) => `user-${index}`);

function rule(overrides: Partial<FlagRule> = {}): FlagRule {
  return {
    enabled: true,
    rolloutPercentage: 100,
    includeUsers: [],
    excludeUsers: [],
    ...overrides,
  };
}

describe('bucketFor', () => {
  it('takes the first 4 bytes of sha256(flagKey:userId) as uint32 modulo 100', () => {
    const prefix = createHash('sha256').update(`${FLAG}:alice`).digest('hex').slice(0, 8);
    const expected = Number.parseInt(prefix, 16) % 100;

    expect(bucketFor(FLAG, 'alice')).toBe(expected);
  });

  it('always returns a bucket between 0 and 99', () => {
    const buckets = USERS.map((user) => bucketFor(FLAG, user));

    expect(Math.min(...buckets)).toBe(0);
    expect(Math.max(...buckets)).toBe(99);
  });

  it('is stable for the same flag and user', () => {
    expect(USERS.map((user) => bucketFor(FLAG, user))).toEqual(
      USERS.map((user) => bucketFor(FLAG, user)),
    );
  });

  it('assigns buckets independently per flag', () => {
    const same = USERS.filter((user) => bucketFor(FLAG, user) === bucketFor('dark-mode', user));

    expect(same.length).toBeLessThan(USERS.length * 0.05);
  });
});

describe('evaluateFlag', () => {
  it('excludes a user even when the user is included and the flag is fully rolled out', () => {
    expect(evaluateFlag(FLAG, rule({ excludeUsers: ['alice'] }), 'alice')).toEqual({
      value: false,
      reason: EvaluationReason.Excluded,
    });
  });

  it('includes a targeted user even when the flag is disabled', () => {
    expect(evaluateFlag(FLAG, rule({ enabled: false, includeUsers: ['alice'] }), 'alice')).toEqual({
      value: true,
      reason: EvaluationReason.Included,
    });
  });

  it('includes a targeted user even when the rollout is 0%', () => {
    expect(
      evaluateFlag(FLAG, rule({ rolloutPercentage: 0, includeUsers: ['alice'] }), 'alice'),
    ).toEqual({ value: true, reason: EvaluationReason.Included });
  });

  it('returns DISABLED for everyone else when the flag is off', () => {
    expect(evaluateFlag(FLAG, rule({ enabled: false, includeUsers: ['bob'] }), 'alice')).toEqual({
      value: false,
      reason: EvaluationReason.Disabled,
    });
  });

  it('compares user ids exactly', () => {
    const targeted = rule({ enabled: false, includeUsers: ['Alice'], excludeUsers: ['bob '] });

    expect(evaluateFlag(FLAG, targeted, 'alice').reason).toBe(EvaluationReason.Disabled);
    expect(evaluateFlag(FLAG, rule({ excludeUsers: ['bob '] }), 'bob').reason).toBe(
      EvaluationReason.RolloutIn,
    );
  });

  it('puts users with bucket below the percentage into the rollout', () => {
    for (const user of USERS.slice(0, 500)) {
      const result = evaluateFlag(FLAG, rule({ rolloutPercentage: 30 }), user);
      const inRollout = bucketFor(FLAG, user) < 30;

      expect(result).toEqual({
        value: inRollout,
        reason: inRollout ? EvaluationReason.RolloutIn : EvaluationReason.RolloutOut,
      });
    }
  });

  it('enables nobody at 0% and everybody at 100%', () => {
    expect(
      USERS.some((user) => evaluateFlag(FLAG, rule({ rolloutPercentage: 0 }), user).value),
    ).toBe(false);
    expect(USERS.every((user) => evaluateFlag(FLAG, rule(), user).value)).toBe(true);
  });

  it('keeps the share of enabled users close to the rollout percentage', () => {
    const enabled = USERS.filter(
      (user) => evaluateFlag(FLAG, rule({ rolloutPercentage: 25 }), user).value,
    ).length;

    expect(enabled / USERS.length).toBeGreaterThanOrEqual(0.23);
    expect(enabled / USERS.length).toBeLessThanOrEqual(0.27);
  });

  it('never drops users who were already enabled when the percentage grows', () => {
    const percentages = [1, 10, 25, 50, 75, 99, 100];
    for (let step = 1; step < percentages.length; step++) {
      const before = rule({ rolloutPercentage: percentages[step - 1] });
      const after = rule({ rolloutPercentage: percentages[step] });
      const dropped = USERS.filter(
        (user) => evaluateFlag(FLAG, before, user).value && !evaluateFlag(FLAG, after, user).value,
      );

      expect(dropped).toEqual([]);
    }
  });
});
