import { z } from 'zod';
import type { FlagRule } from './flag-evaluator.js';

const snapshotSchema = z.object({
  flags: z.array(
    z.object({
      key: z.string(),
      enabled: z.boolean(),
      rolloutPercentage: z.int().min(0).max(100),
      includeUsers: z.array(z.string()),
      excludeUsers: z.array(z.string()),
    }),
  ),
});

export type SnapshotData = z.infer<typeof snapshotSchema>;

export type EnvironmentSnapshot = ReadonlyMap<string, FlagRule>;

export function toSnapshot(data: SnapshotData): EnvironmentSnapshot {
  return new Map(data.flags.map(({ key, ...rule }) => [key, rule]));
}

export function parseSnapshot(raw: string): SnapshotData | null {
  try {
    const result = snapshotSchema.safeParse(JSON.parse(raw));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}
