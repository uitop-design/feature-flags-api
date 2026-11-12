import { Prisma } from '../../generated/prisma/client.js';

export const PrismaErrorCode = {
  UniqueViolation: 'P2002',
  RecordNotFound: 'P2025',
  ForeignKeyViolation: 'P2003',
} as const;

export function isPrismaError(
  error: unknown,
  code: string,
): error is Prisma.PrismaClientKnownRequestError {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
}
