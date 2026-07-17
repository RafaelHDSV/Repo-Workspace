/**
 * Centralizador de comandos em múltiplos repositórios irmãos.
 *
 * Uso:
 *   yarn install / yarn run install -- --all / yarn run install -- -- api web
 *   yarn dev [-- api]
 *   yarn test [-- api]
 *   yarn setup [-- api]     → yarn sequencial + yarn dev paralelo (mesma seleção)
 *   yarn switch <branch> [-- --all | -- repo1 repo2]
 *   REPOS_SKIP_PROMPT=1 yarn dev
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
import { ROOT } from "./lib/root.mjs";
import {
  runCommandsParallel,
  runYarnInstallSequential,
  runYarnParallel,
} from "./lib/run.mjs";
import { resolveSelection } from "./lib/select.mjs";
import { resolveTestCommands } from "./lib/test.mjs";
import path from "node:path";

async function selectPackageRepos(parsed, config, modeLabel) {
  const discovered = discoverPackageRepos(config, ROOT);

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

async function runInstall(parsed, config) {
  const selected = await selectPackageRepos(parsed, config, "install");
  if (selected === null) return;
  runYarnInstallSequential(selected, config, ROOT);
}

async function runParallelScript(parsed, config, scriptName) {
  const selected = await selectPackageRepos(parsed, config, scriptName);
  if (selected === null) return;

  const { withScript, skipped } = filterWithScript(selected, scriptName, ROOT);
  if (skipped.length) {
    console.error(`Sem script ${scriptName} (ignorados): ${skipped.join(", ")}`);
  }
  if (withScript.length === 0) {
    console.error(`Nenhum repo selecionado tem script ${scriptName}.`);
    process.exit(1);
  }

  await runYarnParallel(withScript, scriptName, config, ROOT);
}

async function runTests(parsed, config) {
  const discovered = discoverPackageRepos(config, ROOT);

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
    const allResolved = resolveTestCommands(discovered, config, ROOT);
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

  const { commands, skipped } = resolveTestCommands(selected, config, ROOT);
  if (skipped.length) {
    console.error(`Sem suíte de testes (ignorados): ${skipped.join(", ")}`);
  }
  if (commands.length === 0) {
    console.error("Nenhum repo selecionado possui suíte de testes.");
    process.exit(1);
  }

  await runCommandsParallel(commands, config, ROOT, { CI: "1" });
}

async function runSetup(parsed, config) {
  const selected = await selectPackageRepos(parsed, config, "setup");
  if (selected === null) return;

  runYarnInstallSequential(selected, config, ROOT);

  const { withScript, skipped } = filterWithScript(selected, "dev", ROOT);
  if (skipped.length) {
    console.error(`Sem script dev (ignorados): ${skipped.join(", ")}`);
  }
  if (withScript.length === 0) {
    console.error("Nenhum repo selecionado tem script dev.");
    process.exit(1);
  }

  console.error("\n→ Iniciando yarn dev nos selecionados com script dev…");
  await runYarnParallel(withScript, "dev", config, ROOT);
}

async function runSwitch(parsed, config) {
  const discovered = discoverGitRepos(ROOT, config.ignore);

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
      const current = currentBranchName(path.join(ROOT, name));
      return `${name}  (${current})`;
    },
  });

  if (selected === null) return;

  const result = checkoutRepos({
    branch: parsed.branch,
    repos: selected,
    reposRoot: ROOT,
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

  const config = loadConfig(ROOT);

  switch (parsed.mode) {
    case "install":
      await runInstall(parsed, config);
      break;
    case "dev":
      await runParallelScript(parsed, config, "dev");
      break;
    case "test":
      await runTests(parsed, config);
      break;
    case "setup":
      await runSetup(parsed, config);
      break;
    case "switch":
      await runSwitch(parsed, config);
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
