import { Sandbox } from "@e2b/code-interpreter";
import * as dotenv from 'dotenv';

// Carregar variáveis do .env.local
dotenv.config({ path: '.env.local' });

const SANDBOX_ID = "i0dk3x8rz09ofo4z2j1gr"; // Sandbox ativo fornecido pelo usuário
const PROJECT_ID = "732ab7b3-a2d8-4a32-a515-fe068897963e";
const REPO_NAME = `project-${PROJECT_ID}`;
const REPO_URL = `https://${process.env.GITHUB_TOKEN}@github.com/backup_admin/${REPO_NAME}.git`;

async function debugGitHubSync() {
  try {
    let sandbox;
    
    if (SANDBOX_ID) {
      console.log("🔌 Conectando ao sandbox existente...");
      sandbox = await Sandbox.connect(SANDBOX_ID);
    } else {
      console.log("🚀 Criando novo sandbox...");
      sandbox = await Sandbox.create("lasy-nextjs-test-2");
    }
    
    await sandbox.setTimeout(300000); // 5 minutos
    console.log(`✅ Sandbox ${SANDBOX_ID ? 'conectado' : 'criado'}: ${sandbox.sandboxId}`);

    console.log("\\n📁 Verificando diretório atual...");
    const pwd = await sandbox.commands.run('pwd');
    console.log("PWD:", pwd.stdout.trim());

    console.log("\\n📋 Listando arquivos...");
    const ls = await sandbox.commands.run('ls -la');
    console.log("Files:", ls.stdout);

    // 1. Instalar Git
    console.log("\\n🔄 Instalando Git...");
    const installGit = await sandbox.commands.run('sudo apt-get update && sudo apt-get install -y git');
    console.log("Git install exit code:", installGit.exitCode);
    if (installGit.exitCode !== 0) {
      console.error("Git install stderr:", installGit.stderr);
      throw new Error(`Git installation failed: ${installGit.stderr}`);
    }

    // 2. Verificar se Git foi instalado
    console.log("\\n🔍 Verificando instalação do Git...");
    const gitVersion = await sandbox.commands.run('git --version');
    console.log("Git version:", gitVersion.stdout);
    console.log("Git version exit code:", gitVersion.exitCode);

    // 3. Limpar locks
    console.log("\\n🧹 Limpando locks do Git...");
    await sandbox.commands.run('rm -f .git/index.lock .git/refs/heads/master.lock');
    
    // 4. Configurar Git
    console.log("\\n⚙️ Configurando Git...");
    const configName = await sandbox.commands.run('git config --global user.name "backup_admin"');
    console.log("Config name exit code:", configName.exitCode);
    const configEmail = await sandbox.commands.run('git config --global user.email "admin@lasy.ai"');
    console.log("Config email exit code:", configEmail.exitCode);
    
    // 5. Inicializar repositório
    console.log("\\n🎯 Inicializando repositório Git...");
    const gitInit = await sandbox.commands.run('git init');
    console.log("Git init output:", gitInit.stdout);
    console.log("Git init exit code:", gitInit.exitCode);
    console.log("Git init stderr:", gitInit.stderr);
    
    if (gitInit.exitCode !== 0) {
      throw new Error(`Git init failed: ${gitInit.stderr}`);
    }
    
    // Reconfigurar Git LOCAL depois do init
    console.log("⚙️ Reconfigurando Git LOCAL...");
    await sandbox.commands.run('git config user.name "backup_admin"');
    await sandbox.commands.run('git config user.email "admin@lasy.ai"');
    
    // 6. Remover arquivos problemáticos
    console.log("\\n🗑️ Removendo arquivos problemáticos...");
    await sandbox.commands.run('sudo rm -f .wh.* || echo "Arquivos .wh.* removidos ou não existem"');
    
    // 7. Criar .gitignore CORRIGIDO
    console.log("\\n📄 Criando .gitignore CORRIGIDO...");
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
    
    const gitignore = await sandbox.commands.run(`cat > .gitignore << 'EOF'
${gitignoreContent}
EOF`);
    console.log("Gitignore exit code:", gitignore.exitCode);
    
    // Verificar conteúdo do .gitignore
    const checkGitignore = await sandbox.commands.run('cat .gitignore');
    console.log("Conteúdo do .gitignore:");
    console.log(checkGitignore.stdout);
    
    // 7. Verificar status antes do add
    console.log("\\n📊 Status antes do git add...");
    const statusBefore = await sandbox.commands.run('git status');
    console.log("Status before:", statusBefore.stdout);
    
    // 8. Limpar diretórios que não devem ser commitados
    console.log("\\n🧹 Removendo diretórios que não devem ser commitados...");
    await sandbox.commands.run('sudo rm -rf .wh.* || true');
    await sandbox.commands.run('rm -rf .npm/ || true');
    await sandbox.commands.run('rm -rf .next/ || true'); 
    await sandbox.commands.run('rm -rf nextjs-app/ || true');
    await sandbox.commands.run('rm -f .bash* .profile .sudo* .gitconfig || true');
    
    // 9. Adicionar apenas arquivos do projeto
    console.log("\\n➕ Adicionando apenas arquivos do projeto...");
    
    console.log("Tentativa 1: git add arquivos específicos");
    const gitAdd1 = await sandbox.commands.run('git add package.json package-lock.json tsconfig.json next.config.ts components.json postcss.config.mjs README.md app/ components/ hooks/ lib/ public/ .gitignore', { timeoutMs: 60000 });
    console.log("Add específico exit code:", gitAdd1.exitCode);
    
    if (gitAdd1.exitCode !== 0) {
      console.log("Tentativa 2: git add . (após limpeza)");
      const gitAdd2 = await sandbox.commands.run('git add .', { timeoutMs: 60000 });
      console.log("Add . exit code:", gitAdd2.exitCode);
      
      if (gitAdd2.exitCode !== 0) {
        console.log("Tentativa 3: git add -A");
        const gitAdd3 = await sandbox.commands.run('git add -A', { timeoutMs: 60000 });
        console.log("Add -A exit code:", gitAdd3.exitCode);
      }
    }
    
    // 9. Verificar status após add
    console.log("\\n📊 Status após git add...");
    const statusAfter = await sandbox.commands.run('git status');
    console.log("Status after:", statusAfter.stdout);
    
    // 10. Fazer commit
    console.log("\\n💾 Fazendo commit...");
    const gitCommit = await sandbox.commands.run('git commit -m "Auto-sync from Vibe Sandbox - $(date)"');
    console.log("Git commit output:", gitCommit.stdout);
    console.log("Git commit exit code:", gitCommit.exitCode);
    console.log("Git commit stderr:", gitCommit.stderr);
    
    if (gitCommit.exitCode !== 0) {
      console.log("Commit falhou, reconfiguração Git...");
      await sandbox.commands.run('git config user.name "backup_admin"');
      await sandbox.commands.run('git config user.email "admin@lasy.ai"');
      const retryCommit = await sandbox.commands.run('git commit -m "Auto-sync from Vibe Sandbox - $(date)"');
      console.log("Retry commit exit code:", retryCommit.exitCode);
      if (retryCommit.exitCode !== 0) {
        throw new Error(`Commit failed: ${retryCommit.stderr}`);
      }
    }
    
    // 11. Adicionar remote
    console.log("\\n🔗 Adicionando remote origin...");
    const gitRemote = await sandbox.commands.run(`git remote add origin ${REPO_URL} || git remote set-url origin ${REPO_URL}`);
    console.log("Git remote output:", gitRemote.stdout);
    console.log("Git remote exit code:", gitRemote.exitCode);
    console.log("Git remote stderr:", gitRemote.stderr);
    
    // 12. Verificar remote
    console.log("\\n🔍 Verificando remote...");
    const remoteShow = await sandbox.commands.run('git remote -v');
    console.log("Remote show:", remoteShow.stdout);
    
    // 13. Fazer push FORÇADO
    console.log("\\n📤 Fazendo push FORÇADO...");
    
    // Tentar push de várias formas forçadas
    console.log("Tentativa 1: push --force-with-lease");
    const gitPush1 = await sandbox.commands.run('git push -u origin master --force-with-lease', { timeoutMs: 120000 });
    console.log("Push --force-with-lease exit code:", gitPush1.exitCode);
    
    if (gitPush1.exitCode !== 0) {
      console.log("Tentativa 2: push --force");
      const gitPush2 = await sandbox.commands.run('git push -u origin master --force', { timeoutMs: 120000 });
      console.log("Push --force exit code:", gitPush2.exitCode);
      console.log("Push --force stderr:", gitPush2.stderr);
      
      if (gitPush2.exitCode !== 0) {
        console.log("Tentativa 3: push sem -u");
        const gitPush3 = await sandbox.commands.run('git push origin master --force', { timeoutMs: 120000 });
        console.log("Push sem -u exit code:", gitPush3.exitCode);
        console.log("Push sem -u stderr:", gitPush3.stderr);
        
        if (gitPush3.exitCode !== 0) {
          throw new Error(`Todos os pushes falharam. Último erro: ${gitPush3.stderr}`);
        }
      }
    }
    
    // 14. Obter commit SHA
    console.log("\\n🔍 Obtendo SHA do commit...");
    const getCommitSha = await sandbox.commands.run('git rev-parse HEAD');
    const commitSha = getCommitSha.stdout.trim();
    console.log("Commit SHA:", commitSha);
    
    console.log("\\n🎉 Debug concluído com sucesso!");
    console.log(`Repositório: https://github.com/backup_admin/${REPO_NAME}`);
    console.log(`Commit SHA: ${commitSha}`);

  } catch (error) {
    console.error("❌ Erro durante debug:", error.message);
    if (error.stderr) console.error("Stderr:", error.stderr);
  }
}

debugGitHubSync();