import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

import { isCloudEnabled } from "@/lib/cloud/config";
import * as schema from "@/lib/db/schema";

function createDb() {
  if (!isCloudEnabled()) {
    throw new Error(
      "DATABASE_URL が未設定のため DB に接続できません",
    );
  }
  const sql = neon(process.env.DATABASE_URL!);
  return drizzle(sql, { schema });
}

/** Neon 有効時のみ利用する Drizzle インスタンス。 */
export function getDb() {
  return createDb();
}

export type Db = ReturnType<typeof createDb>;
