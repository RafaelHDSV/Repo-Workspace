# Regras de negócio

> **Para que serve:** algoritmos e regras do domínio que a IA não deve reinventar
> **Fonte da verdade:** módulos de domínio no código
> **Relacionados:** [especificacao](especificacao.md) · [api](api.md) · [banco-de-dados](banco-de-dados.md)

## Regras

1. O hub não substitui o Git de cada clone — só orquestra comandos.
2. Raiz operacional = pasta do hub ou `--root` / `REPOS_ROOT`.
3. `install` / `dev` / `setup`: subpastas com `package.json` **ou** só-Deno com `deno.json` e `tasks.dev` (string não vazia). `yarn test` continua só em pastas com `package.json`. `switch` / `open`: pastas com `.git`.
4. Só-Deno na install: não roda `yarn`; avisa e segue (seleção só-Deno → exit 0).
5. Fase dev: `yarn dev` se houver script; senão `deno task dev` quando elegível. Prefere yarn quando ambos existem.
6. Sem `deno` no PATH, seleção com comando Deno falha antes do paralelo.
