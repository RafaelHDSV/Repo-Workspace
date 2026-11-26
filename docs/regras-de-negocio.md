# Regras de negócio

> **Para que serve:** algoritmos e regras do domínio que a IA não deve reinventar
> **Fonte da verdade:** módulos de domínio no código
> **Relacionados:** [especificacao](especificacao.md) · [api](api.md) · [banco-de-dados](banco-de-dados.md)

## Regras

1. O hub não substitui o Git de cada clone — só orquestra comandos.
2. Raiz operacional = pasta do hub ou `--root` / `REPOS_ROOT`.
3. `install`/`dev`/`test` só em subpastas com `package.json`; `switch` em pastas com `.git`.
4. Loop de reselect após Ctrl+C vale só para `dev` e para a fase `dev` do `setup`, e só quando a seleção foi pelo multiselect (não com `--all`, `REPOS_SKIP_PROMPT=1` ou nomes na CLI).
5. A pré-marcação no reselect usa a última lista **confirmada** no multiselect (não só os que tinham script `dev`); repos sem `dev` continuam sendo ignorados com aviso.
6. No `setup`, se o `yarn` sequencial já concluiu, reselect **não** reinstala — só sobe `dev` de novo. Ctrl+C durante o install sequencial aborta como antes (sem loop).
7. A pré-marcação do loop não persiste em disco; invocação fria de `dev`/`setup` abre o menu sem marcação (exceto `open`, que pré-marca via Source Control).
