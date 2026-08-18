import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Inject,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import type { FastifyReply, FastifyRequest } from 'fastify';

/**
 * Catches everything that reaches the framework and renders one response shape.
 *
 * Without it, a Nest `HttpException`, a Fastify plugin error and an unexpected `Error` each
 * reach the caller in a different format, and consumers end up parsing three of them.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(@Inject(PinoLogger) private readonly logger: PinoLogger) {
    logger.setContext(AllExceptionsFilter.name);
  }

  public catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<FastifyReply>();
    const request = ctx.getRequest<FastifyRequest>();

    const status = this.resolveStatus(exception);
    const message = this.extractMessage(exception);
    const errorResponse = this.buildErrorResponse(exception);

    if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.url} - ${status} - ${message}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    } else {
      this.logger.warn(`${request.method} ${request.url} - ${status} - ${message}`);
    }

    // Once the response has started there is no way to replace it with JSON. Destroying the
    // socket is what tells the client the body it received is incomplete; sending anything
    // else would append garbage to a half-written payload.
    if (response.raw.headersSent || response.sent) {
      this.logger.warn('Headers already sent, cannot send error response to client');
      if (!response.raw.destroyed) {
        response.raw.destroy(exception instanceof Error ? exception : new Error(message));
      }
      return;
    }

    void response.status(status).type('application/json').send({
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
      message,
      error: errorResponse,
    });
  }

  /**
   * Resolves the status code to answer with.
   *
   * Errors raised by Fastify plugins are plain objects carrying `statusCode`, not
   * `HttpException`s, so that field is honoured before falling back to 500.
   *
   * @param exception - The caught value.
   * @returns The HTTP status to send.
   */
  private resolveStatus(exception: unknown): number {
    if (exception instanceof HttpException) {
      return exception.getStatus();
    }

    if (typeof exception === 'object' && exception !== null && 'statusCode' in exception) {
      const { statusCode } = exception;
      if (typeof statusCode === 'number') {
        return statusCode;
      }
    }

    return HttpStatus.INTERNAL_SERVER_ERROR;
  }

  /**
   * Extracts a single human-readable message from anything that was thrown.
   *
   * @param exception - The caught value.
   * @returns The message to report.
   */
  private extractMessage(exception: unknown): string {
    if (exception instanceof HttpException) {
      const response = exception.getResponse();
      if (typeof response === 'string') {
        return response;
      }
      if (typeof response === 'object' && 'message' in response) {
        const msg = response.message;
        if (Array.isArray(msg)) {
          return msg.join(', ');
        }
        if (typeof msg === 'string') {
          return msg;
        }
      }
      return exception.message;
    }

    if (exception instanceof Error) {
      return exception.message;
    }

    return 'Internal server error';
  }

  /**
   * Builds the `error` field: the framework's own payload when there is one, its name otherwise.
   *
   * @param exception - The caught value.
   * @returns Value for the `error` field.
   */
  private buildErrorResponse(exception: unknown): string | object | undefined {
    if (exception instanceof HttpException) {
      const response = exception.getResponse();
      return typeof response === 'object' ? response : exception.name;
    }

    if (exception instanceof Error) {
      return exception.name;
    }

    return 'UnknownError';
  }
}
