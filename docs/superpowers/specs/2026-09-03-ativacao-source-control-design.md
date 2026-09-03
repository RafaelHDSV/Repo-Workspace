# Ativação de repositórios no Source Control

## Objetivo

Fazer com que um repositório apareça no Source Control do Cursor/VS Code de forma imediata e confiável, sem automação de interface, e garantir que a ativação sobreviva ao fechamento e reabertura do editor. O comando `yarn open` continua existindo como ativação isolada, e a mesma ativação passa a rodar embutida em `install`, `dev`, `test`, `setup` e `switch`.

## Contexto e problema

A raiz operacional (`--root` / `REPOS_ROOT`, na prática a pasta dos clones) tem 31 repositórios git. O `.vscode/settings.json` dessa raiz mantém `git.autoRepositoryDetection: "openEditors"` justamente para o painel não carregar os 31 na abertura.

A implementação das versões 1.4.0 a 1.4.8 ativava cada repositório abrindo um arquivo dele com foco (`cursor -r -g`), esperando 3000 ms e fechando a aba por keystroke de sistema (`SendKeys` no Windows, `osascript` no macOS, `xdotool` no Linux). Dois problemas relatados: repositórios que continuavam fora do painel e lentidão.

A causa raiz está na extensão Git do editor. Com `openEditors`, o registro do repositório só é disparado em `onDidChangeVisibleTextEditors`, ou seja, pelo editor **visível** — um por vez. Por isso o lote nunca funcionou e o loop sequencial com espera fixa era a única saída daquele caminho. Além disso, repositórios registrados por esse mecanismo não sobrevivem a um reload da janela: ao reabrir o editor, o painel volta a mostrar apenas os que tiverem arquivo visível restaurado.

## Mecanismos verificados

A investigação foi feita sobre o bundle da extensão (`resources/app/extensions/git/dist/main.js`) e confirmada empiricamente pelo log da extensão (`Git.log`).

### Watcher de `.git` (efeito imediato)

A extensão registra um watcher de todo o workspace, filtra os eventos cujo path contém `/.git` e, para paths que ainda não pertencem a um repositório conhecido, chama `openRepository` na raiz correspondente:

```js
let l = workspace.createFileSystemWatcher("**");
let d = filterEvent(anyEvent(l.onDidChange, l.onDidCreate, l.onDidDelete),
                    p => /\/\.git/.test(p.path));
filterEvent(d, p => !this.getRepository(p))(this.onPossibleGitRepositoryChange, ...)
```

A condição desse caminho é `autoRepositoryDetection !== false`, portanto `"openEditors"` e `true` ambos servem. Não há dependência de editor, de foco de janela nem de keystroke.

Verificação prática: criar um arquivo dentro de `<repo>/.git/` registra o repositório. Criar e apagar o arquivo em sequência imediata **não** registra — o watcher coalesce o par create/delete e não emite evento. O arquivo precisa persistir até o evento ser processado.

### `git.scanRepositories` (efeito persistente)

`scanWorkspaceFolders` percorre as subpastas até `repositoryScanMaxDepth` e, em seguida, adiciona ao conjunto os paths relativos declarados em `git.scanRepositories`. A função retorna antes de tudo isso se `autoRepositoryDetection` não for `true` nem `"subFolders"`.

`traverseWorkspaceFolder` com `maxDepth: 0` retorna lista vazia: a raiz não entra (só entram paths com `depth !== 0`) e nenhum filho é enfileirado. O schema declara `git.repositoryScanMaxDepth` como `number` sem mínimo, e `git.scanRepositories` como array com escopo `resource`, válido em settings de workspace.

A combinação `autoRepositoryDetection: true` + `repositoryScanMaxDepth: 0` + `scanRepositories: [...]` produz exatamente os repositórios listados, em toda abertura da janela, sem varrer os 31.

Não existe rescan em mudança de configuração: não há handler para `affectsConfiguration("git.autoRepositoryDetection")` no bundle. Gravar os settings só surte efeito no próximo reload da janela — daí a necessidade dos dois mecanismos juntos.

## Arquitetura

`scripts/lib/workspace.mjs` deixa de automatizar interface e passa a compor duas funções puras com um efeito de sistema de arquivos.

```
activateRepos(repos, root, opts)
├── cleanStaleMarkers(root, keep = repos)        → remove markers fora do conjunto
├── persistScanRepositories(root, repos, mode)   → .vscode/settings.json
│     autoRepositoryDetection: true
│     repositoryScanMaxDepth: 0
│     scanRepositories: união acumulada
└── probeRepos(repos, root)                      → efeito na janela aberta
      escreve <repo>/.git/.repo-workspace-activate para cada selecionado
```

`opts` é `{ mode: "merge" | "replace", verbose: boolean }`. O modo embutido usa `{ mode: "merge", verbose: false }`.

O marker é **escrito e nunca apagado na mesma execução**. Se o arquivo já existe, o conteúdo é reescrito (dispara `onDidChange`); se não existe, é criado (dispara `onDidCreate`). Isso elimina a corrida create/delete que fez o teste inicial falhar em dois de três repositórios, e dispensa qualquer espera: o processo pode encerrar imediatamente, porque o arquivo persiste até o evento ser processado.

A limpeza acontece na execução seguinte e só para repositórios que não estão no conjunto atual, de modo que nenhum marker é apagado e reescrito no mesmo ciclo. Não há `settle`, não há espera por repositório, e a variável `REPOS_ACTIVATE_SETTLE_MS` deixa de existir: a ativação dos 31 repositórios passa de aproximadamente 93 s para o custo de 31 escritas de arquivo.

## Componentes

| Função | Entrada | Saída | Depende de |
|---|---|---|---|
| `resolveScanRepositories(current, add, mode)` | lista atual, novos, `merge` ou `replace` | lista ordenada e sem duplicatas | nada (pura) |
| `persistScanRepositories(root, repos, mode)` | raiz, repositórios, modo | `{ path, list }` | `fs` |
| `probeRepos(repos, root)` | repositórios git válidos | `{ probed, failed }` | `fs` |
| `cleanStaleMarkers(root, keep)` | raiz, conjunto a preservar | quantidade removida | `fs` |
| `activateRepos(repos, root, opts)` | seleção do usuário, `{ mode, verbose }` | `{ ok, activated, skipped }` | as quatro acima |

`persistScanRepositories` faz merge no JSON existente, sem sobrescrever chaves de terceiros, e mantém a indentação de dois espaços já usada no arquivo.

## Interface

- `yarn open`: multiselect dos repositórios git da raiz; ativa os selecionados e imprime a lista persistida.
- `yarn open -- repo1 repo2`: ativa os informados.
- `yarn run open -- --all`: ativa todos.
- `yarn run open -- --only repo1 repo2`: grava a lista em modo `replace`, substituindo a anterior.
- `yarn run open -- --reset`: esvazia `scanRepositories` e remove todos os markers. Não abre seleção e não ativa nada; é a única forma do comando não terminar com repositório ativado.
- `REPOS_SKIP_ACTIVATE=1`: desliga a ativação, inclusive a embutida.

`REPOS_EDITOR` e `REPOS_ACTIVATE_SETTLE_MS` deixam de existir.

Os repositórios passados por posição (`yarn open -- repo1 repo2`) e o modo embutido somam à lista; só `--only` e `--reset` a reduzem.

## Integração nos outros comandos

`activateRepos` roda no início de `install`, `dev`, `test`, `setup` e `switch`, depois da seleção e antes do trabalho pesado, sobre os selecionados que são repositórios git — os que não são, ignora em silêncio.

No modo embutido a ativação é silenciosa e não fatal: falha de ativação nunca aborta o comando principal. Em `yarn open` o mesmo caminho roda em modo verboso.

## Erros e casos de borda

- **Editor fechado, ou com outra pasta aberta**: o probe não tem watcher escutando e não produz efeito. Não é erro. A lista em `scanRepositories` já foi gravada, então os repositórios aparecem sozinhos na próxima abertura do editor. É exatamente a lacuna que existe hoje.
- **Marker remanescente**: por desenho o arquivo sobrevive ao fim da execução. É inofensivo, porque um arquivo desconhecido na raiz do `.git` é ignorado pelo git e não aparece em `git status`. `cleanStaleMarkers` remove na execução seguinte os que ficaram fora do conjunto ativo, e `--reset` remove todos.
- **`.vscode/settings.json` inválido**: o comportamento atual reseta o objeto para `{}` e destrói os settings do usuário. Passa a avisar e abortar apenas a persistência, mantendo o probe.
- **Lista crescendo até os 31**: `--only` e `--reset` são a saída da acumulação.
- **Pasta sem `.git`** entre os selecionados: entra em `skipped`, sem erro.

## Código removido

Saem de `scripts/lib/workspace.mjs`: `EDITOR_CANDIDATES`, `PREFERRED_FILES`, `resolveEditorCommand`, `pickRepoFile`, `closeActiveEditor`, `closeRecentEditors`, `ensureOpenEditorsGitDetection` e os três blocos de automação de sistema operacional (PowerShell `SendKeys`, `osascript`, `xdotool`). A dependência do CLI do editor no `PATH` desaparece, e a implementação passa a ser idêntica nas três plataformas.

## Testes

`tests/workspace.test.mjs` é reescrito, já que `pickRepoFile` e `resolveEditorCommand` deixam de existir. Cobertura:

- `resolveScanRepositories`: merge, deduplicação, ordenação e modo `replace`.
- `persistScanRepositories`: cria `.vscode/`, preserva chaves alheias, grava as três chaves, e não destrói o arquivo quando o JSON é inválido.
- `probeRepos`: cria o marker quando ausente, reescreve quando presente, nunca apaga, e ignora pasta que não é repositório git.
- `cleanStaleMarkers`: remove marker de repositório fora do conjunto `keep`, preserva o dos que estão dentro, e não toca em outros arquivos do `.git`.
- `activateRepos`: respeita `REPOS_SKIP_ACTIVATE`, e no modo embutido não propaga falha.
- Parsing de `--only` e `--reset` em `tests/args.test.mjs`.

O watcher da extensão não é testável em unidade. A verificação manual entra no README como receita reproduzível, a mesma usada nesta investigação:

```bash
grep -o "Opened repository: c:.*" \
  "$(ls -t ~/AppData/Roaming/Cursor/logs/*/window*/exthost/vscode.git/Git.log | head -1)"
```

Decisão consciente: o tool **não** lê o `Git.log` em runtime para confirmar ativação. O caminho do log varia por versão e por fork do editor, e viraria nova fonte de fragilidade. A lista em `scanRepositories` é o estado auditável, e `yarn open` a imprime ao final.

## Efeito colateral aceito

`autoRepositoryDetection: true` é obrigatório para `scanRepositories` ser lido, e reativa o comportamento de `openEditors` como bônus: abrir um arquivo de um repositório fora da lista registra ele naquela sessão, sem entrar na lista persistida. Com `repositoryScanMaxDepth: 0`, isso não reintroduz a varredura dos 31.

## Documentação

`README.md` é atualizado na seção de Source Control: novo mecanismo, `--only` / `--reset`, remoção de `REPOS_EDITOR` e `REPOS_ACTIVATE_SETTLE_MS`, e a receita de verificação manual.
