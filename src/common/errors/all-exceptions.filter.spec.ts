import {
  BadRequestException,
  NotFoundException,
  PayloadTooLargeException,
  ServiceUnavailableException,
  UnauthorizedException,
  type ArgumentsHost,
} from '@nestjs/common';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { prismaError } from '../../test/mocks.js';
import { AllExceptionsFilter } from './all-exceptions.filter.js';
import type { ErrorBody } from './error-body.js';

const PATH = '/api/projects/storefront/flags?q=x';

function createHost() {
  const json = jest.fn<(body: ErrorBody) => void>();
  const status = jest.fn<(code: number) => { json: typeof json }>(() => ({ json }));
  const host = {
    switchToHttp: () => ({
      getRequest: () => ({ method: 'POST', originalUrl: PATH }),
      getResponse: () => ({ status }),
    }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
}

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;
  let logError: jest.SpiedFunction<(...args: unknown[]) => void>;

  beforeEach(() => {
    filter = new AllExceptionsFilter();
    logError = jest
      .spyOn(
        (filter as unknown as { logger: { error: (...args: unknown[]) => void } }).logger,
        'error',
      )
      .mockImplementation(() => undefined);
  });

  function handle(exception: unknown) {
    const { host, status, json } = createHost();
    filter.catch(exception, host);
    return { status: status.mock.calls[0]?.[0], body: json.mock.calls[0]?.[0] };
  }

  it('renders the unified error format', () => {
    const { status, body } = handle(new NotFoundException('Project "storefront" not found'));

    expect(status).toBe(404);
    expect(body).toEqual({
      statusCode: 404,
      error: 'Not Found',
      message: 'Project "storefront" not found',
      path: PATH,
      timestamp: expect.any(String),
    });
    expect(Number.isNaN(Date.parse(body?.timestamp ?? ''))).toBe(false);
  });

  it('keeps the list of validation messages', () => {
    const { status, body } = handle(
      new BadRequestException(['key: must be 2-48 characters', 'name: Too small']),
    );

    expect(status).toBe(400);
    expect(body?.message).toEqual(['key: must be 2-48 characters', 'name: Too small']);
  });

  it('passes through 401 from the SDK key check', () => {
    const { status, body } = handle(
      new UnauthorizedException('Missing or invalid X-SDK-Key header'),
    );

    expect(status).toBe(401);
    expect(body).toMatchObject({ error: 'Unauthorized' });
  });

  it('reports a malformed JSON body as a readable 400', () => {
    const exception = new BadRequestException('Unexpected token', {
      cause: new SyntaxError('Unexpected token } in JSON'),
    });

    expect(handle(exception).body).toMatchObject({
      statusCode: 400,
      message: 'Request body must be valid JSON',
    });
  });

  it('passes through 413 and 503', () => {
    expect(handle(new PayloadTooLargeException()).status).toBe(413);
    expect(
      handle(new ServiceUnavailableException('Unavailable dependencies: redis')).body,
    ).toMatchObject({ statusCode: 503, message: 'Unavailable dependencies: redis' });
  });

  it.each([
    ['P2002', 409, 'Conflict'],
    ['P2025', 404, 'Not Found'],
    ['P2003', 400, 'Bad Request'],
  ])('maps Prisma %s to %i', (code, statusCode, error) => {
    const { status, body } = handle(prismaError(code));

    expect(status).toBe(statusCode);
    expect(body).toMatchObject({ statusCode, error });
    expect(logError).not.toHaveBeenCalled();
  });

  it('hides details of unexpected errors and logs them', () => {
    const { status, body } = handle(new Error('connect ECONNREFUSED 10.0.0.5:5432'));

    expect(status).toBe(500);
    expect(body?.message).toBe('Internal server error');
    expect(JSON.stringify(body)).not.toContain('ECONNREFUSED');
    expect(logError).toHaveBeenCalledTimes(1);
  });

  it('treats unknown Prisma errors as internal', () => {
    const { status, body } = handle(prismaError('P2034'));

    expect(status).toBe(500);
    expect(body?.message).toBe('Internal server error');
  });
});
