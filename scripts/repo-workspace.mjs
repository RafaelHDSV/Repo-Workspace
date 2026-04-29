/**
 * Descobre pastas com package.json no diretório raiz do monorepo,
 * permite escolher quais rodar (prompt ou CLI) e executa install ou dev.
 *
 * Uso:
 *   yarn install                    → prompt multiselect
 *   yarn run install -- --all       → todos (yarn install embute flags; use run + --)
 *   yarn run install -- -- uxvision-web core
 *   yarn dev -- uxvision-web
 *   REPOS_SKIP_PROMPT=1 yarn dev    → todos sem prompt (CI / sem TTY)
 *
 * Após yarn add, o lifecycle install roda sem TTY: o script só instala
 * sub-repos em TTY, com --all, com nomes após -- ou com REPOS_SKIP_PROMPT=1.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import concurrently from "concurrently";
import prompts from "prompts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

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

function loadConfig() {
  const configPath = path.join(ROOT, "repos.config.json");
  const defaults = { ignore: ["node_modules", ".git"], nodeVersionByRepo: {} };
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

function discoverRepos(config) {
  const ignore = new Set(config.ignore);
  const names = fs
    .readdirSync(ROOT, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !ignore.has(d.name))
    .map((d) => d.name)
    .filter((name) => {
      const pkg = path.join(ROOT, name, "package.json");
      return fs.existsSync(pkg);
    })
    .sort((a, b) => a.localeCompare(b));

  return names;
}

/**
 * No Windows o PATH visível em processo costuma estar em `Path` (Pascal);
 * redefinir só `PATH` e ignorar o valor real quebra a busca por `cmd.exe` (spawn ENOENT).
 */
function withPrependedPathSegment(env, segment) {
  const next = { ...env };
  const existing = next.PATH || next.Path || next.path || "";
  const merged = segment ? `${segment}${path.delimiter}${existing}` : existing;
  next.PATH = merged;
  if (process.platform === "win32") {
    next.Path = merged;
  }
  return next;
}

function prependNodeToPath(version, env) {
  const nvmHome = env.NVM_HOME || env.NVM_SYMLINK;
  if (!version || !nvmHome) return { ...env };
  const v = String(version).startsWith("v") ? version : `v${version}`;
  const nodeBin = path.join(nvmHome, v);
  return withPrependedPathSegment(env, nodeBin);
}

function runYarnInstall(repo, config) {
  const cwd = path.join(ROOT, repo);
  const version = config.nodeVersionByRepo[repo];
  const env = prependNodeToPath(version, process.env);
  console.error(`\n→ ${repo}: yarn`);
  const r = spawnSync("yarn", [], { cwd, env, stdio: "inherit", shell: true });
  if (r.status !== 0) {
    console.error(`Falhou: yarn em ${repo} (código ${r.status})`);
    process.exit(r.status ?? 1);
  }
}

function hasDevScript(repo) {
  const pkgPath = path.join(ROOT, repo, "package.json");
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    return Boolean(pkg.scripts && pkg.scripts.dev);
  } catch {
    return false;
  }
}

function parseArgs(argv) {
  const mode = argv[2] === "dev" ? "dev" : "install";
  const rest = argv.slice(3);
  let all = false;
  const repos = [];
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === "--all") all = true;
    else if (rest[i] === "--") {
      repos.push(...rest.slice(i + 1));
      break;
    } else if (!rest[i].startsWith("-")) repos.push(rest[i]);
  }
  return { mode, all, cliRepos: repos };
}

async function pickRepos(candidates, mode) {
  const preselect = mode === "install";
  const response = await prompts({
    type: "multiselect",
    name: "repos",
    message: `Quais repositórios rodar (${mode})?`,
    choices: candidates.map((name) => ({
      title: name,
      value: name,
      selected: preselect,
    })),
    hint: "- Barra de espaço alterna. Enter confirma.",
    instructions: false,
    min: 1,
  });

  if (response.repos === undefined) {
    console.error("Cancelado.");
    process.exit(0);
  }
  return response.repos;
}

async function main() {
  const { mode, all, cliRepos } = parseArgs(process.argv);
  const config = loadConfig();
  const discovered = discoverRepos(config);

  if (discovered.length === 0) {
    if (mode === "install") {
      console.error(
        "[repos] Nenhuma subpasta irmã com package.json. " +
          "Só as dependências desta raiz foram instaladas. " +
          "Quando tiveres os outros repositórios, coloca este projeto na mesma pasta pai que eles.",
      );
      return;
    }
    console.error("Nenhum repositório encontrado (pastas com package.json na raiz).");
    process.exit(1);
  }

  const skipPrompt = process.env.REPOS_SKIP_PROMPT === "1";
  const tty = process.stdin.isTTY;
  const wantsAll = all || skipPrompt;

  if (
    mode === "install" &&
    !tty &&
    !wantsAll &&
    cliRepos.length === 0
  ) {
    console.error(
      "[repos] Pulando yarn nos sub-repositórios (sem TTY, ex.: após yarn add). " +
        "No terminal: yarn install. Para forçar todos: yarn run install -- --all",
    );
    process.exit(0);
  }

  if (!wantsAll && cliRepos.length === 0 && !tty) {
    console.error(
      "Sem TTY: use --all, REPOS_SKIP_PROMPT=1, nomes após -- ou rode em terminal interativo.",
    );
    process.exit(1);
  }

  let selected;
  if (cliRepos.length > 0) {
    const unknown = cliRepos.filter((r) => !discovered.includes(r));
    if (unknown.length) {
      console.error(`Pastas desconhecidas ou ignoradas: ${unknown.join(", ")}`);
      console.error(`Disponíveis: ${discovered.join(", ")}`);
      process.exit(1);
    }
    selected = cliRepos;
  } else if (wantsAll) {
    selected = [...discovered];
  } else {
    selected = await pickRepos(discovered, mode);
  }

  if (mode === "install") {
    for (const repo of selected) {
      runYarnInstall(repo, config);
    }
    console.error("\nConcluído: yarn em todos os selecionados.");
    return;
  }

  // dev
  const withDev = selected.filter(hasDevScript);
  const skipped = selected.filter((r) => !withDev.includes(r));
  if (skipped.length) {
    console.error(`Sem script dev (ignorados): ${skipped.join(", ")}`);
  }
  if (withDev.length === 0) {
    console.error("Nenhum repo selecionado tem script dev.");
    process.exit(1);
  }

  const commands = withDev.map((repo) => {
    const cwd = path.join(ROOT, repo);
    const version = config.nodeVersionByRepo[repo];
    const env = prependNodeToPath(version, process.env);
    return {
      command: "yarn dev",
      name: repo,
      cwd,
      env,
    };
  });

  const prefixColors = withDev.map((_, i) => COLORS[i % COLORS.length]);

  const { result } = concurrently(commands, {
    prefix: "name",
    prefixColors,
    restartTries: 0,
  });
  await result;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
