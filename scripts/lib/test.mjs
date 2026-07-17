import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./root.mjs";

/**
 * Resolve uma suíte canônica, finita e adequada à execução agregada.
 *
 * @param {string} repo
 * @param {{ testCommandByRepo?: Record<string, string> }} config
 * @param {string} [root]
 * @returns {string | null}
 */
export function resolveTestCommand(repo, config, root = ROOT) {
  const override = config.testCommandByRepo?.[repo];
  if (typeof override === "string" && override.trim()) {
    return override.trim();
  }

  const pkgPath = path.join(root, repo, "package.json");
  let testScript;
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    testScript = pkg.scripts?.test;
  } catch {
    return null;
  }

  if (typeof testScript !== "string" || !testScript.trim()) {
    return null;
  }

  if (
    /\b(?:craco|react-scripts|react-app-rewired)\s+test\b/i.test(testScript)
  ) {
    return "yarn test --watchAll=false";
  }

  if (
    /\bvitest\b/i.test(testScript) &&
    !/\brun\b/i.test(testScript)
  ) {
    return "yarn test --run";
  }

  return "yarn test";
}

/**
 * @param {string[]} repos
 * @param {{ testCommandByRepo?: Record<string, string> }} config
 * @param {string} [root]
 * @returns {{
 *   commands: Array<{ repo: string, command: string }>,
 *   skipped: string[]
 * }}
 */
export function resolveTestCommands(repos, config, root = ROOT) {
  const commands = [];
  const skipped = [];

  for (const repo of repos) {
    const command = resolveTestCommand(repo, config, root);
    if (command) commands.push({ repo, command });
    else skipped.push(repo);
  }

  return { commands, skipped };
}
