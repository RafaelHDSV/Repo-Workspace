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

/** Ms after opening each file before closing (Git precisa registrar o repo). */
function settleMs() {
  const raw = process.env.REPOS_ACTIVATE_SETTLE_MS;
  const n = raw ? Number(raw) : 3000;
  return Number.isFinite(n) && n >= 0 ? n : 3000;
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
 * @param {string} repoPath
 * @returns {string | null}
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
 * Fecha a aba ativa (a que acabamos de abrir).
 * @returns {boolean}
 */
export function closeActiveEditor() {
  return closeRecentEditors(1);
}

/**
 * @param {number} count
 * @returns {boolean}
 */
export function closeRecentEditors(count) {
  if (count <= 0) return true;

  if (process.platform === "win32") {
    const ps = `
Add-Type -AssemblyName System.Windows.Forms
Start-Sleep -Milliseconds 150
1..${count} | ForEach-Object {
  [System.Windows.Forms.SendKeys]::SendWait('^w')
  Start-Sleep -Milliseconds 80
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
    delay 0.08
  end repeat
end tell
`;
    const result = spawnSync("osascript", ["-e", script], {
      encoding: "utf8",
    });
    return result.status === 0;
  }

  const which = spawnSync("sh", ["-c", "command -v xdotool"], {
    encoding: "utf8",
  });
  if (which.status === 0 && which.stdout.trim()) {
    for (let i = 0; i < count; i++) {
      spawnSync("xdotool", ["key", "ctrl+w"], { encoding: "utf8" });
      sleepMs(80);
    }
    return true;
  }

  return false;
}

/**
 * Um repo por vez: abre arquivo → espera SCM → fecha aba.
 * Em lote o Git só dava tempo de registrar ~3 de 8.
 *
 * @param {string[]} repos
 * @param {string} root
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
  /** @type {{ name: string, file: string }[]} */
  const queue = [];

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

    queue.push({ name, file: filePath });
  }

  if (queue.length === 0) {
    return { ok: false, activated, skipped, failed };
  }

  const editor = resolveEditorCommand();
  if (!editor) {
    console.error(
      "Cursor/VS Code não encontrado no PATH. " +
        "Instale o CLI ou defina REPOS_EDITOR=cursor|code.",
    );
    return {
      ok: false,
      activated,
      skipped,
      failed: queue.map((q) => q.name),
    };
  }

  ensureOpenEditorsGitDetection(root);

  const waitMs = settleMs();
  console.error(
    `\n→ Source Control: ${queue.length} repo(s) — um a um ` +
      `(abrir com foco → ${waitMs}ms → fechar aba)`,
  );
  console.error("  (sem --add / sem .code-workspace)\n");

  for (const { name, file } of queue) {
    // -g força o arquivo como aba ativa/visível (não só “aberto em background”)
    const open = spawnSync(editor, ["-r", "-g", `${file}:1`], {
      encoding: "utf8",
      windowsHide: true,
      shell: process.platform === "win32",
    });

    if (open.status !== 0) {
      const errText = [open.stderr, open.stdout].filter(Boolean).join("").trim();
      console.error(
        `[${name}] falha ao abrir (${editor} -r -g): ${errText || `exit ${open.status}`}`,
      );
      failed.push(name);
      continue;
    }

    console.error(`[${name}] em foco → ${path.basename(file)} (${waitMs}ms)`);
    sleepMs(waitMs);

    if (!closeActiveEditor()) {
      console.error(
        `[${name}] não fechou a aba automaticamente — feche com Ctrl+W`,
      );
    } else {
      console.error(`[${name}] aba fechada (repo no Source Control)`);
    }

    activated.push(name);
    sleepMs(200);
  }

  if (failed.length > 0) {
    console.error(`\n${failed.length} repo(s) falharam na ativação.`);
  } else {
    console.error(
      `\n→ ${activated.length} repositório(s) ativados no Source Control.`,
    );
  }

  return {
    ok: failed.length === 0,
    activated,
    skipped,
    failed,
  };
}
