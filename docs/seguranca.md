# Segurança

> **Para que serve:** auth, tokens, isolamento de dados e segredos
> **Fonte da verdade:** middleware de auth, queries com user id, políticas RLS
> **Relacionados:** [api](api.md) · [banco-de-dados](banco-de-dados.md) · [ambiente-e-operacao](ambiente-e-operacao.md)

## Auth e isolamento

Auth e isolamento de repo-workspace: ver middleware/JWT/Supabase no código. Segredos só em `.env` / painel do provedor. Nunca commitar `.env`, tokens ou chaves.

## Segredos

Só em `.env` / painel do provedor. Usar `.env.example` com placeholders.
