import fs from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { isGitRepo } from "./git.mjs";

const EDITOR_CANDIDATES = ["cursor", "code"];
export const WORKSPACE_FILENAME = "repos.code-workspace";

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
 * @param {string} root
 * @returns {string}
 */
export function workspaceFilePath(root) {
  return path.join(root, WORKSPACE_FILENAME);
}

/**
 * Mescla repos selecionados em repos.code-workspace (paths relativos à raiz).
 *
 * @param {string[]} repos
 * @param {string} root
 * @returns {string} caminho do arquivo
 */
export function syncWorkspaceFile(repos, root) {
  const filePath = workspaceFilePath(root);
  /** @type {{ folders: { path: string, name?: string }[], settings?: Record<string, unknown> }} */
  let doc = { folders: [], settings: {} };

  if (fs.existsSync(filePath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
      if (Array.isArray(parsed.folders)) {
        doc.folders = parsed.folders;
      }
      if (parsed.settings && typeof parsed.settings === "object") {
        doc.settings = parsed.settings;
      }
    } catch {
      // recria arquivo inválido
    }
  }

  const known = new Set(
    doc.folders.map((folder) =>
      path.normalize(folder.path).replace(/\\/g, "/"),
    ),
  );

  for (const name of repos) {
    const rel = name.replace(/\\/g, "/");
    if (known.has(rel)) continue;
    doc.folders.push({ path: rel, name });
    known.add(rel);
  }

  doc.folders.sort((a, b) => a.path.localeCompare(b.path));
  fs.writeFileSync(filePath, `${JSON.stringify(doc, null, 2)}\n`, "utf8");
  return filePath;
}

/**
 * @param {string} editor
 * @param {string} folderPath
 */
function runEditorAdd(editor, folderPath) {
  return spawnSync(editor, ["--add", folderPath], {
    encoding: "utf8",
    windowsHide: true,
    shell: process.platform === "win32",
  });
}

/**
 * Adiciona repositórios git ao workspace do Cursor/VS Code para Source Control.
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

  for (const name of repos) {
    const repoPath = path.resolve(root, name);
    if (!isGitRepo(repoPath)) {
      console.error(`[${name}] ignorado na ativação: não é repositório git`);
      skipped.push(name);
      continue;
    }
    activated.push(name);
  }

  if (activated.length === 0) {
    return { ok: false, activated, skipped, failed };
  }

  const workspacePath = syncWorkspaceFile(activated, root);
  console.error(
    `\n→ Ativando ${activated.length} repositório(s) no Source Control…`,
  );
  console.error(`  Workspace: ${workspacePath}\n`);

  const editor = resolveEditorCommand();
  if (!editor) {
    console.error(
      "Cursor/VS Code não encontrado no PATH. " +
        "Instale o CLI ou defina REPOS_EDITOR=cursor|code. " +
        `Abra manualmente: ${workspacePath}`,
    );
    return { ok: false, activated, skipped, failed: activated };
  }

  for (const name of activated) {
    const folderPath = path.resolve(root, name);
    const result = runEditorAdd(editor, folderPath);
    const errText = [result.stderr, result.stdout].filter(Boolean).join("").trim();

    if (result.status !== 0) {
      console.error(
        `[${name}] falha ao adicionar (${editor} --add): ${errText || `exit ${result.status}`}`,
      );
      failed.push(name);
      continue;
    }

    console.error(`[${name}] adicionado ao workspace (Source Control)`);
  }

  if (failed.length > 0) {
    console.error(
      `\n${failed.length} repo(s) não entraram no workspace. ` +
        `Tente: ${editor} -r "${workspacePath}"`,
    );
  }

  return {
    ok: failed.length === 0,
    activated: activated.filter((name) => !failed.includes(name)),
    skipped,
    failed,
  };
}
