import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Raiz padrão do hub: pasta que contém package.json e scripts/ (pai de scripts/lib). */
export const DEFAULT_ROOT = path.resolve(__dirname, "../..");

/** @deprecated Use DEFAULT_ROOT ou resolveRoot(); mantido para compatibilidade. */
export const ROOT = DEFAULT_ROOT;

/**
 * Resolve a raiz operacional dos clones.
 * Precedência: flag --root > env REPOS_ROOT > pasta do script (standalone).
 *
 * @param {{ rootFlag?: string | null, envRoot?: string | null }} [opts]
 * @returns {string}
 */
export function resolveRoot(opts = {}) {
  const rootFlag = opts.rootFlag;
  const envRoot =
    opts.envRoot !== undefined ? opts.envRoot : process.env.REPOS_ROOT;

  if (rootFlag) return path.resolve(rootFlag);
  if (envRoot) return path.resolve(envRoot);
  return DEFAULT_ROOT;
}
