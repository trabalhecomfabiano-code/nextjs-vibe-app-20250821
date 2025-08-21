import { z } from "zod";
import { Sandbox } from "@e2b/code-interpreter";
import { inngest } from "./client";
import { prisma } from "@/lib/db";
import { SANDBOX_TIMEOUT } from "./types";

const restoreCommitEventSchema = z.object({
  projectId: z.string(),
  fragmentId: z.string(),
});

export const restoreCommitFunction = inngest.createFunction(
  { id: "restore-commit" },
  { event: "restore-commit/project" },
  async ({ event, step }) => {
    // Validate event data
    const validatedData = restoreCommitEventSchema.parse(event.data);
    
    const result = await step.run("restore-commit-to-sandbox", async () => {
      try {
        // 1. Buscar fragment e dados necessários
        console.log("🔍 Buscando fragment...");
        const fragment = await prisma.fragment.findUnique({
          where: { id: validatedData.fragmentId },
          include: { message: true },
        });

        if (!fragment) {
          throw new Error(`Fragment ${validatedData.fragmentId} not found`);
        }

        if (!fragment.commitSha) {
          throw new Error("Fragment não possui commitSha para restauração");
        }

        if (!fragment.repositoryName) {
          throw new Error("Fragment não possui repositoryName");
        }

        // 2. Criar novo sandbox E2B
        console.log("🚀 Criando novo sandbox...");
        const newSandbox = await Sandbox.create("lasy-nextjs-test-2");
        await newSandbox.setTimeout(SANDBOX_TIMEOUT);
        
        const repoUrl = `https://${process.env.GITHUB_TOKEN}@github.com/backup_admin/${fragment.repositoryName}.git`;

        // 3. Instalar Git
        console.log("🔄 Instalando Git...");
        const installGit = await newSandbox.commands.run('sudo apt-get update && sudo apt-get install -y git');
        if (installGit.exitCode !== 0) {
          throw new Error(`Git installation failed: ${installGit.stderr}`);
        }

        // 4. Clonar repositório GitHub
        console.log(`📥 Clonando repositório ${fragment.repositoryName}...`);
        const gitClone = await newSandbox.commands.run(`git clone ${repoUrl} .`, { timeoutMs: 300000 });
        if (gitClone.exitCode !== 0) {
          throw new Error(`Git clone failed: ${gitClone.stderr}`);
        }

        // 5. Checkout commit específico
        console.log(`🔄 Fazendo checkout do commit ${fragment.commitSha}...`);
        const gitCheckout = await newSandbox.commands.run(`git checkout ${fragment.commitSha}`, { timeoutMs: 120000 });
        if (gitCheckout.exitCode !== 0) {
          throw new Error(`Git checkout failed: ${gitCheckout.stderr}`);
        }

        // 6. Instalar dependências
        console.log("📦 Instalando dependências...");
        const npmInstall = await newSandbox.commands.run('npm install', { timeoutMs: 300000 }); // 5 minutos
        if (npmInstall.exitCode !== 0) {
          console.warn("NPM install failed, continuando sem dependências...", npmInstall.stderr);
        }

        // 7. Iniciar dev server em background
        console.log("🚀 Iniciando servidor de desenvolvimento...");
        await newSandbox.commands.run('nohup npm run dev > /dev/null 2>&1 &');
        
        // Aguardar servidor iniciar e verificar se está rodando
        console.log("⏳ Aguardando servidor inicializar...");
        await new Promise(resolve => setTimeout(resolve, 5000)); // Aumentado para 5s
        
        // Verificar se servidor está respondendo
        try {
          await newSandbox.commands.run('curl -f http://localhost:3000 > /dev/null || echo "Server may not be ready yet"');
        } catch {
          console.warn("Server health check failed, mas continuando...");
        }

        // 8. Obter nova sandboxUrl
        const newSandboxUrl = `https://${newSandbox.getHost(3000)}`;
        
        console.log(`✅ Restauração concluída: ${newSandboxUrl}`);

        return {
          success: true,
          newSandboxUrl,
          newSandboxId: newSandbox.sandboxId,
          originalFragment: {
            id: fragment.id,
            title: fragment.title,
            commitSha: fragment.commitSha,
            repositoryName: fragment.repositoryName,
          },
          projectId: validatedData.projectId,
        };

      } catch (error) {
        console.error("Restore commit failed:", error);
        
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
          projectId: validatedData.projectId,
          fragmentId: validatedData.fragmentId,
        };
      }
    });

    return result;
  },
);