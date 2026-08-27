/**
 * Centralizador de comandos em múltiplos repositórios irmãos.
 *
 * Uso:
 *   yarn install / yarn run install -- --all / yarn run install -- -- api web
 *   yarn dev [-- api]
 *   yarn test [-- api]
 *   yarn setup [-- api]     → yarn sequencial + yarn dev paralelo (mesma seleção)
 *   yarn open [-- api]      → adiciona repos ao Cursor/VS Code (Source Control)
 *   yarn switch <branch> [-- --all | -- repo1 repo2]
 *   REPOS_SKIP_PROMPT=1 yarn dev
 *   --root <path> / REPOS_ROOT / --config <file>  (raiz/config externos)
 *
 * Após yarn add, o lifecycle install roda sem TTY: o script só instala
 * sub-repos em TTY, com --all, com nomes após -- ou com REPOS_SKIP_PROMPT=1.
 */
import { parseArgs, printHelp } from "./lib/args.mjs";
import {
  discoverPackageRepos,
  filterWithScript,
  loadConfig,
} from "./lib/config.mjs";
import {
  checkoutRepos,
  currentBranchName,
  discoverGitRepos,
} from "./lib/git.mjs";
import { resolveRoot } from "./lib/root.mjs";
import {
  runCommandsParallel,
  runYarnInstallSequential,
  runYarnParallel,
} from "./lib/run.mjs";
import { resolveSelection } from "./lib/select.mjs";
import { resolveTestCommands } from "./lib/test.mjs";
import { activateRepos } from "./lib/workspace.mjs";
import path from "node:path";

/**
 * @param {object} parsed
 * @param {object} config
 * @param {string} modeLabel
 * @param {string} root
 */
async function selectPackageRepos(parsed, config, modeLabel, root) {
  const discovered = discoverPackageRepos(config, root);

  if (discovered.length === 0) {
    if (parsed.cliRepos.length > 0) {
      console.error(
        `Pastas desconhecidas ou ignoradas: ${parsed.cliRepos.join(", ")}`,
      );
      console.error("Disponíveis: (nenhum)");
      process.exit(1);
    }
    if (parsed.mode === "install") {
      console.error(
        "[repos] Nenhuma subpasta irmã com package.json. " +
          "Só as dependências desta raiz foram instaladas. " +
          "Quando tiver os outros repositórios, coloque este projeto na mesma pasta pai que eles.",
      );
      return null;
    }
    console.error(
      "Nenhum repositório encontrado (pastas com package.json na raiz).",
    );
    process.exit(1);
  }

  return resolveSelection({
    discovered,
    all: parsed.all,
    cliRepos: parsed.cliRepos,
    mode: parsed.mode,
    message: `Quais repositórios rodar (${modeLabel})?`,
    allowInstallSkipWithoutTty: parsed.mode === "install",
  });
}

/**
 * @param {string[] | null} selected
 * @param {string} root
 */
function activateSelected(selected, root) {
  if (!selected?.length) return;
  activateRepos(selected, root);
}

async function runInstall(parsed, config, root) {
  const selected = await selectPackageRepos(parsed, config, "install", root);
  if (selected === null) return;
  activateSelected(selected, root);
  runYarnInstallSequential(selected, config, root);
}

async function runParallelScript(parsed, config, scriptName, root) {
  const selected = await selectPackageRepos(
    parsed,
    config,
    scriptName,
    root,
  );
  if (selected === null) return;

  activateSelected(selected, root);

  const { withScript, skipped } = filterWithScript(
    selected,
    scriptName,
    root,
  );
  if (skipped.length) {
    console.error(`Sem script ${scriptName} (ignorados): ${skipped.join(", ")}`);
  }
  if (withScript.length === 0) {
    console.error(`Nenhum repo selecionado tem script ${scriptName}.`);
    process.exit(1);
  }

  await runYarnParallel(withScript, scriptName, config, root);
}

async function runTests(parsed, config, root) {
  const discovered = discoverPackageRepos(config, root);

  let selected;
  if (parsed.cliRepos.length > 0) {
    const unknown = parsed.cliRepos.filter(
      (repo) => !discovered.includes(repo),
    );
    if (unknown.length) {
      console.error(`Pastas desconhecidas ou ignoradas: ${unknown.join(", ")}`);
      console.error(`Disponíveis: ${discovered.join(", ")}`);
      process.exit(1);
    }
    selected = parsed.cliRepos;
  } else {
    const allResolved = resolveTestCommands(discovered, config, root);
    if (allResolved.commands.length === 0) {
      console.error("Nenhum repositório com suíte de testes foi encontrado.");
      process.exit(1);
    }
    const commandByRepo = new Map(
      allResolved.commands.map(({ repo, command }) => [repo, command]),
    );
    const runnableRepos = allResolved.commands.map(({ repo }) => repo);
    selected = await resolveSelection({
      discovered: runnableRepos,
      all: parsed.all,
      cliRepos: [],
      mode: "test",
      message: "Quais repositórios testar?",
      titleFor: (repo) => `${repo}  (${commandByRepo.get(repo)})`,
    });
  }

  if (selected === null) return;

  activateSelected(selected, root);

  const { commands, skipped } = resolveTestCommands(selected, config, root);
  if (skipped.length) {
    console.error(`Sem suíte de testes (ignorados): ${skipped.join(", ")}`);
  }
  if (commands.length === 0) {
    console.error("Nenhum repo selecionado possui suíte de testes.");
    process.exit(1);
  }

  await runCommandsParallel(commands, config, root, { CI: "1" });
}

async function runSetup(parsed, config, root) {
  const selected = await selectPackageRepos(parsed, config, "setup", root);
  if (selected === null) return;

  activateSelected(selected, root);

  runYarnInstallSequential(selected, config, root);

  const { withScript, skipped } = filterWithScript(selected, "dev", root);
  if (skipped.length) {
    console.error(`Sem script dev (ignorados): ${skipped.join(", ")}`);
  }
  if (withScript.length === 0) {
    console.error("Nenhum repo selecionado tem script dev.");
    process.exit(1);
  }

  console.error("\n→ Iniciando yarn dev nos selecionados com script dev…");
  await runYarnParallel(withScript, "dev", config, root);
}

async function runOpen(parsed, config, root) {
  const discovered = discoverGitRepos(root, config.ignore);

  if (discovered.length === 0) {
    console.error("Nenhum repositório git encontrado na raiz.");
    process.exit(1);
  }

  const selected = await resolveSelection({
    discovered,
    all: parsed.all,
    cliRepos: parsed.cliRepos,
    mode: "open",
    message: "Quais repositórios adicionar ao Source Control?",
    titleFor: (name) => {
      const current = currentBranchName(path.join(root, name));
      return `${name}  (${current})`;
    },
  });

  if (selected === null) return;

  const { ok, activated } = activateRepos(selected, root);
  if (!ok && activated.length === 0) {
    process.exit(1);
  }
}

async function runSwitch(parsed, config, root) {
  const discovered = discoverGitRepos(root, config.ignore);

  if (discovered.length === 0) {
    console.error("Nenhum repositório git encontrado na raiz.");
    process.exit(1);
  }

  const selected = await resolveSelection({
    discovered,
    all: parsed.all,
    cliRepos: parsed.cliRepos,
    mode: "switch",
    message: `Quais repositórios mudar para ${parsed.branch}?`,
    titleFor: (name) => {
      const current = currentBranchName(path.join(root, name));
      return `${name}  (${current})`;
    },
  });

  if (selected === null) return;

  activateSelected(selected, root);

  const result = checkoutRepos({
    branch: parsed.branch,
    repos: selected,
    reposRoot: root,
  });
  process.exit(result.exitCode);
}

async function main() {
  let parsed;
  try {
    parsed = parseArgs(process.argv);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`erro: ${message}`);
    console.error("");
    printHelp();
    process.exit(1);
  }

  if (parsed.help) {
    printHelp();
    process.exit(0);
  }

  const root = resolveRoot({ rootFlag: parsed.root });
  const config = loadConfig(root, parsed.config);

  switch (parsed.mode) {
    case "install":
      await runInstall(parsed, config, root);
      break;
    case "dev":
      await runParallelScript(parsed, config, "dev", root);
      break;
    case "test":
      await runTests(parsed, config, root);
      break;
    case "setup":
      await runSetup(parsed, config, root);
      break;
    case "open":
      await runOpen(parsed, config, root);
      break;
    case "switch":
      await runSwitch(parsed, config, root);
      break;
    default:
      printHelp();
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
