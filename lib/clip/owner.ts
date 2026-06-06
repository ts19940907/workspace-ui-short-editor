/** 単一ユーザー運用時の既定オーナー ID（Google ログイン不要） */
export const DEFAULT_CLIP_OWNER_USER_ID = "clip-owner";

export function getOwnerUserId(): string {
  return process.env.CLIP_OWNER_USER_ID ?? DEFAULT_CLIP_OWNER_USER_ID;
}
