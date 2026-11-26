import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { ROOT } from "./root.mjs";
import { hasScript } from "./config.mjs";

/**
 * @param {string} repo
 * @param {string} [root]
 * @returns {boolean}
 */
export function hasDenoDevTask(repo, root = ROOT) {
  const denoPath = path.join(root, repo, "deno.json");
  try {
    const deno = JSON.parse(fs.readFileSync(denoPath, "utf8"));
    const task = deno?.tasks?.dev;
    return typeof task === "string" && task.trim().length > 0;
  } catch {
    return false;
  }
}

/**
 * @param {string} repo
 * @param {string} [root]
 * @returns {"yarn" | "deno-dev" | "both" | "none"}
 */
export function classifyRepo(repo, root = ROOT) {
  const hasPkg = fs.existsSync(path.join(root, repo, "package.json"));
  const hasDeno = hasDenoDevTask(repo, root);

  if (hasPkg && hasDeno) return "both";
  if (hasPkg) return "yarn";
  if (hasDeno) return "deno-dev";
  return "none";
}

/**
 * @param {string} repo
 * @param {string} [root]
 * @returns {string | null}
 */
export function resolveDevCommand(repo, root = ROOT) {
  const kind = classifyRepo(repo, root);

  if (kind === "yarn" || kind === "both") {
    if (hasScript(repo, "dev", root)) return "yarn dev";
    if (kind === "both" && hasDenoDevTask(repo, root)) {
      console.error(
        `→ ${repo}: package.json sem script dev; usando deno task dev`,
      );
      return "deno task dev";
    }
    return null;
  }

  if (kind === "deno-dev") return "deno task dev";
  return null;
}

/**
 * @param {string[]} repos
 * @param {string} [root]
 * @returns {{
 *   commands: Array<{ repo: string, command: string }>,
 *   skipped: string[]
 * }}
 */
export function resolveDevCommands(repos, root = ROOT) {
  const commands = [];
  const skipped = [];

  for (const repo of repos) {
    const command = resolveDevCommand(repo, root);
    if (command) commands.push({ repo, command });
    else skipped.push(repo);
  }

  return { commands, skipped };
}

/**
 * Repos que devem rodar `yarn` na fase de install.
 * @param {string[]} repos
 * @param {string} [root]
 * @returns {string[]}
 */
export function reposNeedingYarnInstall(repos, root = ROOT) {
  return repos.filter((repo) => {
    const kind = classifyRepo(repo, root);
    return kind === "yarn" || kind === "both";
  });
}

/**
 * @throws {Error} se `deno` não estiver no PATH
 */
export function ensureDenoAvailable() {
  const r = spawnSync("deno", ["--version"], {
    encoding: "utf8",
    shell: true,
  });
  if (r.error || (r.status ?? 1) !== 0) {
    throw new Error(
      "deno não encontrado no PATH. Instale o Deno para subir repositórios Deno (ex.: nexus).",
    );
  }
}
