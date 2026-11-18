import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  Logger,
  type NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { type Observable, tap } from 'rxjs';

/**
 * Logs one line per request: method, path, status, latency and caller id.
 * Request bodies, headers and query strings are deliberately never logged,
 * which keeps credentials, tokens and PII out of log storage.
 */
@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const startedAt = performance.now();

    const log = (status: number) => {
      const ms = (performance.now() - startedAt).toFixed(1);
      const user = request.user?.id ?? 'anonymous';
      this.logger.log(`${request.method} ${request.path} ${status} ${ms}ms user=${user}`);
    };

    return next.handle().pipe(
      tap({
        next: () => log(http.getResponse<Response>().statusCode),
        error: (err: { status?: number }) => log(err.status ?? 500),
      }),
    );
  }
}
