import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

/** Respons error seragam: { status: "error", statusCode, message, path }. */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('HttpException');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const body =
      exception instanceof HttpException ? exception.getResponse() : 'Terjadi kesalahan tak terduga';

    if (status >= 500) this.logger.error(JSON.stringify(body), (exception as Error)?.stack);

    response.status(status).json({
      status: 'error',
      statusCode: status,
      ...(typeof body === 'string' ? { message: body } : body),
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }
}
