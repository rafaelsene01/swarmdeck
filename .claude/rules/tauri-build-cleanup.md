# Todo `tauri build` termina com `cargo clean --release`

Esta regra vale para qualquer build de release deste repositório, rodado por você ou pedido por você ao usuário.

## O que fazer

Depois de **todo** `npm run tauri build` (ou `cargo tauri build`, ou qualquer invocação que produza artefato de release), rode:

```bash
cargo clean --release
```

Da raiz do repositório. Não é opcional e não é "quando sobrar tempo": é o último passo do build, no mesmo turno, antes de relatar o resultado.

## Por quê

`Cargo.toml` na raiz declara um workspace (`members = ["src-tauri", "crates/*"]`), então `target/` fica na raiz e é compartilhado por todos os membros. Ele cresce sem teto: em 21/08/2026 estava com 14 GB só de `debug/`. Um build de release soma outra árvore inteira em cima disso.

O artefato que interessa — o instalador, o `.deb`, o `.AppImage`, o `.msi` — já foi copiado para fora pelo empacotador do Tauri antes deste passo. O que `--release` apaga é o material intermediário que ninguém lê depois.

## Por que `--release` e não `cargo clean` puro

`cargo clean` apagaria `target/debug/` junto, e o próximo `tauri dev` recompilaria a árvore inteira de dependências — minutos de espera por um cache que estava correto. `--release` remove só o que o build de release gerou, que é o volume que motiva a limpeza, e preserva o cache de desenvolvimento.

*(Decidido pelo usuário em 21/08/2026, ao ver os 14 GB de `target/`. A primeira formulação pedia `cargo clean` total; o escopo foi reduzido para `--release` no mesmo pedido.)*

## Ao relatar

Diga que o clean rodou, como manda o `AGENTS.md` sobre relatar o que foi executado. Se ele falhou ou você não rodou, diga isso explicitamente — um build relatado como concluído sem menção ao clean é lido como "o clean rodou".
