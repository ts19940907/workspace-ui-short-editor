import { eq } from "drizzle-orm";

import { getOwnerUserId } from "@/lib/clip/owner";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";

/** 単一オーナー行を保証し、userId を返す（ログイン不要） */
export async function ensureOwnerUser(): Promise<string> {
  const userId = getOwnerUserId();
  const db = getDb();
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (existing.length === 0) {
    await db.insert(users).values({
      id: userId,
      email: `${userId}@local`,
      name: "オーナー",
    });
  }

  return userId;
}
