import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { isGitRepo } from "./git.mjs";

const EDITOR_CANDIDATES = ["cursor", "code"];

const PREFERRED_FILES = [
  "package.json",
  "README.md",
  "readme.md",
  "Readme.md",
  ".gitignore",
  "LICENSE",
  "yarn.lock",
  "package-lock.json",
];

/**
 * @returns {string | null}
 */
export function resolveEditorCommand() {
  const fromEnv = process.env.REPOS_EDITOR?.trim();
  if (fromEnv) return fromEnv;

  for (const cmd of EDITOR_CANDIDATES) {
    const probe = spawnSync(cmd, ["--version"], {
      encoding: "utf8",
      shell: true,
      windowsHide: true,
    });
    if (probe.status === 0) return cmd;
  }

  return null;
}

/**
 * Escolhe um arquivo da raiz do repo para abrir (dispara detecção git via openEditors).
 *
 * @param {string} repoPath
 * @returns {string | null} path absoluto
 */
export function pickRepoFile(repoPath) {
  for (const name of PREFERRED_FILES) {
    const candidate = path.join(repoPath, name);
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }

  try {
    const entries = fs.readdirSync(repoPath, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      if (entry.name.startsWith(".") && entry.name !== ".gitignore") continue;
      return path.join(repoPath, entry.name);
    }
  } catch {
    return null;
  }

  return null;
}

/**
 * Garante detecção de repos a partir de editores abertos (sem multi-root / --add).
 *
 * @param {string} root
 */
function ensureOpenEditorsGitDetection(root) {
  const settingsPath = path.join(root, ".vscode", "settings.json");
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });

  /** @type {Record<string, unknown>} */
  let settings = {};
  if (fs.existsSync(settingsPath)) {
    try {
      settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    } catch {
      settings = {};
    }
  }

  // openEditors: Source Control passa a enxergar o .git do arquivo aberto
  settings["git.autoRepositoryDetection"] = "openEditors";
  fs.writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
}

/**
 * Abre um arquivo de cada repo na janela atual do Cursor (`-r`).
 * O Git extension detecta o repositório via openEditors — sem --add / .code-workspace.
 *
 * @param {string[]} repos nomes das pastas irmãs
 * @param {string} root raiz operacional dos clones
 * @returns {{ ok: boolean, activated: string[], skipped: string[], failed: string[] }}
 */
export function activateRepos(repos, root) {
  if (process.env.REPOS_SKIP_ACTIVATE === "1") {
    return { ok: true, activated: [], skipped: repos, failed: [] };
  }

  /** @type {string[]} */
  const activated = [];
  /** @type {string[]} */
  const skipped = [];
  /** @type {string[]} */
  const failed = [];
  /** @type {string[]} */
  const filesToOpen = [];

  for (const name of repos) {
    const repoPath = path.resolve(root, name);
    if (!isGitRepo(repoPath)) {
      console.error(`[${name}] ignorado: não é repositório git`);
      skipped.push(name);
      continue;
    }

    const filePath = pickRepoFile(repoPath);
    if (!filePath) {
      console.error(`[${name}] ignorado: nenhum arquivo na raiz para abrir`);
      skipped.push(name);
      continue;
    }

    filesToOpen.push(filePath);
    activated.push(name);
  }

  if (filesToOpen.length === 0) {
    return { ok: false, activated, skipped, failed };
  }

  const editor = resolveEditorCommand();
  if (!editor) {
    console.error(
      "Cursor/VS Code não encontrado no PATH. " +
        "Instale o CLI ou defina REPOS_EDITOR=cursor|code.",
    );
    return { ok: false, activated, skipped, failed: activated };
  }

  ensureOpenEditorsGitDetection(root);

  console.error(
    `\n→ Source Control: abrindo 1 arquivo por repo na janela do ${editor}`,
  );
  console.error(
    "  (sem --add / sem .code-workspace; detecção via git.autoRepositoryDetection=openEditors)\n",
  );

  // Uma chamada: reutiliza a janela ativa e abre todas as tabs.
  const result = spawnSync(editor, ["-r", ...filesToOpen], {
    encoding: "utf8",
    windowsHide: true,
    shell: process.platform === "win32",
  });

  if (result.status !== 0) {
    const errText = [result.stderr, result.stdout].filter(Boolean).join("").trim();
    console.error(
      `Falha ao abrir arquivos (${editor} -r): ${errText || `exit ${result.status}`}`,
    );
    return { ok: false, activated: [], skipped, failed: activated };
  }

  for (let i = 0; i < activated.length; i++) {
    console.error(
      `[${activated[i]}] aberto → ${path.basename(filesToOpen[i])}`,
    );
  }

  console.error(
    "\nSe o Source Control não listar na hora: Command Palette → “Git: Reopen Closed Repositories”.",
  );

  return { ok: true, activated, skipped, failed };
}
