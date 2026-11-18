import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { configureApp, setupSwagger } from './app.setup.js';
import { AppConfigService } from './config/app-config.service.js';
import { NodeEnv } from './config/env.validation.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  const config = app.get(AppConfigService);

  configureApp(app);
  if (config.get('NODE_ENV') !== NodeEnv.Production) setupSwagger(app);

  const port = config.get('PORT');
  await app.listen(port);
  Logger.log(`Listening on http://localhost:${port} (docs at /docs)`, 'Bootstrap');
}

await bootstrap();
