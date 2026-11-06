import type { Zcql } from './catalyst-store.js';

/** The slice of the Catalyst SDK's `zcql()` this adapter uses. */
interface CatalystZcql { executeZCQLQuery(query: string): Promise<unknown> }

/**
 * Wraps `catalystApp.zcql()` (use the admin scope: App Users are read-only by default). ZCQL
 * answers each row under its table's name, `[{ hs_entity: {...} }]`; the store wants the row.
 * Statements that return nothing (INSERT, UPDATE, DELETE) come back as whatever the SDK gives.
 */
export function catalystZcql(zcql: CatalystZcql): Zcql {
  return {
    async query(sql) {
      const out = await zcql.executeZCQLQuery(sql);
      if (!Array.isArray(out) || !/^\s*select/i.test(sql)) return [];
      return out.map((r) => {
        const only = r && typeof r === 'object' ? Object.values(r as Record<string, unknown>) : [];
        return (only.length === 1 && only[0] && typeof only[0] === 'object' ? only[0] : r) as Record<string, unknown>;
      });
    },
  };
}
