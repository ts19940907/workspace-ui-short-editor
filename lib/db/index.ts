import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";

import { isCloudEnabled } from "@/lib/cloud/config";
import * as schema from "@/lib/db/schema";

function createDb() {
  if (!isCloudEnabled()) {
    throw new Error(
      "TURSO_DATABASE_URL / TURSO_AUTH_TOKEN が未設定のため DB に接続できません",
    );
  }
  const client = createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN!,
  });
  return drizzle(client, { schema });
}

/** Turso 有効時のみ利用する Drizzle インスタンス。 */
export function getDb() {
  return createDb();
}

export type Db = ReturnType<typeof createDb>;
