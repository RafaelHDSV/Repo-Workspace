import path from "node:path";

/**
 * No Windows o PATH visível em processo costuma estar em `Path` (Pascal);
 * redefinir só `PATH` e ignorar o valor real quebra a busca por `cmd.exe` (spawn ENOENT).
 * @param {NodeJS.ProcessEnv} env
 * @param {string} segment
 * @returns {NodeJS.ProcessEnv}
 */
export function withPrependedPathSegment(env, segment) {
  const next = { ...env };
  const existing = next.PATH || next.Path || next.path || "";
  const merged = segment ? `${segment}${path.delimiter}${existing}` : existing;
  next.PATH = merged;
  if (process.platform === "win32") {
    next.Path = merged;
  }
  return next;
}

/**
 * @param {string | undefined} version
 * @param {NodeJS.ProcessEnv} env
 * @returns {NodeJS.ProcessEnv}
 */
export function prependNodeToPath(version, env) {
  const nvmHome = env.NVM_HOME || env.NVM_SYMLINK;
  if (!version || !nvmHome) return { ...env };
  const v = String(version).startsWith("v") ? version : `v${version}`;
  const nodeBin = path.join(nvmHome, v);
  return withPrependedPathSegment(env, nodeBin);
}
