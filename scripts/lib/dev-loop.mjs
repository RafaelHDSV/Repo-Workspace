import { confirmReselect, pickRepos } from "./select.mjs";

export const RESELECT_CONFIRM_MESSAGE =
  "Parou os servidores dev. Quer escolher repositórios de novo com a mesma seleção marcada?";

/** Delay para o Ctrl+C que matou o concurrently não cancelar o confirm. */
export const RESELECT_SETTLE_MS = 200;

/**
 * Roda a fase dev em paralelo; se interrompido (Ctrl+C) em modo interativo,
 * pergunta se reescolhe repos com a última seleção confirmada pré-marcada.
 *
 * `runParallel` deve aceitar a seleção completa (ou a filtrada se `filterDev`
 * for passado) e devolver `{ interrupted }`. Em produção, use `runDevParallel`
 * (Yarn + Deno); `filterDev` fica só para testes.
 *
 * @param {{
 *   initialSelected: string[],
 *   discovered: string[],
 *   interactiveLoop: boolean,
 *   config: { nodeVersionByRepo: Record<string, string> },
 *   root: string,
 *   runParallel: (repos: string[], config: object, root: string) => Promise<{ interrupted: boolean }>,
 *   filterDev?: (selected: string[]) => { withScript: string[], skipped: string[] },
 *   confirmFn?: (message: string, promptFn?: unknown, opts?: object) => Promise<boolean>,
 *   pickFn?: typeof pickRepos,
 *   confirmMessage?: string,
 *   pickMessage?: string,
 *   settleMs?: number,
 * }} options
 * @returns {Promise<void>}
 */
export async function runDevReselectLoop({
  initialSelected,
  discovered,
  interactiveLoop,
  config,
  root,
  runParallel,
  filterDev,
  confirmFn = (message, _promptFn, opts) =>
    confirmReselect(message, undefined, opts),
  pickFn = pickRepos,
  confirmMessage = RESELECT_CONFIRM_MESSAGE,
  pickMessage = "Quais repositórios rodar (dev)?",
  settleMs = RESELECT_SETTLE_MS,
}) {
  if (typeof runParallel !== "function") {
    throw new Error("runDevReselectLoop: runParallel é obrigatório");
  }

  // Mantém um listener de SIGINT enquanto o loop interativo vive: depois que o
  // concurrently remove o dele no onFinish, o default do Node (sair) não corre.
  const holdSigint = () => {};
  if (interactiveLoop) {
    process.on("SIGINT", holdSigint);
    if (process.platform === "win32") {
      process.on("SIGBREAK", holdSigint);
    }
  }

  let selected = [...initialSelected];

  try {
    while (true) {
      let repos = selected;
      if (filterDev) {
        const { withScript, skipped } = filterDev(selected);
        if (skipped.length) {
          console.error(
            `Sem script/task dev (ignorados): ${skipped.join(", ")}`,
          );
        }
        if (withScript.length === 0) {
          console.error(
            "Nenhum repo selecionado tem script yarn dev ou deno task dev.",
          );
          process.exit(1);
        }
        repos = withScript;
      }

      const { interrupted } = await runParallel(repos, config, root);

      if (!interrupted || !interactiveLoop) {
        return;
      }

      console.error(`\n${confirmMessage}`);
      const again = await confirmFn(confirmMessage, undefined, { settleMs });
      if (!again) {
        console.error("Encerrado.");
        return;
      }

      selected = await pickFn(discovered, pickMessage, (name) => name, {
        preselected: new Set(selected),
      });
    }
  } finally {
    if (interactiveLoop) {
      process.off("SIGINT", holdSigint);
      if (process.platform === "win32") {
        process.off("SIGBREAK", holdSigint);
      }
    }
  }
}
