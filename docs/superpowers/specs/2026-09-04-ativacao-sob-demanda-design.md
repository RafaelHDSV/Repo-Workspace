# Ativação sob demanda no Source Control

> Substitui o modelo acumulativo definido em [`2026-09-03-ativacao-source-control-design.md`](2026-09-03-ativacao-source-control-design.md). O mecanismo daquele documento — marker em `.git/` mais `git.scanRepositories` — continua válido; muda quem escreve na lista e com que semântica.

## Objetivo

Fazer o Source Control do Cursor/VS Code mostrar exatamente os repositórios escolhidos na última execução de `yarn open`, e nada além disso. A lista deixa de crescer sozinha.

## Contexto e problema

A versão 1.5.0 grava `git.scanRepositories` em modo `merge` por padrão e roda a mesma ativação embutida em `install`, `dev`, `test`, `setup` e `switch`. As duas decisões se somam: cada `yarn dev` acrescenta à lista os repositórios daquela rodada, e nada nunca sai. Em um dia de uso a lista chegou aos 31 repositórios da raiz, com marker em todos eles — o resultado prático é idêntico ao que `git.autoRepositoryDetection: "openEditors"` existia para evitar.

O comportamento desejado já estava implementado, mas atrás de `yarn run open -- --only`. O problema é de padrão, não de mecanismo.

## Decisões

1. **`replace` é o único modo.** `yarn open` grava exatamente a seleção.
2. **A ativação embutida sai** de `install`, `dev`, `test`, `setup` e `switch`. Só `open` toca no Source Control.
3. **O multiselect abre pré-marcado** com a lista ativa, para que substituir não obrigue a remontar a seleção de memória.
4. **Duas destas decisões foram amendadas durante a implementação.** O guard de `gitRepos.length === 0` foi restrito em vez de cair por inteiro: removê-lo de vez deixava uma lista não vazia de nomes que não são repositórios git esvaziar o painel e ainda reportar sucesso, então o guard passou a mirar exatamente esse caso (`repos.length > 0 && gitRepos.length === 0`), preservando lista vazia como resultado legítimo. E `activateRepos` passou a retornar cedo quando `persistScanRepositories` falha, sem chamar o probe: escrever markers com a persistência falha deixava a lista e os markers fora de sincronia, o oposto da invariante que este documento descreve.

## Arquitetura

`scripts/lib/workspace.mjs` perde o eixo de modo e ganha um leitor do estado atual.

```
activateRepos(repos, root, opts)
├── persistScanRepositories(root, repos)      → .vscode/settings.json
│     └── normalizeRepoList(repos)
├── cleanStaleMarkers(root, keep = repos)     → remove markers fora da seleção
└── probeRepos(repos, root)                   → efeito na janela aberta

readScanRepositories(root)                    → lista atual, para pré-marcar o menu
```

`opts` reduz-se a `{ verbose: boolean }`.

### `resolveScanRepositories` vira `normalizeRepoList`

Sem `merge`, o argumento `current` deixa de ser lido e o parâmetro `mode` não tem segundo valor. A função colapsa em normalização pura: descarta o que não é string, apara espaços e barras finais, deduplica e ordena por `localeCompare`.

```js
normalizeRepoList(list) → string[]
```

`persistScanRepositories(root, repos)` perde o terceiro argumento e passa a gravar `normalizeRepoList(repos)` direto, mantendo o merge no **JSON** (chaves de terceiros preservadas) — que é coisa diferente do merge na **lista**, este sim removido.

### `resetActivation` é absorvida por `activateRepos`

Com replace-only, `activateRepos([], root)` já significa "lista vazia e nenhum marker": `persistScanRepositories(root, [])` grava a lista vazia e `cleanStaleMarkers(root, [])` remove todos os markers. A função dedicada deixa de existir.

Para isso, o guard que retornava `{ ok: false }` sempre que `gitRepos.length === 0` foi restrito, não removido: passa a disparar só quando `repos.length > 0 && gitRepos.length === 0`, ou seja, pedido não vazio que não resolve para nenhum repositório git. Lista vazia continua sendo resultado legítimo e segue adiante sem cair no guard. O aviso "Nenhum repositório git para ativar" continua, em modo verboso, apenas quando `repos` não era vazio e todos foram descartados por não serem repositórios git.

### Ordem das operações

`persistScanRepositories` roda antes de `cleanStaleMarkers`, e `probeRepos` por último. A invariante do documento anterior se mantém: existe marker exatamente para quem está em `git.scanRepositories`, e nenhum marker é apagado e recriado no mesmo ciclo, porque a limpeza só alcança nomes fora da seleção.

### `readScanRepositories`

Lê `git.scanRepositories` de `<root>/.vscode/settings.json` e devolve `string[]`. **Nunca lança**: arquivo ausente, JSON inválido, conteúdo que não é objeto, ou chave ausente resultam em lista vazia. É um insumo de conveniência para a interface; um settings corrompido degrada o menu para "nada pré-marcado", não quebra o comando. A validação com mensagem de erro continua sendo responsabilidade de `persistScanRepositories`.

## Componentes

| Função | Entrada | Saída | Muda |
|---|---|---|---|
| `normalizeRepoList(list)` | lista crua | lista ordenada e sem duplicatas | renomeada de `resolveScanRepositories`, sem `current` e sem `mode` |
| `readScanRepositories(root)` | raiz | `string[]` | nova |
| `persistScanRepositories(root, repos)` | raiz, seleção | `{ path, list, error }` | perde `mode` |
| `probeRepos(repos, root)` | seleção, raiz | `{ probed, failed }` | inalterada |
| `cleanStaleMarkers(root, keep)` | raiz, conjunto a preservar | quantidade removida | inalterada |
| `activateRepos(repos, root, opts)` | seleção, raiz, `{ verbose }` | `{ ok, activated, skipped, failed }` | perde `mode`, aceita lista vazia, absorve `resetActivation` |
| `resetActivation(root)` | — | — | removida |

## Interface

### Multiselect pré-marcado

`pickRepos(candidates, message, titleFor)` ganha um quarto parâmetro opcional:

```js
pickRepos(candidates, message, titleFor, { preselected = new Set(), min = 1 })
```

`selected` de cada choice passa a ser `preselected.has(name)`. `min` é repassado ao `prompts`.

`resolveSelection` repassa ambos, e o handler de `open` chama com `preselected: new Set(readScanRepositories(root))` e `min: 0`. Os demais modos mantêm o comportamento atual (nada marcado, `min: 1`), porque ali seleção vazia é engano do usuário, não intenção.

`min: 0` em `open` é o que permite desmarcar tudo e confirmar para esvaziar o Source Control pelo próprio menu.

### Comandos

| Comando | Efeito |
|---|---|
| `yarn open` | Menu pré-marcado com os ativos; grava exatamente a seleção |
| `yarn open -- repo1 repo2` | Grava exatamente esses dois |
| `yarn run open -- --all` | Todos os repositórios git da raiz |
| `yarn run open -- --reset` | Lista vazia e todos os markers removidos |

`--reset` sobrevive como atalho não interativo — o caminho pelo menu exige TTY. Passa a ser uma linha chamando `activateRepos([], root, { verbose: true })`.

### Removidos

- **`--only`**: virou o padrão. Passa a ser flag desconhecida, com o erro habitual de `parseYarnModeArgs`.
- **`REPOS_SKIP_ACTIVATE`**: existia para desligar a ativação embutida. Sem ela, restaria desligar a ativação dentro do único comando cuja função é ativar. `--reset` cobre o caso real.

## Migração

Não há passo manual. No primeiro `yarn open` depois da mudança, o menu abre com os 31 pré-marcados — o estado real de hoje —, o usuário desmarca o que não quer, e a confirmação grava a lista reduzida e apaga os markers dos removidos.

## Erros e casos de borda

- **Seleção vazia confirmada no menu**: resultado válido. Lista zerada, markers removidos, saída verbosa informando `(vazio)`.
- **`.vscode/settings.json` inválido**: `readScanRepositories` devolve lista vazia (menu sem pré-marcação) e `persistScanRepositories` avisa e aborta só a persistência, preservando o arquivo. `activateRepos` retorna nesse ponto — o probe não roda, nenhum marker é escrito, e nada é atualizado: preferível a lista e os markers ficarem parados no estado anterior do que os dois efeitos saírem de sincronia.
- **Pasta sem `.git`** entre os selecionados: entra em `skipped`, sem erro — inalterado.
- **Editor fechado**: o probe não tem watcher escutando. Não é erro; a lista persistida resolve na próxima abertura — inalterado.
- **Repositórios em pastas ignoradas** (`.tools/`): continuam fora da lista, e continuam aparecendo ao abrir um arquivo deles, porque `git.autoRepositoryDetection: true` preserva o comportamento de `openEditors`.

## Testes

`tests/workspace.test.mjs`:

- `normalizeRepoList`: deduplicação, ordenação, apara de barra final, descarte de não-strings, e ausência de qualquer influência de lista anterior.
- `readScanRepositories`: arquivo ausente, JSON inválido, conteúdo não-objeto, chave ausente e lista válida — os quatro primeiros devolvendo `[]` sem lançar.
- `persistScanRepositories`: grava as três chaves, preserva chaves de terceiros, substitui a lista anterior em vez de somar, e não destrói o arquivo com JSON inválido.
- `activateRepos([])`: esvazia a lista e remove todos os markers, e retorna `ok: true`.
- `activateRepos`: com seleção parcial, remove o marker dos não selecionados e preserva o dos selecionados.
- `probeRepos` e `cleanStaleMarkers`: cobertura atual preservada.
- Some o teste de `REPOS_SKIP_ACTIVATE`.

`tests/args.test.mjs`: `--only` passa a lançar `Flag desconhecida`; `--reset` continua aceito só em `open`.

Cobertura de `select.mjs`: `preselected` marca os choices certos e `min: 0` é repassado.

`tests/smoke.test.mjs`: ajustar a expectativa de que `install`/`dev` não escrevem em `.vscode/settings.json`.

O watcher da extensão continua fora do alcance de teste unitário. A receita de verificação manual do README permanece.

## Documentação

`README.md`, seção de Source Control: a frase "a lista acumula" é substituída pela semântica de substituição; a menção à ativação embutida em `install`, `dev`, `test`, `setup` e `switch` sai; `--only` e `REPOS_SKIP_ACTIVATE` saem da tabela de flags; entra a nota do menu pré-marcado e do "desmarcar tudo esvazia". O bloco de ajuda em `printHelp` acompanha.
