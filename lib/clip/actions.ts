"use server";

import { revalidatePath } from "next/cache";

import type { ClipProject } from "@/lib/clip-schema";
import { clipProjectSchema } from "@/lib/clip-schema";
import { isCloudEnabled } from "@/lib/cloud/config";
import {
  createProjectForUser,
  listProjectsByUserId,
  updateProjectForUser,
} from "@/lib/clip/db/projects";
import { ensureOwnerUser } from "@/lib/db/ensure-owner";

async function requireOwnerUserId(): Promise<string> {
  if (!isCloudEnabled()) {
    throw new Error("Turso が有効化されていません");
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
