import fs from "node:fs";
import path from "node:path";
import { isGitRepo } from "./git.mjs";

/** Nome do arquivo escrito em <repo>/.git/ para disparar o watcher da extensão Git. */
export const MARKER_NAME = ".repo-workspace-activate";

/**
 * Normaliza uma lista de nomes de repositório: descarta o que não é string,
 * apara espaço e barra final, deduplica e ordena.
 *
 * @param {unknown} list
 * @returns {string[]}
 */
export function normalizeRepoList(list) {
  if (!Array.isArray(list)) return [];

  /** @type {Set<string>} */
  const out = new Set();

  for (const value of list) {
    if (typeof value !== "string") continue;
    const name = value.trim().replace(/[\\/]+$/, "");
    if (name) out.add(name);
  }

  return [...out].sort((a, b) => a.localeCompare(b));
}

/**
 * Lê git.scanRepositories de <root>/.vscode/settings.json.
 *
 * Nunca lança: arquivo ausente, JSON inválido, conteúdo que não é objeto ou
 * chave ausente devolvem lista vazia. É insumo de interface — um settings
 * corrompido degrada o menu para "nada pré-marcado" em vez de derrubar o
 * comando. O aviso de arquivo inválido é responsabilidade de
 * persistScanRepositories.
 *
 * @param {string} root
 * @returns {string[]}
 */
export function readScanRepositories(root) {
  const settingsPath = path.join(root, ".vscode", "settings.json");

  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
  } catch {
    return [];
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return [];

  const list = parsed["git.scanRepositories"];
  if (!Array.isArray(list)) return [];

  return list.filter((value) => typeof value === "string");
}

/**
 * Grava a seleção em <root>/.vscode/settings.json.
 *
 * A lista é substituída, não somada: o Source Control reflete exatamente a
 * última seleção. O merge acontece no JSON — chaves de terceiros sobrevivem.
 *
 * As três chaves juntas fazem a extensão Git registrar exatamente os
 * repositórios da lista em toda abertura da janela: maxDepth 0 faz o
 * traverse retornar vazio, e scanRepositories só é lido quando
 * autoRepositoryDetection é true ou "subFolders".
 *
 * @param {string} root
 * @param {string[]} repos
 * @returns {{ path: string, list: string[] | null, error: string | null }}
 */
export function persistScanRepositories(root, repos) {
  const settingsPath = path.join(root, ".vscode", "settings.json");

  /** @type {Record<string, unknown>} */
  let settings = {};

  if (fs.existsSync(settingsPath)) {
    let parsed;
    try {
      parsed = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    } catch {
      return {
        path: settingsPath,
        list: null,
        error: "JSON inválido (comentários não são suportados aqui)",
      };
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {
        path: settingsPath,
        list: null,
        error: "o conteúdo não é um objeto JSON",
      };
    }
    settings = parsed;
  }

  const list = normalizeRepoList(repos);

  settings["git.autoRepositoryDetection"] = true;
  settings["git.repositoryScanMaxDepth"] = 0;
  settings["git.scanRepositories"] = list;

  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(
    settingsPath,
    `${JSON.stringify(settings, null, 2)}\n`,
    "utf8",
  );

  return { path: settingsPath, list, error: null };
}

/**
 * Escreve o marker em <repo>/.git/ para cada repositório.
 *
 * O watcher "**" da extensão Git filtra eventos cujo path contém "/.git" e
 * chama openRepository na raiz correspondente. Escrever basta: apagar na
 * mesma execução faz o watcher coalescer o par create/delete e nada é
 * emitido. A limpeza fica para cleanStaleMarkers, na execução seguinte.
 *
 * @param {string[]} repos
 * @param {string} root
 * @returns {{ probed: string[], failed: string[] }}
 */
export function probeRepos(repos, root) {
  /** @type {string[]} */
  const probed = [];
  /** @type {string[]} */
  const failed = [];

  for (const name of repos) {
    const gitDir = path.join(path.resolve(root, name), ".git");
    let isDir = false;
    try {
      isDir = fs.statSync(gitDir).isDirectory();
    } catch {
      isDir = false;
    }
    if (!isDir) {
      failed.push(name);
      continue;
    }

    try {
      fs.writeFileSync(
        path.join(gitDir, MARKER_NAME),
        `${new Date().toISOString()}\n`,
        "utf8",
      );
      probed.push(name);
    } catch {
      failed.push(name);
    }
  }

  return { probed, failed };
}

/**
 * Remove markers de repositórios que não estão em `keep`.
 *
 * @param {string} root
 * @param {string[]} [keep]
 * @returns {number} quantidade removida
 */
export function cleanStaleMarkers(root, keep = []) {
  const keepSet = new Set(keep);
  let removed = 0;

  /** @type {import("node:fs").Dirent[]} */
  let entries = [];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return 0;
  }

  for (const entry of entries) {
    if (!entry.isDirectory() || keepSet.has(entry.name)) continue;
    const marker = path.join(root, entry.name, ".git", MARKER_NAME);
    try {
      if (fs.existsSync(marker)) {
        fs.rmSync(marker);
        removed++;
      }
    } catch {
      // marker travado ou sem permissão: irrelevante, segue
    }
  }

  return removed;
}

/**
 * Ativa repositórios no Source Control do Cursor/VS Code.
 *
 * Dois efeitos complementares: a lista em .vscode/settings.json reconstrói a
 * seleção a cada abertura da janela, e o marker em .git/ registra na janela
 * que já está aberta, sem esperar reload.
 *
 * A lista é substituída. Chamar com [] é a forma de esvaziar o Source
 * Control: zera a lista e remove todos os markers.
 *
 * @param {string[]} repos
 * @param {string} root
 * @param {{ verbose?: boolean }} [opts]
 * @returns {{ ok: boolean, activated: string[], skipped: string[], failed: string[] }}
 */
export function activateRepos(repos, root, opts = {}) {
  const { verbose = false } = opts;

  /** @type {string[]} */
  const gitRepos = [];
  /** @type {string[]} */
  const skipped = [];

  for (const name of repos) {
    if (isGitRepo(path.resolve(root, name))) gitRepos.push(name);
    else skipped.push(name);
  }

  if (verbose && skipped.length > 0) {
    console.error(`Ignorados (não são repositórios git): ${skipped.join(", ")}`);
  }

  if (verbose && repos.length > 0 && gitRepos.length === 0) {
    console.error("Nenhum repositório git para ativar no Source Control.");
  }

  const persisted = persistScanRepositories(root, gitRepos);
  if (persisted.error) {
    console.error(
      `[repos] ${persisted.path} não foi atualizado: ${persisted.error}. ` +
        "Corrija o arquivo à mão para a ativação sobreviver ao reload.",
    );
  }

  // Invariante: existe marker exatamente para quem está em
  // git.scanRepositories. Limpar antes de escrever, e só fora da lista,
  // garante que nenhum marker seja apagado e recriado no mesmo ciclo.
  if (persisted.list) cleanStaleMarkers(root, persisted.list);

  const { probed, failed } = probeRepos(gitRepos, root);

  if (verbose) {
    console.error(
      `\n→ Source Control: ${probed.length} repositório(s) ativado(s).`,
    );
    if (persisted.list) {
      console.error(
        `  git.scanRepositories: ${persisted.list.join(", ") || "(vazio)"}`,
      );
    }
    if (failed.length > 0) {
      console.error(`  falharam: ${failed.join(", ")}`);
    }
  }

  return {
    ok: failed.length === 0 && !persisted.error,
    activated: probed,
    skipped,
    failed,
  };
}
