import path from "node:path";
import { spawnSync } from "node:child_process";
import concurrently from "concurrently";
import { ROOT } from "./root.mjs";
import { prependNodeToPath } from "./env.mjs";

const COLORS = [
  "blue",
  "green",
  "yellow",
  "magenta",
  "cyan",
  "red",
  "white",
  "gray",
];

/**
 * @param {string} repo
 * @param {{ nodeVersionByRepo: Record<string, string> }} config
 * @param {string} [root]
 * @param {{ exitOnFail?: boolean }} [options]
 * @returns {number} exit code
 */
export function runYarnInstall(repo, config, root = ROOT, options = {}) {
  const { exitOnFail = true } = options;
  const cwd = path.join(root, repo);
  const version = config.nodeVersionByRepo[repo];
  const env = prependNodeToPath(version, process.env);
  console.error(`\n→ ${repo}: yarn`);
  const r = spawnSync("yarn", [], { cwd, env, stdio: "inherit", shell: true });
  const code = r.status ?? 1;
  if (code !== 0) {
    console.error(`Falhou: yarn em ${repo} (código ${code})`);
    if (exitOnFail) process.exit(code);
  }
  return code;
}

/**
 * @param {string[]} repos
 * @param {{ nodeVersionByRepo: Record<string, string> }} config
 * @param {string} [root]
 */
export function runYarnInstallSequential(repos, config, root = ROOT) {
  for (const repo of repos) {
    runYarnInstall(repo, config, root, { exitOnFail: true });
  }
  console.error("\nConcluído: yarn em todos os selecionados.");
}

/**
 * @param {string[]} repos
 * @param {string} yarnScript ex.: "dev" | "tsc"
 * @param {{ nodeVersionByRepo: Record<string, string> }} config
 * @param {string} [root]
 * @returns {Promise<void>}
 */
export async function runYarnParallel(repos, yarnScript, config, root = ROOT) {
  const commands = repos.map((repo) => {
    const cwd = path.join(root, repo);
    const version = config.nodeVersionByRepo[repo];
    const env = prependNodeToPath(version, process.env);
    return {
      command: `yarn ${yarnScript}`,
      name: repo,
      cwd,
      env,
    };
  });

  const prefixColors = repos.map((_, i) => COLORS[i % COLORS.length]);

  const { result } = concurrently(commands, {
    prefix: "name",
    prefixColors,
    restartTries: 0,
  });
  await result;
}
