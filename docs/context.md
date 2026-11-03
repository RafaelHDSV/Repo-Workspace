# repo-workspace — contexto

> **Para que serve:** hub obrigatório da regra `ai-context` — o que o projeto é e para qual documento ir antes de editar código
> **Fonte da verdade:** os documentos do índice; cada um declara os arquivos de código que descreve
> **Relacionados:** [especificacao](especificacao.md) · [ambiente-e-operacao](ambiente-e-operacao.md) · [DESIGN](DESIGN.md)

Leia este arquivo no início de qualquer prompt. Detalhe técnico vive no documento dono, não aqui.

## Objetivo

Hub Yarn local que orquestra vários repositórios Git irmãos: `yarn`, `yarn dev`, `yarn test`, `yarn setup` e `yarn switch` a partir de um único lugar.

## Stack e operação

Dependências declaradas em `package.json` (amostra): concurrently, prompts.

## Decisões fixas

1. Living docs canônicos (board#7): os 12 documentos do índice abaixo existem neste repositório.
2. Código vence documentação; atualize o dono no mesmo turno em que o comportamento mudar.
3. README é pitch vendável; setup/ops ficam em `docs/ambiente-e-operacao.md`.

## Estado atual

Resumo curto — detalhe em [especificacao](especificacao.md); histórico em [historico-de-mudancas](historico-de-mudancas.md) e [CHANGELOG](../CHANGELOG.md).

# Especificação

> **Para que serve:** o que o hub multi-repo faz.
> **Fonte da verdade:** `scripts/repo-workspace.mjs`.
> **Relacionados:** [context](context.md)

## Comandos

| Comando | Papel |
|---|---|
| install / yarn | Instala deps nas subpastas elegíveis |
| dev | Sobe dev nos selecionados |
| test | Roda testes |
| setup | install + dev |
| switch | Troca branch nos clones com `.git` |

## Índice

| Documento | Conteúdo | Quando ler |
|---|---|---|
| [context.md](context.md) | Este hub | Sempre, no início do prompt (regra `ai-context`) |
| [especificacao.md](especificacao.md) | O que o produto/ferramenta faz hoje | Antes de propor feature ou aceite |
| [arquitetura.md](arquitetura.md) | Estrutura, ciclo de request, fronteiras | Antes de empacotar, rotear ou deploy |
| [api.md](api.md) | Rotas, erros, contratos | Antes de mudar contrato HTTP / CLI I/O |
| [banco-de-dados.md](banco-de-dados.md) | Schema, migrations, storage | Antes de SQL, migration ou persistência |
| [regras-de-negocio.md](regras-de-negocio.md) | Algoritmos e regras do domínio | Antes de reimplementar lógica |
| [frontend.md](frontend.md) | Rotas, páginas, tema, cliente | Antes de tela, navegação ou UI |
| [ambiente-e-operacao.md](ambiente-e-operacao.md) | Env, scripts, setup, CI, build | Antes de subir ambiente ou publicar |
| [seguranca.md](seguranca.md) | Auth, tokens, isolamento, segredos | Antes de mexer em auth ou dados de usuário |
| [DESIGN.md](DESIGN.md) | Tokens, tipografia, padrões de UI | Antes de token visual ou padrão de tela |
| [historico-de-mudancas.md](historico-de-mudancas.md) | Changelog por data (não é estado atual) | Só para o que mudou quando |
| [fluxo-de-trabalho-ia.md](fluxo-de-trabalho-ia.md) | Rules/skills e consulta por etapa | Antes de criar issue/epic ou desviar do processo |
| [README.md](../README.md) | Pitch do repositório | Onboarding humano |
| [CONTRIBUTING.md](../CONTRIBUTING.md) | Fluxo de contribuição | Antes de abrir PR |
| [CHANGELOG.md](../CHANGELOG.md) | Mudanças versionadas | Release / histórico curto |

## Manutenção

Código vence documentação. A regra `ai-context` manda ler este hub e o documento dono **antes** de editar, e atualizar o dono **no mesmo turno** em que o código muda.