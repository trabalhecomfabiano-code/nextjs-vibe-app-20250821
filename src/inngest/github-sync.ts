import { z } from "zod";
import { Sandbox } from "@e2b/code-interpreter";
import { inngest } from "./client";
import { prisma } from "@/lib/db";

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
        await sandbox.commands.run('git config --global user.name "backup_admin"');
        await sandbox.commands.run('git config --global user.email "admin@lasy.ai"');
        
        console.log("🎯 Inicializando repositório Git...");
        const gitInit = await sandbox.commands.run('git init');
        if (gitInit.exitCode !== 0) {
          throw new Error(`Git init failed: ${gitInit.stderr}`);
        }
        
        // Reconfigurar Git LOCAL depois do init
        console.log("⚙️ Reconfigurando Git LOCAL...");
        await sandbox.commands.run('git config user.name "backup_admin"');
        await sandbox.commands.run('git config user.email "admin@lasy.ai"');
        
        // Criar .gitignore CORRIGIDO
        console.log("📄 Criando .gitignore CORRIGIDO...");
        const gitignoreContent = `node_modules/
.next/
.git/
.npm/
nextjs-app/
.env*
*.log
.wh.*
.bash*
.profile
.sudo*
.gitconfig`;
        
        await sandbox.commands.run(`cat > .gitignore << 'EOF'
${gitignoreContent}
EOF`);
        
        // Limpar diretórios que não devem ser commitados
        console.log("🧹 Removendo diretórios que não devem ser commitados...");
        await sandbox.commands.run('sudo rm -rf .wh.* || true');
        await sandbox.commands.run('rm -rf .npm/ || true');
        await sandbox.commands.run('rm -rf .next/ || true'); 
        await sandbox.commands.run('rm -rf nextjs-app/ || true');
        await sandbox.commands.run('rm -f .bash* .profile .sudo* .gitconfig || true');
        
        // Adicionar apenas arquivos do projeto
        console.log("➕ Adicionando apenas arquivos do projeto...");
        const gitAdd = await sandbox.commands.run('git add package.json package-lock.json tsconfig.json next.config.ts components.json postcss.config.mjs README.md app/ components/ hooks/ lib/ public/ .gitignore', { timeoutMs: 300000 });
        if (gitAdd.exitCode !== 0) {
          console.warn("Git add específico falhou, tentando git add .:", gitAdd.stderr);
          await sandbox.commands.run('git add . || git add -A || true', { timeoutMs: 300000 });
        }
        
        console.log("💾 Fazendo commit...");
        const gitCommit = await sandbox.commands.run(`git commit -m "Auto-sync from Vibe Sandbox - $(date)"`);
        if (gitCommit.exitCode !== 0) {
          console.warn("Commit falhou, possível problema de configuração:", gitCommit.stderr);
          // Reconfigurar Git se necessário e tentar novamente
          await sandbox.commands.run('git config user.name "backup_admin"');
          await sandbox.commands.run('git config user.email "admin@lasy.ai"');
          const retryCommit = await sandbox.commands.run(`git commit -m "Auto-sync from Vibe Sandbox - $(date)"`);
          if (retryCommit.exitCode !== 0) {
            console.error("Commit falhou definitivamente:", retryCommit.stderr);
          }
        }
        
        console.log("🔗 Adicionando remote origin...");
        await sandbox.commands.run(`git remote add origin ${repoUrl} || git remote set-url origin ${repoUrl}`);
        
        console.log("📤 Fazendo push...");
        const gitPush = await sandbox.commands.run('git push -u origin master --force', { timeoutMs: 300000 }); // 5 minutos
        if (gitPush.exitCode !== 0) {
          console.warn("Push with -u failed, trying without:", gitPush.stderr);
          const gitPushRetry = await sandbox.commands.run('git push origin master --force', { timeoutMs: 300000 });
          if (gitPushRetry.exitCode !== 0) {
            throw new Error(`Git push failed: ${gitPushRetry.stderr}`);
          }
        }
        
        // Obter SHA do último commit
        console.log("🔍 Obtendo SHA do commit...");
        const getCommitSha = await sandbox.commands.run('git rev-parse HEAD');
        const commitSha = getCommitSha.stdout.trim();
        
        // Atualizar fragment com commitSha
        if (commitSha) {
          console.log(`💾 Salvando commit SHA: ${commitSha}`);
          await prisma.fragment.updateMany({
            where: {
              repositoryName: repoName,
              commitSha: null, // Apenas fragments sem commitSha ainda
            },
            data: {
              commitSha: commitSha,
            },
          });
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