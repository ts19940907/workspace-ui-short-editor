/** Neon（PostgreSQL）への保存が利用可能か。 */
export function isCloudEnabled(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

/** Vercel Blob への動画アップロードが利用可能か。 */
export function isBlobStorageEnabled(): boolean {
  // ローカル開発（next dev）では read-write トークンが必要
  if (process.env.BLOB_READ_WRITE_TOKEN) return true;
  // Vercel 本番 / Preview のみ OIDC（`vercel env pull` の OIDC はローカルでは使えない）
  if (process.env.BLOB_STORE_ID && process.env.VERCEL) return true;
  return false;
}
