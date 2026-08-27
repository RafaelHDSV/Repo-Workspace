import { spawnSync } from "node:child_process";
import path from "node:path";
import { discoverGitRepos, isGitRepo } from "./git.mjs";

const EDITOR_CANDIDATES = ["cursor", "code"];

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
 * @param {string} editor
 * @param {"--add" | "--remove"} flag
 * @param {string} folderPath
 */
function runEditorFolderFlag(editor, flag, folderPath) {
  return spawnSync(editor, [flag, folderPath], {
    encoding: "utf8",
    windowsHide: true,
    shell: process.platform === "win32",
  });
}

/**
 * Adiciona pastas dos repos à janela ativa do Cursor/VS Code (`--add`) para
 * aparecerem no Source Control. Não cria arquivo .code-workspace.
 *
 * Repos git na raiz que não foram selecionados saem da janela (`--remove`).
 *
 * @param {string[]} repos nomes das pastas irmãs selecionadas
 * @param {string} root raiz operacional dos clones
 * @param {{ ignore?: string[] }} [options]
 * @returns {{ ok: boolean, activated: string[], skipped: string[], failed: string[] }}
 */
export function activateRepos(repos, root, options = {}) {
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

  const editor = resolveEditorCommand();
  if (!editor) {
    console.error(
      "Cursor/VS Code não encontrado no PATH. " +
        "Instale o CLI (Shell Command: Install 'cursor' command) " +
        "ou defina REPOS_EDITOR=cursor|code.",
    );
    return { ok: false, activated, skipped, failed: activated };
  }

  const selected = new Set(activated);
  const allGit = discoverGitRepos(root, options.ignore ?? []);
  const toRemove = allGit.filter((name) => !selected.has(name));

  console.error(
    `\n→ Source Control: ativando ${activated.length} repositório(s) na janela do ${editor}`,
  );
  console.error(
    "  (usa --add na janela ativa; não cria .code-workspace)\n",
  );

  for (const name of toRemove) {
    const folderPath = path.resolve(root, name);
    const result = runEditorFolderFlag(editor, "--remove", folderPath);
    if (result.status === 0) {
      console.error(`[${name}] removido da janela`);
    }
  }

  for (const name of activated) {
    const folderPath = path.resolve(root, name);
    const result = runEditorFolderFlag(editor, "--add", folderPath);
    const errText = [result.stderr, result.stdout].filter(Boolean).join("").trim();

    if (result.status !== 0) {
      console.error(
        `[${name}] falha (${editor} --add): ${errText || `exit ${result.status}`}`,
      );
      failed.push(name);
      continue;
    }

    console.error(`[${name}] adicionado ao Source Control`);
  }

  if (failed.length > 0) {
    console.error(
      `\n${failed.length} repo(s) falharam. Confirme que há uma janela do Cursor aberta e o CLI no PATH.`,
    );
  }

  return {
    ok: failed.length === 0,
    activated: activated.filter((name) => !failed.includes(name)),
    skipped,
    failed,
  };
}
