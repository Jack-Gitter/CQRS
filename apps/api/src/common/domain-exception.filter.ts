import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Response } from 'express';
import { QueryFailedError } from 'typeorm';
import { DomainError } from '../airplane/domain/domain-errors';

/**
 * Translates domain invariant violations into HTTP responses so the aggregate
 * never has to know about HTTP.
 */
@Catch()
export class DomainExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(DomainExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();

    if (exception instanceof DomainError) {
      res.status(exception.httpStatus).json({
        statusCode: exception.httpStatus,
        error: exception.code,
        message: exception.message,
      });
      return;
    }

    if (exception instanceof HttpException) {
      res.status(exception.getStatus()).json(exception.getResponse());
      return;
    }

    if (exception instanceof QueryFailedError) {
      const code = (exception as QueryFailedError & { driverError?: { code?: string } }).driverError?.code;
      if (code === '55P03') {
        // lock_not_available: another command holds the pessimistic lock longer than lock_timeout
        res.status(HttpStatus.CONFLICT).json({
          statusCode: HttpStatus.CONFLICT,
          error: 'AGGREGATE_LOCKED',
          message: 'The airplane is being modified by another request; retry shortly.',
        });
        return;
      }
      if (code === '23505') {
        res.status(HttpStatus.CONFLICT).json({
          statusCode: HttpStatus.CONFLICT,
          error: 'UNIQUE_VIOLATION',
          message: (exception as Error).message,
        });
        return;
      }
    }

    this.logger.error('Unhandled exception', exception instanceof Error ? exception.stack : String(exception));
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: 'INTERNAL_ERROR',
      message: 'Unexpected error',
    });
  }
}
