import { spawnSync } from "node:child_process";
import path from "node:path";
import { isGitRepo } from "./git.mjs";

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
 * Adiciona repositórios git ao workspace do Cursor/VS Code (`--add`) para
 * aparecerem no Source Control.
 *
 * @param {string[]} repos nomes das pastas irmãs
 * @param {string} root raiz operacional dos clones
 * @returns {{ ok: boolean, activated: string[], skipped: string[] }}
 */
export function activateRepos(repos, root) {
  if (process.env.REPOS_SKIP_ACTIVATE === "1") {
    return { ok: true, activated: [], skipped: repos };
  }

  /** @type {string[]} */
  const activated = [];
  /** @type {string[]} */
  const skipped = [];

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
    return { ok: false, activated, skipped };
  }

  const editor = resolveEditorCommand();
  if (!editor) {
    console.error(
      "Cursor/VS Code não encontrado no PATH. " +
        "Instale o CLI ou defina REPOS_EDITOR=cursor|code. " +
        "Pastas não foram adicionadas ao Source Control.",
    );
    return { ok: false, activated, skipped };
  }

  const folderPaths = activated.map((name) => path.resolve(root, name));
  const result = spawnSync(editor, ["--add", ...folderPaths], {
    encoding: "utf8",
    shell: true,
    windowsHide: true,
  });

  const errText = [result.stderr, result.stdout].filter(Boolean).join("").trim();

  if (result.status !== 0) {
    console.error(
      `Falha ao adicionar pastas ao workspace (${editor} --add): ${errText || `exit ${result.status}`}`,
    );
    return { ok: false, activated, skipped };
  }

  for (const name of activated) {
    console.error(`[${name}] adicionado ao workspace (Source Control)`);
  }

  return { ok: true, activated, skipped };
}
