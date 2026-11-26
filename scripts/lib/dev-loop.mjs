import { filterWithScript } from "./config.mjs";
import { runYarnParallel } from "./run.mjs";
import { confirmReselect, pickRepos } from "./select.mjs";

export const RESELECT_CONFIRM_MESSAGE =
  "Parou os servidores dev. Quer escolher repositórios de novo com a mesma seleção marcada?";

/**
 * Roda yarn dev em paralelo; se interrompido (Ctrl+C) em modo interativo,
 * pergunta se reescolhe repos com a última seleção confirmada pré-marcada.
 *
 * @param {{
 *   initialSelected: string[],
 *   discovered: string[],
 *   interactiveLoop: boolean,
 *   config: { nodeVersionByRepo: Record<string, string> },
 *   root: string,
 *   filterDev?: (selected: string[]) => { withScript: string[], skipped: string[] },
 *   runParallel?: (repos: string[], config: object, root: string) => Promise<{ interrupted: boolean }>,
 *   confirmFn?: (message: string) => Promise<boolean>,
 *   pickFn?: typeof pickRepos,
 *   confirmMessage?: string,
 *   pickMessage?: string,
 * }} options
 * @returns {Promise<void>}
 */
export async function runDevReselectLoop({
  initialSelected,
  discovered,
  interactiveLoop,
  config,
  root,
  filterDev = (selected) => filterWithScript(selected, "dev", root),
  runParallel = (repos, cfg, r) => runYarnParallel(repos, "dev", cfg, r),
  confirmFn = (message) => confirmReselect(message),
  pickFn = pickRepos,
  confirmMessage = RESELECT_CONFIRM_MESSAGE,
  pickMessage = "Quais repositórios rodar (dev)?",
}) {
  let selected = [...initialSelected];

  while (true) {
    const { withScript, skipped } = filterDev(selected);
    if (skipped.length) {
      console.error(`Sem script dev (ignorados): ${skipped.join(", ")}`);
    }
    if (withScript.length === 0) {
      console.error("Nenhum repo selecionado tem script dev.");
      process.exit(1);
    }

    const { interrupted } = await runParallel(withScript, config, root);

    if (!interrupted || !interactiveLoop) {
      return;
    }

    const again = await confirmFn(confirmMessage);
    if (!again) {
      return;
    }

    selected = await pickFn(discovered, pickMessage, (name) => name, {
      preselected: new Set(selected),
    });
  }
}
