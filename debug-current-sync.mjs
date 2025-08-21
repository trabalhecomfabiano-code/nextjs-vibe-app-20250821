import { Sandbox } from "@e2b/code-interpreter";
import * as dotenv from 'dotenv';

// Carregar variáveis do .env.local
dotenv.config({ path: '.env.local' });

const SANDBOX_ID = "i0dk3x8rz09ofo4z2j1gr"; // Sandbox atual com problema
const PROJECT_ID = "06afee9e-1025-45e1-bf64-7c5083b935b7";
const REPO_NAME = `project-${PROJECT_ID}`;
const REPO_URL = `https://${process.env.GITHUB_TOKEN}@github.com/backup_admin/${REPO_NAME}.git`;

async function debugCurrentSync() {
  try {
    console.log("🔌 Conectando ao sandbox atual...");
    const sandbox = await Sandbox.connect(SANDBOX_ID);
    await sandbox.setTimeout(600000); // 10 minutos
    console.log(`✅ Conectado: ${sandbox.sandboxId}`);

    console.log("\\n📁 Verificando diretório e arquivos...");
    const pwd = await sandbox.commands.run('pwd');
    console.log("PWD:", pwd.stdout.trim());
    
    const ls = await sandbox.commands.run('ls -la');
    console.log("Arquivos no diretório:");
    console.log(ls.stdout);

    console.log("\\n🔍 Verificando se Git já está instalado...");
    const gitCheck = await sandbox.commands.run('git --version || echo "Git not installed"');
    console.log("Git check:", gitCheck.stdout);
    
    if (gitCheck.stdout.includes("not installed")) {
      console.log("\\n🔄 Instalando Git...");
      const installGit = await sandbox.commands.run('sudo apt-get update && sudo apt-get install -y git');
      console.log("Install exit code:", installGit.exitCode);
      if (installGit.exitCode !== 0) {
        console.error("Install stderr:", installGit.stderr);
      }
    }

    console.log("\\n🧹 Verificando se já existe repositório Git...");
    const gitStatus = await sandbox.commands.run('git status || echo "No git repo"');
    console.log("Git status result:");
    console.log(gitStatus.stdout);
    console.log(gitStatus.stderr);
    
    // Se já existe repo, vamos verificar o que está acontecendo
    if (!gitStatus.stdout.includes("No git repo")) {
      console.log("\\n📊 Repositório Git já existe, verificando detalhes...");
      
      const gitLog = await sandbox.commands.run('git log --oneline -5 || echo "No commits"');
      console.log("Git log:", gitLog.stdout);
      
      const gitRemotes = await sandbox.commands.run('git remote -v || echo "No remotes"');
      console.log("Git remotes:", gitRemotes.stdout);
      
      const gitBranch = await sandbox.commands.run('git branch || echo "No branches"');
      console.log("Git branch:", gitBranch.stdout);
    }
    
    console.log("\\n🗑️ Limpando e reinicializando...");
    await sandbox.commands.run('rm -rf .git');
    
    console.log("⚙️ Configurando Git...");
    await sandbox.commands.run('git config --global user.name "backup_admin"');
    await sandbox.commands.run('git config --global user.email "admin@lasy.ai"');
    
    console.log("🎯 Inicializando novo repositório...");
    const gitInit = await sandbox.commands.run('git init');
    console.log("Git init:", gitInit.stdout);
    console.log("Git init stderr:", gitInit.stderr);
    console.log("Git init exit code:", gitInit.exitCode);
    
    // Reconfigurar localmente
    await sandbox.commands.run('git config user.name "backup_admin"');
    await sandbox.commands.run('git config user.email "admin@lasy.ai"');
    
    // Criar gitignore
    console.log("\\n📄 Criando .gitignore...");
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
    
    // Limpar arquivos problemáticos
    console.log("\\n🧹 Limpando arquivos problemáticos...");
    await sandbox.commands.run('sudo rm -rf .wh.* || true');
    await sandbox.commands.run('rm -rf .npm/ || true');
    await sandbox.commands.run('rm -rf .next/ || true'); 
    await sandbox.commands.run('rm -rf nextjs-app/ || true');
    await sandbox.commands.run('rm -f .bash* .profile .sudo* .gitconfig || true');
    
    console.log("\\n📊 Status antes do add...");
    const statusBefore = await sandbox.commands.run('git status');
    console.log(statusBefore.stdout);
    
    // Adicionar arquivos específicos
    console.log("\\n➕ Adicionando arquivos específicos...");
    const gitAdd = await sandbox.commands.run('git add package.json package-lock.json tsconfig.json next.config.ts components.json postcss.config.mjs README.md app/ components/ hooks/ lib/ public/ .gitignore || true', { timeoutMs: 300000 });
    console.log("Git add exit code:", gitAdd.exitCode);
    console.log("Git add stdout:", gitAdd.stdout);
    console.log("Git add stderr:", gitAdd.stderr);
    
    console.log("\\n📊 Status após add...");
    const statusAfter = await sandbox.commands.run('git status');
    console.log(statusAfter.stdout);
    
    console.log("\\n💾 Tentando commit...");
    const gitCommit = await sandbox.commands.run('git commit -m "Debug sync test commit"');
    console.log("Commit exit code:", gitCommit.exitCode);
    console.log("Commit stdout:", gitCommit.stdout);
    console.log("Commit stderr:", gitCommit.stderr);
    
    if (gitCommit.exitCode === 0) {
      console.log("\\n🔗 Adicionando remote...");
      const remote = await sandbox.commands.run(`git remote add origin ${REPO_URL}`);
      console.log("Remote exit code:", remote.exitCode);
      console.log("Remote stderr:", remote.stderr);
      
      console.log("\\n📤 Tentando push...");
      const push = await sandbox.commands.run('git push -u origin master --force', { timeoutMs: 300000 });
      console.log("Push exit code:", push.exitCode);
      console.log("Push stdout:", push.stdout);
      console.log("Push stderr:", push.stderr);
      
      if (push.exitCode === 0) {
        const commitSha = await sandbox.commands.run('git rev-parse HEAD');
        console.log("\\n🎉 SUCESSO! Commit SHA:", commitSha.stdout.trim());
        console.log(`Repositório: https://github.com/backup_admin/${REPO_NAME}`);
      } else {
        console.log("\\n❌ Push falhou com exit code 128");
        console.log("Stderr detalhado:", push.stderr);
      }
    }

  } catch (error) {
    console.error("❌ Erro:", error.message);
    console.error("Stack:", error.stack);
  }
}

debugCurrentSync();