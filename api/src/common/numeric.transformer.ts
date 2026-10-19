import { ValueTransformer } from 'typeorm';

/** Postgres returns numeric/bigint as strings; expose them as JS numbers. */
export const NumericTransformer: ValueTransformer = {
  to: (value: number | null | undefined) => value,
  from: (value: string | null) => (value === null || value === undefined ? value : Number(value)),
};
