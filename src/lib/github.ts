import { Octokit } from "@octokit/rest";

const GITHUB_USER = "backup_admin"; // É uma conta pessoal, não organização
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
    // Check if repository exists in backup_admin account
    await octokit.request('GET /repos/{owner}/{repo}', {
      owner: GITHUB_USER,
      repo: repoName,
    });
    
    // Repository exists, update it
    return await updateRepository(repoName, data, GITHUB_USER);
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'status' in error && error.status === 404) {
      // Repository doesn't exist, create it
      return await createRepository(repoName, data);
    }
    throw error;
  }
}

async function createRepository(repoName: string, data: GitHubSyncData) {
  // Create in backup_admin personal account
  const { data: repo } = await octokit.request('POST /user/repos', {
    name: repoName,
    description: "Auto-generated Vibe Project",
    private: true,
    auto_init: true,
  });

  // Wait a moment for repository to be fully created
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Add files to repository
  await commitFiles(repoName, data, GITHUB_USER);

  return {
    success: true,
    repoUrl: repo.html_url,
    action: "created",
  };
}

async function updateRepository(repoName: string, data: GitHubSyncData, owner: string) {
  // Add files to existing repository
  await commitFiles(repoName, data, owner);

  return {
    success: true,
    repoUrl: `https://github.com/${owner}/${repoName}`,
    action: "updated",
  };
}

async function commitFiles(repoName: string, data: GitHubSyncData, owner: string) {
  // Get the latest commit SHA
  const { data: ref } = await octokit.request('GET /repos/{owner}/{repo}/git/refs/{ref}', {
    owner,
    repo: repoName,
    ref: "heads/main",
  });

  const latestCommitSha = ref.object.sha;

  // Get the tree for the latest commit
  const { data: commit } = await octokit.request('GET /repos/{owner}/{repo}/git/commits/{commit_sha}', {
    owner,
    repo: repoName,
    commit_sha: latestCommitSha,
  });

  const baseTreeSha = commit.tree.sha;

  // Create blobs for each file
  const blobs = await Promise.all(
    Object.entries(data.files).map(async ([path, content]) => {
      const { data: blob } = await octokit.request('POST /repos/{owner}/{repo}/git/blobs', {
        owner,
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

  const { data: readmeBlob } = await octokit.request('POST /repos/{owner}/{repo}/git/blobs', {
    owner,
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
  const { data: tree } = await octokit.request('POST /repos/{owner}/{repo}/git/trees', {
    owner,
    repo: repoName,
    base_tree: baseTreeSha,
    tree: blobs,
  });

  // Create commit
  const commitMessage = `Auto-sync from Vibe Project - ${new Date().toISOString()}`;
  
  const { data: newCommit } = await octokit.request('POST /repos/{owner}/{repo}/git/commits', {
    owner,
    repo: repoName,
    message: commitMessage,
    tree: tree.sha,
    parents: [latestCommitSha],
  });

  // Update reference
  await octokit.request('PATCH /repos/{owner}/{repo}/git/refs/{ref}', {
    owner,
    repo: repoName,
    ref: "heads/main",
    sha: newCommit.sha,
  });

  return newCommit.sha;
}