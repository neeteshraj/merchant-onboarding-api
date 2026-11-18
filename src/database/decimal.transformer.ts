import type { ValueTransformer } from 'typeorm';

/**
 * Postgres returns `numeric` as a string to avoid precision loss. Amounts here
 * are capped well inside IEEE-754 safe range, so converting to number is lossless.
 */
export const decimalTransformer: ValueTransformer = {
  to: (value?: number | null) => value,
  from: (value?: string | null) => (value == null ? value : Number(value)),
};
