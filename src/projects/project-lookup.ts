import { NotFoundException } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';

export function projectNotFound(key: string): NotFoundException {
  return new NotFoundException(`Project "${key}" not found`);
}

export async function findProjectId(db: Prisma.TransactionClient, key: string): Promise<string> {
  const project = await db.project.findUnique({ where: { key }, select: { id: true } });
  if (!project) {
    throw projectNotFound(key);
  }
  return project.id;
}

export async function lockProject(tx: Prisma.TransactionClient, key: string): Promise<string> {
  const [project] = await tx.$queryRaw<{ id: string }[]>`
    SELECT id::text AS id FROM projects WHERE key = ${key} FOR UPDATE
  `;
  if (!project) {
    throw projectNotFound(key);
  }
  return project.id;
}
