import { Module } from '@nestjs/common';
import { MerchantApplicationRepository } from './repositories/merchant-application.repository.js';
import { TypeOrmMerchantApplicationRepository } from './repositories/typeorm-merchant-application.repository.js';

/**
 * Exposes application persistence separately from the HTTP-facing
 * {@link ApplicationsModule}, so the risk worker can update applications
 * without a circular module dependency.
 */
@Module({
  providers: [
    { provide: MerchantApplicationRepository, useClass: TypeOrmMerchantApplicationRepository },
  ],
  exports: [MerchantApplicationRepository],
})
export class ApplicationPersistenceModule {}
