# Regras de negócio

> **Para que serve:** algoritmos e regras do domínio que a IA não deve reinventar
> **Fonte da verdade:** módulos de domínio no código
> **Relacionados:** [especificacao](especificacao.md) · [api](api.md) · [banco-de-dados](banco-de-dados.md)

## Regras

1. O hub não substitui o Git de cada clone — só orquestra comandos.
2. Raiz operacional = pasta do hub ou `--root` / `REPOS_ROOT`.
3. `install`/`dev`/`test` só em subpastas com `package.json`; `switch` em pastas com `.git`.
