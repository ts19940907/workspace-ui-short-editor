/** Turso（libSQL）への保存が利用可能か。 */
export function isCloudEnabled(): boolean {
  return Boolean(
    process.env.TURSO_DATABASE_URL && process.env.TURSO_AUTH_TOKEN,
  );
}

/** Vercel Blob への動画アップロードが利用可能か。 */
export function isBlobStorageEnabled(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}
