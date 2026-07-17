import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./root.mjs";

const BUILTIN_IGNORE = ["node_modules", ".git", "scripts", "tests"];

/**
 * @param {string} [root]
 * @returns {{ ignore: string[], nodeVersionByRepo: Record<string, string> }}
 */
export function loadConfig(root = ROOT) {
  const configPath = path.join(root, "repos.config.json");
  const defaults = { ignore: [...BUILTIN_IGNORE], nodeVersionByRepo: {} };
  if (!fs.existsSync(configPath)) return defaults;
  try {
    const raw = fs.readFileSync(configPath, "utf8");
    const parsed = JSON.parse(raw);
    return {
      ignore: [...defaults.ignore, ...(parsed.ignore || [])],
      nodeVersionByRepo: parsed.nodeVersionByRepo || {},
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
export function discoverPackageRepos(config, root = ROOT) {
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
export function hasScript(repo, scriptName, root = ROOT) {
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
export function filterWithScript(selected, scriptName, root = ROOT) {
  const withScript = selected.filter((repo) => hasScript(repo, scriptName, root));
  const skipped = selected.filter((repo) => !withScript.includes(repo));
  return { withScript, skipped };
}
