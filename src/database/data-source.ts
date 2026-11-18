import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { buildDataSourceOptions } from './typeorm.options.js';

/** Entry point for the TypeORM CLI (`yarn migration:run`, `yarn migration:generate`). */
export default new DataSource(
  buildDataSourceOptions({
    host: process.env.DB_HOST ?? 'localhost',
    port: Number(process.env.DB_PORT ?? 5432),
    username: process.env.DB_USER ?? '',
    password: process.env.DB_PASSWORD ?? '',
    database: process.env.DB_NAME ?? '',
  }),
);
