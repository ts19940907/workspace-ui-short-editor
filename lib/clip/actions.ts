"use server";

import { del } from "@vercel/blob";
import { revalidatePath } from "next/cache";

import type { ClipProject } from "@/lib/clip-schema";
import { clipProjectSchema } from "@/lib/clip-schema";
import { isBlobStorageEnabled, isCloudEnabled } from "@/lib/cloud/config";
import {
  createProjectForUser,
  deleteProjectForUser,
  listProjectsByUserId,
  updateProjectForUser,
} from "@/lib/clip/db/projects";
import { ensureOwnerUser } from "@/lib/db/ensure-owner";

async function requireOwnerUserId(): Promise<string> {
  if (!isCloudEnabled()) {
    throw new Error("DATABASE_URL が設定されていません");
  }
  return ensureOwnerUser();
}

export async function listProjectsAction(): Promise<ClipProject[]> {
  const userId = await requireOwnerUserId();
  return listProjectsByUserId(userId);
}

export async function createProjectAction(title?: string): Promise<ClipProject> {
  const userId = await requireOwnerUserId();
  const project = await createProjectForUser(
    userId,
    title ?? `新規プロジェクト`,
  );
  revalidatePath("/");
  return project;
}

export async function saveProjectAction(
  projectInput: ClipProject,
): Promise<ClipProject> {
  const userId = await requireOwnerUserId();
  const parsed = clipProjectSchema.safeParse(projectInput);
  if (!parsed.success) {
    throw new Error("プロジェクトデータが不正です");
  }
  const saved = await updateProjectForUser(userId, parsed.data);
  if (!saved) {
    throw new Error("プロジェクトの保存に失敗しました");
  }
  revalidatePath("/");
  return saved;
}

/** 既存プロジェクトの内容を Neon に上書き保存する。 */
export async function updateProjectAction(
  projectInput: ClipProject,
): Promise<ClipProject> {
  return saveProjectAction(projectInput);
}

export async function deleteProjectAction(projectId: string): Promise<void> {
  const userId = await requireOwnerUserId();
  const deleted = await deleteProjectForUser(userId, projectId);
  if (!deleted) {
    throw new Error("プロジェクトの削除に失敗しました");
  }

  if (isBlobStorageEnabled() && deleted.videoBlobUrl) {
    try {
      await del(deleted.videoBlobUrl);
    } catch {
      // Blob 削除失敗は DB 削除成功を優先する
    }
  }

  revalidatePath("/");
}
