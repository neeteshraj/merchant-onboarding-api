import { ConfigService } from '@nestjs/config';
import { AppConfigService } from '../../src/config/app-config.service.js';
import type { EnvironmentVariables } from '../../src/config/env.validation.js';

/** Real {@link AppConfigService} backed by an in-memory set of typed values. */
export function testConfig(values: Partial<EnvironmentVariables>): AppConfigService {
  return new AppConfigService(new ConfigService<EnvironmentVariables, true>(values));
}
