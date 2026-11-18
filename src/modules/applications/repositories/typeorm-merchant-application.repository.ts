import { Injectable } from '@nestjs/common';
import type { FindOptionsWhere } from 'typeorm';
import { TypeOrmRepository } from '../../../database/typeorm.repository.js';
import { MerchantApplication } from '../entities/merchant-application.entity.js';
import {
  type ApplicationPageQuery,
  type ApplicationScope,
  type FindApplicationOptions,
  MerchantApplicationRepository,
  type NewMerchantApplication,
} from './merchant-application.repository.js';

@Injectable()
export class TypeOrmMerchantApplicationRepository
  extends TypeOrmRepository<MerchantApplication>
  implements MerchantApplicationRepository
{
  protected readonly entity = MerchantApplication;

  create(data: NewMerchantApplication): Promise<MerchantApplication> {
    return this.repository.save(this.repository.create(data));
  }

  findById(id: string, options: FindApplicationOptions = {}): Promise<MerchantApplication | null> {
    return this.repository.findOne({
      where: { ...this.toWhere(options.scope), id },
      ...(options.lock && { lock: { mode: 'pessimistic_write' } }),
    });
  }

  async findPage(
    query: ApplicationPageQuery,
  ): Promise<{ items: MerchantApplication[]; total: number }> {
    const [items, total] = await this.repository.findAndCount({
      where: { ...this.toWhere(query.scope), ...(query.status && { status: query.status }) },
      order: { createdAt: 'DESC', id: 'DESC' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    });
    return { items, total };
  }

  save(application: MerchantApplication): Promise<MerchantApplication> {
    return this.repository.save(application);
  }

  private toWhere(scope: ApplicationScope = {}): FindOptionsWhere<MerchantApplication> {
    const where: FindOptionsWhere<MerchantApplication> = {};
    if (scope.createdById) where.createdById = scope.createdById;
    if (scope.assignedReviewerId) where.assignedReviewerId = scope.assignedReviewerId;
    return where;
  }
}
