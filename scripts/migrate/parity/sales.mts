// Reads compared by `npx tsx scripts/migrate/parity.mts sales`.
import type { ParityRead } from "../parity.mts";
import { fetchSales } from "../../../lib/data/sales";

export const AREA = "SALES";

export const reads: ParityRead[] = [{ name: "fetchSales", run: () => fetchSales() }];
