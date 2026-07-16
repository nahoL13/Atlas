# Obsidian Vault

Esta pasta (`docs/`) é, ao mesmo tempo, a documentação oficial do Atlas **e** um vault do Obsidian. Não existem duas cópias: o arquivo que você edita no Obsidian é o mesmo arquivo versionado no git.

## Como abrir

No Obsidian, use **"Open folder as vault"** e aponte para `docs/` (não para a raiz do repositório).

## O que muda ao usar o Obsidian aqui

- **Busca full-text** sobre toda a documentação (SPECs, ADRs, [PRD](02-product/ProductRequirementsDocument.md), etc.).
- **Backlinks automáticos**: ao abrir um arquivo, o Obsidian mostra quais outros arquivos referenciam ele.
- **Graph view**: visualização de como ADRs, SPECs e docs de arquitetura se conectam entre si.
- **Edição continua normal**: salvar um arquivo no Obsidian é salvar o arquivo real do repo — aparece no `git status` como qualquer outra mudança.

## Formato de link

`docs/.obsidian/app.json` configura `useMarkdownLinks: true`, então o Obsidian usa links markdown padrão (`[texto](caminho/relativo.md)`) em vez de wikilinks (`[[nota]]`). Isso mantém consistência com o estilo de referência cruzada já usado no `CLAUDE.md` e entre os ADRs. Wikilinks continuam funcionando se você preferir usá-los pontualmente — o Obsidian resolve os dois formatos.

## O que é versionado e o que não é

- **Versionado**: `docs/.obsidian/app.json` (e qualquer config de plugin/tema que for adicionada depois) — compartilhado com quem clonar o repo.
- **Ignorado** (`.gitignore` na raiz): `docs/.obsidian/workspace.json`, `workspace-mobile.json` e `cache` — são estado local de sessão (painéis abertos, posição do cursor, cache de indexação), específicos da sua máquina.

## O vault não substitui o processo do projeto

Nada muda no fluxo de desenvolvimento do Atlas: SPECs continuam sendo obrigatórias antes de qualquer implementação, e `docs/` continua sendo a fonte oficial da verdade (ver `docs/00-project/ArchitectureConstitution.md`). O vault é apenas uma lente adicional de navegação sobre essa mesma documentação — não um sistema paralelo.
