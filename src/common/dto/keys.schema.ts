import { z } from 'zod';

export const projectKeySchema = z
  .string()
  .regex(/^[a-z0-9-]{2,48}$/, 'must be 2-48 characters: lowercase letters, digits or hyphens')
  .describe('Project key, unique across the service');

export const environmentKeySchema = z
  .string()
  .regex(/^[a-z0-9-]{2,48}$/, 'must be 2-48 characters: lowercase letters, digits or hyphens')
  .describe('Environment key, unique within a project');

export const flagKeySchema = z
  .string()
  .regex(
    /^[a-z0-9._-]{2,48}$/,
    'must be 2-48 characters: lowercase letters, digits, hyphens, underscores or dots',
  )
  .describe('Flag key, unique within a project');

export const nameSchema = z.string().trim().min(2).max(64).describe('Display name');

export const userIdSchema = z
  .string()
  .min(1)
  .max(128)
  .describe('User identifier, compared exactly');
