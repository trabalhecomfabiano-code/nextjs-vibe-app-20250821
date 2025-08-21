import { z } from "zod";
import { inngest } from "./client";
import { createOrUpdateRepository, type GitHubSyncData } from "@/lib/github";

const githubSyncEventSchema = z.object({
  projectId: z.string(),
  files: z.record(z.string()),
  sandboxUrl: z.string(),
  title: z.string(),
});

export const githubSyncFunction = inngest.createFunction(
  { id: "github-sync" },
  { event: "github-sync/project" },
  async ({ event, step }) => {
    // Validate event data
    const validatedData = githubSyncEventSchema.parse(event.data);
    
    const result = await step.run("sync-to-github", async () => {
      try {
        const syncData: GitHubSyncData = {
          projectId: validatedData.projectId,
          files: validatedData.files,
          sandboxUrl: validatedData.sandboxUrl,
          title: validatedData.title,
        };

        const result = await createOrUpdateRepository(syncData);
        
        return {
          success: true,
          repoUrl: result.repoUrl,
          action: result.action,
          projectId: validatedData.projectId,
          filesCount: Object.keys(validatedData.files).length,
        };
      } catch (error) {
        console.error("GitHub sync failed:", error);
        
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
          projectId: validatedData.projectId,
          filesCount: Object.keys(validatedData.files).length,
        };
      }
    });

    return result;
  },
);