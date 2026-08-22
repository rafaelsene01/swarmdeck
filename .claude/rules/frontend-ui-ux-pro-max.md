# Todo trabalho de front passa pela skill `ui-ux-pro-max`

Esta regra vale para qualquer mudança de interface neste repositório: componente novo, ajuste de layout, estilo, tipografia, cor, espaçamento, ícone, estado de loading/erro, acessibilidade, responsividade ou revisão de UI existente.

## O que fazer

Antes de escrever ou editar qualquer arquivo de front — `src/**` (`.tsx`, `.jsx`, `.ts` de componente, `.css`) — invoque a skill:

```
Skill(skill: "ui-ux-pro-max:ui-ux-pro-max")
```

Invoque **antes** de editar, não depois. A skill orienta a decisão (paleta, par de fontes, escala de espaçamento, padrão de componente, guideline de UX); aplicar o guia depois do código pronto vira retrabalho.

Skills irmãs, quando o pedido for específico:

- `ui-ux-pro-max:ui-styling` — Tailwind/shadcn, tema, dark mode
- `ui-ux-pro-max:design-system` — tokens, escalas, specs de componente
- `ui-ux-pro-max:banner-design`, `:slides`, `:design` — assets visuais, apresentações

## Quando NÃO vale

- Ler ou explicar código de front sem alterar nada
- Mudança que não toca a interface: tipagem, chamada de API, store, teste sem asserção visual
- Arquivo de front alterado só por rename/import mecânico

## Ordem com as outras regras

A regra `spec-driven-changes.md` continua valendo e vem primeiro: spec/plano autoriza a edição, `ui-ux-pro-max` orienta como a interface fica. As duas, não uma ou outra.

## Ao relatar

Diga que a skill foi invocada e qual orientação dela você seguiu (estilo, paleta, guideline). Front entregue sem menção à skill é lido como regra ignorada.
