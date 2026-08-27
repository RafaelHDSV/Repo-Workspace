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

/** @returns {number} */
function settleMs() {
  const raw = process.env.REPOS_ACTIVATE_SETTLE_MS;
  const n = raw ? Number(raw) : 1200;
  return Number.isFinite(n) && n >= 0 ? n : 1200;
}

/**
 * @param {number} ms
 */
export function sleepMs(ms) {
  if (ms <= 0) return;
  const buf = new Int32Array(new SharedArrayBuffer(4));
  Atomics.wait(buf, 0, 0, ms);
}

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

  settings["git.autoRepositoryDetection"] = "openEditors";
  fs.writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
}

/**
 * Fecha as N abas mais recentes na janela ativa (as que acabamos de abrir).
 * Cursor/VS Code CLI não expõe “close editor”; usamos atalho do SO.
 *
 * @param {number} count
 * @returns {boolean}
 */
export function closeRecentEditors(count) {
  if (count <= 0) return true;

  if (process.platform === "win32") {
    const ps = `
Add-Type -AssemblyName System.Windows.Forms
Start-Sleep -Milliseconds 200
1..${count} | ForEach-Object {
  [System.Windows.Forms.SendKeys]::SendWait('^w')
  Start-Sleep -Milliseconds 60
}
`;
    const result = spawnSync(
      "powershell",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", ps],
      { encoding: "utf8", windowsHide: true },
    );
    return result.status === 0;
  }

  if (process.platform === "darwin") {
    const script = `
tell application "System Events"
  repeat ${count} times
    keystroke "w" using command down
    delay 0.06
  end repeat
end tell
`;
    const result = spawnSync("osascript", ["-e", script], {
      encoding: "utf8",
    });
    return result.status === 0;
  }

  // Linux: tenta xdotool se existir
  const which = spawnSync("sh", ["-c", "command -v xdotool"], {
    encoding: "utf8",
  });
  if (which.status === 0 && which.stdout.trim()) {
    for (let i = 0; i < count; i++) {
      spawnSync("xdotool", ["key", "ctrl+w"], { encoding: "utf8" });
      sleepMs(60);
    }
    return true;
  }

  return false;
}

/**
 * Abre 1 arquivo por repo na janela atual, espera o SCM detectar, depois fecha as abas.
 * O repositório permanece no Source Control (openEditors já registrou o .git).
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

  const waitMs = settleMs();
  console.error(
    `\n→ Source Control: abrindo ${filesToOpen.length} arquivo(s) no ${editor}, ` +
      `aguardando ${waitMs}ms, depois fechando as abas`,
  );
  console.error("  (repos permanecem no SCM; sem --add / sem .code-workspace)\n");

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

  sleepMs(waitMs);

  const closed = closeRecentEditors(filesToOpen.length);
  if (closed) {
    console.error(
      `\n→ Fechou ${filesToOpen.length} aba(s). Repos devem continuar no Source Control.`,
    );
  } else {
    console.error(
      "\nNão foi possível fechar as abas automaticamente neste SO. " +
        "Feche manualmente (Ctrl+W / Cmd+W) — os repos já devem estar no Source Control.",
    );
  }

  return { ok: true, activated, skipped, failed };
}
