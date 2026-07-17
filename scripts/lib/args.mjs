const YARN_MODES = new Set(["install", "dev", "tsc", "setup"]);
const ALL_MODES = new Set([...YARN_MODES, "switch"]);

/**
 * @param {string[]} argv process.argv
 * @returns
 *   | { help: true, mode?: string }
 *   | { mode: 'install'|'dev'|'tsc'|'setup', all: boolean, cliRepos: string[] }
 *   | { mode: 'switch', branch: string, all: boolean, cliRepos: string[] }
 */
export function parseArgs(argv) {
  const mode = argv[2];
  const rest = argv.slice(3);

  if (!mode || mode === "--help" || mode === "-h") {
    return { help: true };
  }

  if (!ALL_MODES.has(mode)) {
    throw new Error(
      `Modo desconhecido: ${mode}. Use install, dev, tsc, setup ou switch.`,
    );
  }

  if (mode === "switch") {
    return parseSwitchArgs(rest);
  }

  return parseYarnModeArgs(mode, rest);
}

/**
 * @param {string} mode
 * @param {string[]} rest
 */
function parseYarnModeArgs(mode, rest) {
  let all = false;
  const repos = [];
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === "--help" || rest[i] === "-h") {
      return { help: true, mode };
    }
    if (rest[i] === "--all") all = true;
    else if (rest[i] === "--") {
      repos.push(...rest.slice(i + 1));
      break;
    } else if (!rest[i].startsWith("-")) repos.push(rest[i]);
    else throw new Error(`Flag desconhecida: ${rest[i]}`);
  }
  return { mode, all, cliRepos: repos };
}

/**
 * @param {string[]} rest
 */
function parseSwitchArgs(rest) {
  let branch = null;
  /** @type {string[]} */
  const repos = [];
  const positional = [];
  let all = false;

  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];

    if (arg === "--branch" || arg === "-b") {
      branch = rest[++i];
      if (!branch) throw new Error("Informe o valor de --branch / -b.");
      continue;
    }

    if (arg === "--repos" || arg === "-r") {
      const value = rest[++i];
      if (!value) throw new Error("Informe o valor de --repos / -r.");
      repos.push(
        ...value
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      );
      continue;
    }

    if (arg === "--all") {
      all = true;
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      return { help: true, mode: "switch" };
    }

    if (arg === "--") {
      positional.push(...rest.slice(i + 1));
      break;
    }

    if (arg.startsWith("-")) {
      throw new Error(`Flag desconhecida: ${arg}`);
    }

    positional.push(arg);
  }

  if (!branch && positional.length > 0) {
    branch = positional.shift();
  }

  if (repos.length === 0 && positional.length > 0) {
    repos.push(...positional);
  }

  if (!branch) {
    throw new Error("Informe a branch: yarn switch <branch>");
  }

  return { mode: "switch", branch, all, cliRepos: repos };
}

export function printHelp() {
  console.log(`Uso:
  yarn install              → yarn nos repositórios (menu ou CLI)
  yarn run install -- --all
  yarn run install -- -- api web
  yarn dev                  → yarn dev em paralelo
  yarn tsc                  → yarn tsc em paralelo
  yarn setup                → yarn e depois yarn dev (mesma seleção)
  yarn switch <branch>      → troca de branch nos clones git
  yarn switch <branch> -- --all
  yarn switch <branch> -- core api

Flags comuns: --all, nomes após --, REPOS_SKIP_PROMPT=1
switch: working tree sujo pula o repo; sem fetch/pull/force/stash.`);
}
