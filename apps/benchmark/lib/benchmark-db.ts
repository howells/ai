import { createResilientSql } from "@howells/neon/http";
import type { NeonQueryFunction } from "@neondatabase/serverless";
import { getBenchmarkPolicy } from "./benchmark-policy";

export type BenchmarkSql = NeonQueryFunction<false, false>;

let sql: BenchmarkSql | undefined;

/** Return the mandatory hosted benchmark database client. */
export function getBenchmarkSql(): BenchmarkSql {
  sql ??= createResilientSql(getBenchmarkPolicy().databaseUrl);
  return sql;
}
