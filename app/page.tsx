import { ClipWorkspace } from "@/components/workspace/ClipWorkspace";
import projectsData from "@/data/clip-projects.json";
import workspaceData from "@/data/workspace-clip.json";
import { clipProjectsSchema } from "@/lib/clip-schema";
import { normalizeClipProject } from "@/lib/clip/selection";
import { listProjectsByUserId } from "@/lib/clip/db/projects";
import { ensureOwnerUser } from "@/lib/db/ensure-owner";
import { isBlobStorageEnabled, isCloudEnabled } from "@/lib/cloud/config";
import { z } from "zod";

const workspaceClipSchema = z.object({
  name: z.string(),
});

export default async function Page() {
  const wsResult = workspaceClipSchema.safeParse(workspaceData);
  if (!wsResult.success) {
    throw new Error(
      `workspace-clip.json: ${wsResult.error.issues[0]?.message}`,
    );
  }

  const workspaceName = wsResult.data.name;
  const cloudEnabled = isCloudEnabled();
  const blobUploadEnabled = isBlobStorageEnabled();

  if (cloudEnabled) {
    const userId = await ensureOwnerUser();
    const projects = await listProjectsByUserId(userId);

    return (
      <ClipWorkspace
        workspaceName={workspaceName}
        initialSavedProjects={projects}
        cloudEnabled
        blobUploadEnabled={blobUploadEnabled}
      />
    );
  }

  const projectsResult = clipProjectsSchema.safeParse(projectsData);
  if (!projectsResult.success) {
    throw new Error(
      `clip-projects.json: ${projectsResult.error.issues[0]?.message}`,
    );
  }

  return (
    <ClipWorkspace
      workspaceName={workspaceName}
      initialSavedProjects={projectsResult.data.map((p) =>
        normalizeClipProject(p),
      )}
      cloudEnabled={false}
    />
  );
}
