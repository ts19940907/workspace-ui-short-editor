/** Neon（PostgreSQL）への保存が利用可能か。 */
export function isCloudEnabled(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

/** Vercel Blob への動画アップロードが利用可能か。 */
export function isBlobStorageEnabled(): boolean {
  if (process.env.BLOB_READ_WRITE_TOKEN) return true;
  // Vercel Storage 連携（OIDC）: BLOB_STORE_ID + VERCEL_OIDC_TOKEN
  if (process.env.BLOB_STORE_ID && process.env.VERCEL_OIDC_TOKEN) return true;
  // Vercel 本番では OIDC トークンが実行時に注入される
  if (process.env.BLOB_STORE_ID && process.env.VERCEL) return true;
  return false;
}
