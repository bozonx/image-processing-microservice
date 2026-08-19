import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { HttpException, HttpStatus, type ArgumentsHost } from '@nestjs/common';
import type { PinoLogger } from 'nestjs-pino';
import { AllExceptionsFilter } from '../../src/common/filters/all-exceptions.filter.js';

describe('AllExceptionsFilter (unit)', () => {
  let filter: AllExceptionsFilter;
  let loggerMock: Partial<PinoLogger>;
  let replyMock: any;
  let requestMock: any;
  let hostMock: ArgumentsHost;

  beforeEach(() => {
    loggerMock = {
      setContext: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
    };

    replyMock = {
      status: jest.fn().mockReturnThis(),
      type: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
      sent: false,
      raw: {
        headersSent: false,
        destroyed: false,
        destroy: jest.fn(),
      },
    };

    requestMock = {
      method: 'POST',
      url: '/api/v1/test',
    };

    hostMock = {
      switchToHttp: () => ({
        getResponse: () => replyMock,
        getRequest: () => requestMock,
        getNext: jest.fn(),
      }),
      getType: jest.fn(),
      getArgs: jest.fn(),
      getArgByIndex: jest.fn(),
      switchToRpc: jest.fn(),
      switchToWs: jest.fn(),
    } as unknown as ArgumentsHost;

    filter = new AllExceptionsFilter(loggerMock as PinoLogger);
  });

  it('handles standard HttpException with string response', () => {
    const exception = new HttpException('Forbidden resource', HttpStatus.FORBIDDEN);
    filter.catch(exception, hostMock);

    expect(loggerMock.warn).toHaveBeenCalled();
    expect(replyMock.status).toHaveBeenCalledWith(HttpStatus.FORBIDDEN);
    expect(replyMock.type).toHaveBeenCalledWith('application/json');
    expect(replyMock.send).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.FORBIDDEN,
        message: 'Forbidden resource',
        error: 'HttpException',
        path: '/api/v1/test',
        method: 'POST',
      }),
    );
  });

  it('handles HttpException with object response and string message', () => {
    const exception = new HttpException(
      { message: 'Invalid payload', error: 'Bad Request' },
      HttpStatus.BAD_REQUEST,
    );
    filter.catch(exception, hostMock);

    expect(replyMock.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(replyMock.send).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'Invalid payload',
        error: { message: 'Invalid payload', error: 'Bad Request' },
      }),
    );
  });

  it('handles HttpException with object response and array message', () => {
    const exception = new HttpException(
      { message: ['name is required', 'age must be positive'] },
      HttpStatus.BAD_REQUEST,
    );
    filter.catch(exception, hostMock);

    expect(replyMock.send).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'name is required, age must be positive',
      }),
    );
  });

  it('handles HttpException with object response having no message field', () => {
    const exception = new HttpException(
      { detail: 'custom object' },
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
    filter.catch(exception, hostMock);

    expect(replyMock.send).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
        error: { detail: 'custom object' },
      }),
    );
  });

  it('handles generic Error (500)', () => {
    const exception = new Error('Database connection failed');
    filter.catch(exception, hostMock);

    expect(loggerMock.error).toHaveBeenCalled();
    expect(replyMock.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(replyMock.send).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Database connection failed',
        error: 'Error',
      }),
    );
  });

  it('handles Fastify-style errors with statusCode property', () => {
    const exception = Object.assign(new Error('Rate limit exceeded'), { statusCode: 429 });
    filter.catch(exception, hostMock);

    expect(replyMock.status).toHaveBeenCalledWith(429);
    expect(replyMock.send).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 429,
        message: 'Rate limit exceeded',
        error: 'Error',
      }),
    );
  });

  it('handles non-error / unknown primitive exceptions', () => {
    filter.catch('string error', hostMock);

    expect(replyMock.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(replyMock.send).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Internal server error',
        error: 'UnknownError',
      }),
    );
  });

  it('destroys raw socket when headers are already sent', () => {
    replyMock.raw.headersSent = true;
    const exception = new Error('Stream failed midway');
    filter.catch(exception, hostMock);

    expect(replyMock.send).not.toHaveBeenCalled();
    expect(replyMock.raw.destroy).toHaveBeenCalledWith(exception);
  });

  it('destroys raw socket with fallback error if headersSent and non-Error thrown', () => {
    replyMock.raw.headersSent = true;
    filter.catch('string crash', hostMock);

    expect(replyMock.send).not.toHaveBeenCalled();
    expect(replyMock.raw.destroy).toHaveBeenCalledWith(expect.any(Error));
  });

  it('handles Fastify-style errors with non-numeric statusCode property by falling back to 500', () => {
    const exception = Object.assign(new Error('Something broke'), { statusCode: 'invalid_code' });
    filter.catch(exception, hostMock);

    expect(replyMock.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(replyMock.send).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Something broke',
      }),
    );
  });

  it('handles HttpException with non-string and non-array message in response object', () => {
    const exception = new HttpException({ message: 12345 } as any, HttpStatus.BAD_REQUEST);
    filter.catch(exception, hostMock);

    expect(replyMock.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
  });

  it('does not destroy socket if already destroyed when headersSent', () => {
    replyMock.sent = true;
    replyMock.raw.destroyed = true;
    filter.catch(new Error('crash'), hostMock);

    expect(replyMock.raw.destroy).not.toHaveBeenCalled();
  });
});
