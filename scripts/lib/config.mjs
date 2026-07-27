import fs from "node:fs";
import path from "node:path";
import { DEFAULT_ROOT } from "./root.mjs";

const BUILTIN_IGNORE = ["node_modules", ".git", "scripts", "tests"];

/**
 * @typedef {{
 *   ignore: string[],
 *   nodeVersionByRepo: Record<string, string>,
 *   testCommandByRepo: Record<string, string>
 * }} ReposConfig
 */

/**
 * @param {string} [root]
 * @param {string | null} [configPath] caminho absoluto/relativo para JSON já resolvido
 * @returns {ReposConfig}
 */
export function loadConfig(root = DEFAULT_ROOT, configPath = null) {
  const defaults = {
    ignore: [...BUILTIN_IGNORE],
    nodeVersionByRepo: {},
    testCommandByRepo: {},
  };

  const filePath = configPath
    ? path.resolve(configPath)
    : path.join(root, "repos.config.json");

  if (!fs.existsSync(filePath)) return defaults;

  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw);
    return {
      ignore: [...defaults.ignore, ...(parsed.ignore || [])],
      nodeVersionByRepo: parsed.nodeVersionByRepo || {},
      testCommandByRepo: parsed.testCommandByRepo || {},
    };
  } catch {
    return defaults;
  }
}

/**
 * Pastas irmãs com package.json na raiz da subpasta.
 * @param {{ ignore: string[] }} config
 * @param {string} [root]
 * @returns {string[]}
 */
export function discoverPackageRepos(config, root = DEFAULT_ROOT) {
  const ignore = new Set(config.ignore);
  if (!fs.existsSync(root)) return [];

  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !ignore.has(d.name))
    .map((d) => d.name)
    .filter((name) => fs.existsSync(path.join(root, name, "package.json")))
    .sort((a, b) => a.localeCompare(b));
}

/**
 * @param {string} repo
 * @param {string} scriptName
 * @param {string} [root]
 * @returns {boolean}
 */
export function hasScript(repo, scriptName, root = DEFAULT_ROOT) {
  const pkgPath = path.join(root, repo, "package.json");
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    return Boolean(pkg.scripts && pkg.scripts[scriptName]);
  } catch {
    return false;
  }
}

/**
 * @param {string[]} selected
 * @param {string} scriptName
 * @param {string} [root]
 * @returns {{ withScript: string[], skipped: string[] }}
 */
export function filterWithScript(selected, scriptName, root = DEFAULT_ROOT) {
  const withScript = selected.filter((repo) =>
    hasScript(repo, scriptName, root),
  );
  const skipped = selected.filter((repo) => !withScript.includes(repo));
  return { withScript, skipped };
}
