import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppConfigService } from '../config/app-config.service.js';
import { TransactionRunner } from './transaction-runner.js';
import { TypeOrmTransactionRunner } from './typeorm-transaction-runner.js';
import { buildDataSourceOptions } from './typeorm.options.js';

/** Owns the Postgres connection and exposes transaction handling to feature modules. */
@Global()
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        ...buildDataSourceOptions({
          host: config.get('DB_HOST'),
          port: config.get('DB_PORT'),
          username: config.get('DB_USER'),
          password: config.get('DB_PASSWORD'),
          database: config.get('DB_NAME'),
        }),
        migrationsRun: true,
      }),
    }),
  ],
  providers: [
    TypeOrmTransactionRunner,
    { provide: TransactionRunner, useExisting: TypeOrmTransactionRunner },
  ],
  exports: [TypeOrmTransactionRunner, TransactionRunner],
})
export class DatabaseModule {}
