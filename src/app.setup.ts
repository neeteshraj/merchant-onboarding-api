import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js';
import { RequestLoggingInterceptor } from './common/interceptors/request-logging.interceptor.js';

/**
 * Applies global HTTP concerns. Shared by `main.ts` and the e2e test harness
 * so tests exercise exactly the production pipeline.
 */
export function configureApp(app: INestApplication): void {
  app.use(helmet());
  app.enableShutdownHooks();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new RequestLoggingInterceptor());
}

export function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('Merchant Onboarding API')
    .setDescription('Merchant application lifecycle with asynchronous risk review')
    .setVersion('1.0.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, config));
}
