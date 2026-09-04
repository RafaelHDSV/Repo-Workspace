import prompts from "prompts";

/**
 * Monta os choices do multiselect, marcando os que já estão ativos.
 *
 * @param {string[]} candidates
 * @param {(name: string) => string} titleFor
 * @param {Set<string>} preselected
 * @returns {{ title: string, value: string, selected: boolean }[]}
 */
export function buildChoices(candidates, titleFor, preselected) {
  return candidates.map((name) => ({
    title: titleFor(name),
    value: name,
    selected: preselected.has(name),
  }));
}

/**
 * @param {string[]} candidates
 * @param {string} message
 * @param {(name: string) => string} [titleFor]
 * @param {{ preselected?: Set<string>, min?: number }} [opts]
 * @returns {Promise<string[]>}
 */
export async function pickRepos(
  candidates,
  message,
  titleFor = (name) => name,
  opts = {},
) {
  const { preselected = new Set(), min = 1 } = opts;

  const response = await prompts({
    type: "multiselect",
    name: "repos",
    message,
    choices: buildChoices(candidates, titleFor, preselected),
    hint: "- Barra de espaço alterna. Enter confirma.",
    instructions: false,
    min,
  });

  if (response.repos === undefined) {
    console.error("Cancelado.");
    process.exit(0);
  }
  return response.repos;
}

/**
 * Resolve seleção: CLI explícita, --all / REPOS_SKIP_PROMPT, ou multiselect.
 * @param {{
 *   discovered: string[],
 *   all: boolean,
 *   cliRepos: string[],
 *   mode: string,
 *   message: string,
 *   titleFor?: (name: string) => string,
 *   skipPromptEnv?: string,
 *   allowInstallSkipWithoutTty?: boolean,
 *   preselected?: Set<string>,
 *   min?: number,
 * }} options
 * @returns {Promise<string[] | null>} null = saída antecipada sem erro (ex.: install sem TTY)
 */
export async function resolveSelection({
  discovered,
  all,
  cliRepos,
  mode,
  message,
  titleFor,
  skipPromptEnv = process.env.REPOS_SKIP_PROMPT,
  allowInstallSkipWithoutTty = false,
  preselected = new Set(),
  min = 1,
}) {
  const skipPrompt = skipPromptEnv === "1";
  const tty = process.stdin.isTTY;
  const wantsAll = all || skipPrompt;

  if (
    allowInstallSkipWithoutTty &&
    mode === "install" &&
    !tty &&
    !wantsAll &&
    cliRepos.length === 0
  ) {
    console.error(
      "[repos] Pulando yarn nos sub-repositórios (sem TTY, ex.: após yarn add). " +
        "No terminal: yarn install. Para forçar todos: yarn run install -- --all",
    );
    return null;
  }

  if (!wantsAll && cliRepos.length === 0 && !tty) {
    console.error(
      "Sem TTY: use --all, REPOS_SKIP_PROMPT=1, nomes após -- ou rode em terminal interativo.",
    );
    process.exit(1);
  }

  if (cliRepos.length > 0) {
    const unknown = cliRepos.filter((r) => !discovered.includes(r));
    if (unknown.length) {
      console.error(`Pastas desconhecidas ou ignoradas: ${unknown.join(", ")}`);
      console.error(`Disponíveis: ${discovered.join(", ")}`);
      process.exit(1);
    }
    return cliRepos;
  }

  if (wantsAll) {
    return [...discovered];
  }

  return pickRepos(discovered, message, titleFor, { preselected, min });
}
