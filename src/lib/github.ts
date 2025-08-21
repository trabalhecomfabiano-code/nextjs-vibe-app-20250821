import { Octokit } from "@octokit/rest";

const GITHUB_ORG = "backup_admin";
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

if (!GITHUB_TOKEN) {
  throw new Error("GITHUB_TOKEN environment variable is required");
}

export const octokit = new Octokit({
  auth: GITHUB_TOKEN,
});

export interface GitHubSyncData {
  projectId: string;
  files: Record<string, string>;
  sandboxUrl: string;
  title: string;
}

export async function createOrUpdateRepository(data: GitHubSyncData) {
  const repoName = `project-${data.projectId}`;
  
  try {
    // Check if repository exists
    await octokit.rest.repos.get({
      owner: GITHUB_ORG,
      repo: repoName,
    });
    
    // Repository exists, update it
    return await updateRepository(repoName, data);
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'status' in error && error.status === 404) {
      // Repository doesn't exist, create it
      return await createRepository(repoName, data);
    }
    throw error;
  }
}

async function createRepository(repoName: string, data: GitHubSyncData) {
  // Create repository
  const { data: repo } = await octokit.rest.repos.createInOrg({
    org: GITHUB_ORG,
    name: repoName,
    description: "Auto-generated Vibe Project",
    private: true,
    auto_init: true,
  });

  // Wait a moment for repository to be fully created
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Add files to repository
  await commitFiles(repoName, data);

  return {
    success: true,
    repoUrl: repo.html_url,
    action: "created",
  };
}

async function updateRepository(repoName: string, data: GitHubSyncData) {
  // Add files to existing repository
  await commitFiles(repoName, data);

  return {
    success: true,
    repoUrl: `https://github.com/${GITHUB_ORG}/${repoName}`,
    action: "updated",
  };
}

async function commitFiles(repoName: string, data: GitHubSyncData) {
  // Get the latest commit SHA
  const { data: ref } = await octokit.rest.git.getRef({
    owner: GITHUB_ORG,
    repo: repoName,
    ref: "heads/main",
  });

  const latestCommitSha = ref.object.sha;

  // Get the tree for the latest commit
  const { data: commit } = await octokit.rest.git.getCommit({
    owner: GITHUB_ORG,
    repo: repoName,
    commit_sha: latestCommitSha,
  });

  const baseTreeSha = commit.tree.sha;

  // Create blobs for each file
  const blobs = await Promise.all(
    Object.entries(data.files).map(async ([path, content]) => {
      const { data: blob } = await octokit.rest.git.createBlob({
        owner: GITHUB_ORG,
        repo: repoName,
        content,
        encoding: "utf-8",
      });
      
      return {
        path,
        mode: "100644" as const,
        type: "blob" as const,
        sha: blob.sha,
      };
    })
  );

  // Create README.md with project metadata
  const readmeContent = `# Vibe Project
  
This project was auto-generated from Vibe.

**Project ID:** ${data.projectId}
**Sandbox URL:** ${data.sandboxUrl}
**Generated:** ${new Date().toISOString()}

## Files

${Object.keys(data.files).map(file => `- ${file}`).join('\n')}
`;

  const { data: readmeBlob } = await octokit.rest.git.createBlob({
    owner: GITHUB_ORG,
    repo: repoName,
    content: readmeContent,
    encoding: "utf-8",
  });

  blobs.push({
    path: "README.md",
    mode: "100644",
    type: "blob",
    sha: readmeBlob.sha,
  });

  // Create new tree
  const { data: tree } = await octokit.rest.git.createTree({
    owner: GITHUB_ORG,
    repo: repoName,
    base_tree: baseTreeSha,
    tree: blobs,
  });

  // Create commit
  const commitMessage = `Auto-sync from Vibe Project - ${new Date().toISOString()}`;
  
  const { data: newCommit } = await octokit.rest.git.createCommit({
    owner: GITHUB_ORG,
    repo: repoName,
    message: commitMessage,
    tree: tree.sha,
    parents: [latestCommitSha],
  });

  // Update reference
  await octokit.rest.git.updateRef({
    owner: GITHUB_ORG,
    repo: repoName,
    ref: "heads/main",
    sha: newCommit.sha,
  });

  return newCommit.sha;
}