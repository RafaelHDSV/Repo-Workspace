import fs from "node:fs";
import path from "node:path";
import { discoverGitRepos, isGitRepo } from "./git.mjs";

const VSCODE_DIR = ".vscode";
const SETTINGS_FILE = "settings.json";

/**
 * @param {string} root
 * @returns {string}
 */
export function scmSettingsPath(root) {
  return path.join(root, VSCODE_DIR, SETTINGS_FILE);
}

/**
 * Configura quais clones git aparecem no Source Control sem criar .code-workspace
 * nem adicionar pastas ao multi-root do editor.
 *
 * Repos não selecionados entram em git.ignoredRepositories; os selecionados ficam
 * visíveis via git.autoRepositoryDetection=subfolders.
 *
 * @param {string[]} selectedRepos nomes das pastas irmãs
 * @param {string} root raiz operacional dos clones
 * @param {string[]} [extraIgnore] pastas ignoradas (mesmo ignore do repos.config)
 * @returns {string} caminho do settings.json escrito
 */
export function syncScmSettings(selectedRepos, root, extraIgnore = []) {
  const settingsFile = scmSettingsPath(root);
  fs.mkdirSync(path.dirname(settingsFile), { recursive: true });

  /** @type {Record<string, unknown>} */
  let settings = {};
  if (fs.existsSync(settingsFile)) {
    try {
      settings = JSON.parse(fs.readFileSync(settingsFile, "utf8"));
    } catch {
      settings = {};
    }
  }

  const allGit = discoverGitRepos(root, extraIgnore);
  const selected = new Set(
    selectedRepos.filter((name) => isGitRepo(path.join(root, name))),
  );

  const ignoredRepositories = allGit
    .filter((name) => !selected.has(name))
    .map((name) => path.resolve(root, name));

  settings["git.autoRepositoryDetection"] = "subfolders";
  settings["git.repositoryScanMaxDepth"] = 1;
  settings["git.ignoredRepositories"] = ignoredRepositories;

  fs.writeFileSync(settingsFile, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
  return settingsFile;
}

/**
 * @param {string[]} repos nomes das pastas irmãs
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
    return { ok: false, activated, skipped, failed: [] };
  }

  const settingsPath = syncScmSettings(activated, root, options.ignore ?? []);
  console.error(
    `\n→ Source Control: ${activated.length} repositório(s) visíveis`,
  );
  console.error(`  ${settingsPath}\n`);

  for (const name of activated) {
    console.error(`[${name}] visível no Source Control`);
  }

  if (skipped.length > 0) {
    console.error(
      `\n${skipped.length} pasta(s) ignorada(s) (sem .git). ` +
        "Abra a raiz dos clones no Cursor para aplicar as settings.",
    );
  }

  return { ok: true, activated, skipped, failed: [] };
}
