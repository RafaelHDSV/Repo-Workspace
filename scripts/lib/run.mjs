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
 * @param {{ yarnRepos?: string[], denoSkipped?: string[] }} [partition]
 */
export function runYarnInstallSequential(
  repos,
  config,
  root = ROOT,
  partition = {},
) {
  const yarnRepos = partition.yarnRepos ?? repos;
  const denoSkipped = partition.denoSkipped ?? [];

  for (const repo of denoSkipped) {
    console.error(`\n→ ${repo}: (Deno) pulando yarn install`);
  }

  for (const repo of yarnRepos) {
    runYarnInstall(repo, config, root, { exitOnFail: true });
  }

  if (yarnRepos.length === 0) {
    console.error("\nConcluído: nenhum repo Yarn na seleção (só Deno, se houver).");
    return;
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

const SIGNAL_EXIT_CODES = new Set(["SIGINT", "SIGTERM", "SIGBREAK", "SIGHUP"]);

/**
 * Detecta Ctrl+C / kill via close events do concurrently (SIGINT remapeia exit 0).
 * Também cobre exitCode string de sinal e flag local — no Windows os filhos
 * às vezes morrem pelo console sem `killed: true`.
 * @param {unknown} closeEvents
 * @param {boolean} [signalSeen]
 * @returns {boolean}
 */
export function wasInterruptedBySignal(closeEvents, signalSeen = false) {
  if (signalSeen) return true;
  if (!Array.isArray(closeEvents)) return false;
  return closeEvents.some((event) => {
    if (!event) return false;
    if (event.killed === true) return true;
    return SIGNAL_EXIT_CODES.has(event.exitCode);
  });
}

/**
 * @param {Array<{ repo: string, command: string }>} entries
 * @param {{ nodeVersionByRepo: Record<string, string> }} config
 * @param {string} [root]
 * @param {NodeJS.ProcessEnv} [extraEnv]
 * @returns {Promise<{ interrupted: boolean }>}
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

  let signalSeen = false;
  const onSignal = () => {
    signalSeen = true;
  };
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);
  if (process.platform === "win32") {
    process.on("SIGBREAK", onSignal);
  }

  try {
    const { result } = concurrently(commands, {
      prefix: "name",
      prefixColors,
      restartTries: 0,
    });

    try {
      const events = await result;
      return {
        interrupted: wasInterruptedBySignal(events, signalSeen),
      };
    } catch (events) {
      if (wasInterruptedBySignal(events, signalSeen)) {
        return { interrupted: true };
      }
      throw events;
    }
  } finally {
    process.off("SIGINT", onSignal);
    process.off("SIGTERM", onSignal);
    if (process.platform === "win32") {
      process.off("SIGBREAK", onSignal);
    }
  }
}

/**
 * @param {string[]} repos
 * @param {string} yarnScript ex.: "dev"
 * @param {{ nodeVersionByRepo: Record<string, string> }} config
 * @param {string} [root]
 * @returns {Promise<{ interrupted: boolean }>}
 */
export async function runYarnParallel(repos, yarnScript, config, root = ROOT) {
  const entries = repos.map((repo) => ({
    repo,
    command: `yarn ${yarnScript}`,
  }));
  return runCommandsParallel(entries, config, root);
}
