import { z } from "zod";
import { Sandbox } from "@e2b/code-interpreter";
import { inngest } from "./client";

const githubSyncEventSchema = z.object({
  projectId: z.string(),
  files: z.record(z.string()),
  sandboxUrl: z.string(),
  title: z.string(),
});

function extractSandboxId(sandboxUrl: string): string | null {
  const match = sandboxUrl.match(/https:\/\/3000-([a-zA-Z0-9]+-[a-zA-Z0-9]+)\.e2b\.app/);
  return match ? match[1] : null;
}

export const githubSyncFunction = inngest.createFunction(
  { id: "github-sync" },
  { event: "github-sync/project" },
  async ({ event, step }) => {
    // Validate event data
    const validatedData = githubSyncEventSchema.parse(event.data);
    
    const result = await step.run("sync-to-github", async () => {
      try {
        // Extrair sandbox ID da URL
        const sandboxId = extractSandboxId(validatedData.sandboxUrl);
        if (!sandboxId) {
          throw new Error("Could not extract sandbox ID from URL");
        }

        // Conectar ao sandbox
        const sandbox = await Sandbox.connect(sandboxId);
        await sandbox.setTimeout(300000); // 5 minutos timeout
        const repoName = `project-${validatedData.projectId}`;
        const repoUrl = `https://${process.env.GITHUB_TOKEN}@github.com/backup_admin/${repoName}.git`;
        
        // Criar repositório no GitHub primeiro
        try {
          const response = await fetch('https://api.github.com/user/repos', {
            method: 'POST',
            headers: {
              'Authorization': `token ${process.env.GITHUB_TOKEN}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              name: repoName,
              description: "Auto-generated Vibe Project",
              private: true,
            }),
          });
          
          if (response.status === 422) {
            console.log("Repositório já existe, atualizando...");
          }
        } catch (createError) {
          console.error("Erro ao criar repositório:", createError);
        }
        
        // Instalar Git e configurar
        console.log("🔄 Instalando Git...");
        const installGit = await sandbox.commands.run('sudo apt-get update && sudo apt-get install -y git');
        if (installGit.exitCode !== 0) {
          throw new Error(`Git installation failed: ${installGit.stderr}`);
        }
        
        // Comandos Git no sandbox
        console.log("🧹 Limpando locks do Git...");
        await sandbox.commands.run('rm -f .git/index.lock .git/refs/heads/master.lock');
        
        console.log("⚙️ Configurando Git...");
        const configName = await sandbox.commands.run('git config --global user.name "backup_admin"');
        const configEmail = await sandbox.commands.run('git config --global user.email "admin@lasy.ai"');
        
        console.log("🎯 Inicializando repositório Git...");
        const gitInit = await sandbox.commands.run('git init');
        if (gitInit.exitCode !== 0) {
          throw new Error(`Git init failed: ${gitInit.stderr}`);
        }
        
        console.log("📄 Criando .gitignore...");
        await sandbox.commands.run('echo "node_modules/\\n.next/\\n.env*\\n*.log\\n.wh.*\\n.npm/\\n.bash*\\n.profile\\n.sudo*" > .gitignore');
        
        console.log("➕ Adicionando arquivos...");
        const gitAdd = await sandbox.commands.run('git add .');
        if (gitAdd.exitCode !== 0) {
          console.warn("Git add failed, trying specific files:", gitAdd.stderr);
          await sandbox.commands.run('git add package.json package-lock.json tsconfig.json next.config.ts components.json postcss.config.mjs README.md app/ components/ hooks/ lib/ public/ nextjs-app/ || true');
        }
        
        console.log("💾 Fazendo commit...");
        const gitCommit = await sandbox.commands.run(`git commit -m "Auto-sync from Vibe Sandbox - $(date)" || echo "No changes"`);
        
        console.log("🔗 Adicionando remote origin...");
        await sandbox.commands.run(`git remote add origin ${repoUrl} || git remote set-url origin ${repoUrl}`);
        
        console.log("📤 Fazendo push...");
        const gitPush = await sandbox.commands.run('git push -u origin master --force');
        if (gitPush.exitCode !== 0) {
          throw new Error(`Git push failed: ${gitPush.stderr}`);
        }
        
        return {
          success: true,
          repoUrl: `https://github.com/backup_admin/${repoName}`,
          action: "synced",
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