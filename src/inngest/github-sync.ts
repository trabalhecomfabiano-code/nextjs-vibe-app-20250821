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
        
        // Instalar Git e configurar
        console.log("🔄 Instalando Git...");
        const installGit = await sandbox.commands.run('sudo apt-get update && sudo apt-get install -y git');
        if (installGit.exitCode !== 0) {
          throw new Error(`Git installation failed: ${installGit.stderr}`);
        }
        
        console.log("⚙️ Configurando Git globalmente...");
        await sandbox.commands.run('git config --global user.name "backup_admin"');
        await sandbox.commands.run('git config --global user.email "admin@lasy.ai"');
        
        // Verificar se o repositório já existe no GitHub
        console.log("🔍 Verificando se repositório já existe no GitHub...");
        let repoExists = false;
        try {
          const repoCheckResponse = await fetch(`https://api.github.com/repos/backup_admin/${repoName}`, {
            headers: {
              'Authorization': `token ${process.env.GITHUB_TOKEN}`,
            },
          });
          repoExists = repoCheckResponse.status === 200;
          console.log(`Repositório ${repoExists ? 'já existe' : 'não existe'} no GitHub`);
        } catch (checkError) {
          console.log("Erro ao verificar repositório, assumindo que não existe");
        }

        // Limpar qualquer estado Git local anterior
        console.log("🗑️ Limpando repositório Git local anterior...");
        await sandbox.commands.run('rm -rf .git');

        if (repoExists) {
          // Clonar repositório existente para preservar histórico
          console.log("📥 Clonando repositório existente para preservar histórico...");
          const gitClone = await sandbox.commands.run(`git clone ${repoUrl} temp-repo`, { timeoutMs: 300000 });
          if (gitClone.exitCode !== 0) {
            throw new Error(`Git clone failed: ${gitClone.stderr}`);
          }

          // Mover .git do repositório clonado para o diretório atual
          await sandbox.commands.run('mv temp-repo/.git .');
          await sandbox.commands.run('rm -rf temp-repo');
          
          // Resetar working directory para match com o estado atual do sandbox
          console.log("🔄 Sincronizando estado do repositório...");
          await sandbox.commands.run('git reset --hard HEAD');
        } else {
          // Criar novo repositório no GitHub
          console.log("🆕 Criando novo repositório no GitHub...");
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
            
            if (response.status !== 201) {
              throw new Error(`Failed to create repository: ${response.status}`);
            }
          } catch (createError) {
            throw new Error(`Repository creation failed: ${createError.message}`);
          }

          // Inicializar novo repositório Git
          console.log("🎯 Inicializando novo repositório Git...");
          const gitInit = await sandbox.commands.run('git init');
          if (gitInit.exitCode !== 0) {
            throw new Error(`Git init failed: ${gitInit.stderr}`);
          }
        }
        
        // Reconfigurar Git LOCAL 
        console.log("⚙️ Configurando Git local...");
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
        
        // Verificar se há mudanças para commitar
        console.log("📊 Verificando se há mudanças para commitar...");
        const gitStatus = await sandbox.commands.run('git status --porcelain');
        const hasChanges = gitStatus.stdout.trim().length > 0;
        
        if (!hasChanges) {
          console.log("ℹ️ Nenhuma mudança detectada, obtendo commit atual...");
          const getCommitSha = await sandbox.commands.run('git rev-parse HEAD');
          const commitSha = getCommitSha.stdout.trim();
          
          if (commitSha) {
            console.log(`💾 Usando commit SHA existente: ${commitSha}`);
            // Atualizar fragment com commitSha
            await prisma.fragment.updateMany({
              where: {
                repositoryName: repoName,
                commitSha: null,
              },
              data: {
                commitSha: commitSha,
              },
            });
          }
          
          return {
            success: true,
            repoUrl: `https://github.com/backup_admin/${repoName}`,
            action: "no-changes",
            projectId: validatedData.projectId,
            filesCount: Object.keys(validatedData.files).length,
            commitSha: commitSha,
          };
        }

        console.log("💾 Fazendo commit das mudanças...");
        const gitCommit = await sandbox.commands.run(`git commit -m "Auto-sync from Vibe Sandbox - $(date)"`);
        if (gitCommit.exitCode !== 0) {
          console.warn("Commit falhou, possível problema de configuração:", gitCommit.stderr);
          // Reconfigurar Git se necessário e tentar novamente
          await sandbox.commands.run('git config user.name "backup_admin"');
          await sandbox.commands.run('git config user.email "admin@lasy.ai"');
          const retryCommit = await sandbox.commands.run(`git commit -m "Auto-sync from Vibe Sandbox - $(date)"`);
          if (retryCommit.exitCode !== 0) {
            throw new Error(`Commit falhou definitivamente: ${retryCommit.stderr}`);
          }
        }
        
        console.log("🔗 Configurando remote origin...");
        await sandbox.commands.run(`git remote add origin ${repoUrl} || git remote set-url origin ${repoUrl}`);
        
        console.log("📤 Fazendo push...");
        // Para repos existentes, fazer push normal (não forçado) para preservar histórico
        const pushCommand = repoExists ? 
          'git push -u origin master' : 
          'git push -u origin master --force';
        
        const gitPush = await sandbox.commands.run(pushCommand, { timeoutMs: 300000 });
        if (gitPush.exitCode !== 0) {
          console.warn("Push with -u failed, trying without:", gitPush.stderr);
          const retryPushCommand = repoExists ? 
            'git push origin master' : 
            'git push origin master --force';
          const gitPushRetry = await sandbox.commands.run(retryPushCommand, { timeoutMs: 300000 });
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