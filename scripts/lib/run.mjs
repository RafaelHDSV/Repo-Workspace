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
 * @param {Array<{ repo: string, command: string }>} entries
 * @param {{ nodeVersionByRepo: Record<string, string> }} config
 * @param {string} [root]
 * @param {NodeJS.ProcessEnv} [baseEnv]
 * @param {NodeJS.ProcessEnv} [extraEnv]
 * @returns {Array<{
 *   command: string,
 *   name: string,
 *   cwd: string,
 *   env: NodeJS.ProcessEnv
 * }>}
 */
export function buildParallelCommands(
  entries,
  config,
  root = ROOT,
  baseEnv = process.env,
  extraEnv = {},
) {
  return entries.map(({ repo, command }) => {
    const cwd = path.join(root, repo);
    const version = config.nodeVersionByRepo[repo];
    const env = prependNodeToPath(version, { ...baseEnv, ...extraEnv });
    return {
      command,
      name: repo,
      cwd,
      env,
    };
  });
}

/**
 * @param {Array<{ repo: string, command: string }>} entries
 * @param {{ nodeVersionByRepo: Record<string, string> }} config
 * @param {string} [root]
 * @param {NodeJS.ProcessEnv} [extraEnv]
 * @returns {Promise<void>}
 */
export async function runCommandsParallel(
  entries,
  config,
  root = ROOT,
  extraEnv = {},
) {
  const commands = buildParallelCommands(
    entries,
    config,
    root,
    process.env,
    extraEnv,
  );

  const prefixColors = entries.map((_, i) => COLORS[i % COLORS.length]);

  const { result } = concurrently(commands, {
    prefix: "name",
    prefixColors,
    restartTries: 0,
  });
  await result;
}

/**
 * @param {string[]} repos
 * @param {string} yarnScript ex.: "dev"
 * @param {{ nodeVersionByRepo: Record<string, string> }} config
 * @param {string} [root]
 * @returns {Promise<void>}
 */
export async function runYarnParallel(repos, yarnScript, config, root = ROOT) {
  const entries = repos.map((repo) => ({
    repo,
    command: `yarn ${yarnScript}`,
  }));
  await runCommandsParallel(entries, config, root);
}
