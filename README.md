# Project Atlas

**Uma plataforma de IA pessoal construída do zero como monólito modular — não um wrapper de prompt, um sistema com ciclo cognitivo, portão de permissões, memória persistente e testes de verdade.**

[![CI](https://github.com/nahoL13/Atlas/actions/workflows/ci.yml/badge.svg)](https://github.com/nahoL13/Atlas/actions/workflows/ci.yml)
[![Harness Score](https://paladini.github.io/harness-score/maturity/badge-l4.svg)](https://paladini.github.io/harness-score/)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

---

## O que é isso

Project Atlas é um projeto pessoal para responder uma pergunta simples: **como seria construir um assistente de IA com a mesma disciplina de engenharia que se espera de qualquer sistema sério** — arquitetura documentada, contratos entre módulos, permissões explícitas, cobertura de teste real — em vez de empilhar chamadas de LLM até funcionar?

A resposta é um **ciclo cognitivo** de sete etapas (compreensão → raciocínio → planejamento → execução → observação → aprendizado → resposta) orquestrado por um núcleo único, com todo o resto — Tools, Memória, Personas, Skills, provedores de modelo — plugado atrás de contratos explícitos. A primeira Persona da plataforma é a **Jarvis**, focada em desenvolvimento de software e produtividade.

## O que já existe

- **Ciclo cognitivo completo**, do entendimento do pedido à resposta, com replanejamento automático quando um passo falha.
- **CLI** (`atlas status/ask/chat/remember/skills/persona...`) e uma **GUI desktop em Electron** com chat multi-turno, voz de entrada e saída 100% local (Whisper.cpp + Piper TTS), modo mãos-livres com detecção de fala por VAD (Silero, rodando em WASM no próprio navegador embutido) e um núcleo visual em partículas renderizado em Canvas 2D.
- **Portão de permissões** síncrono e puro na frente de toda execução: nenhuma Tool lê, escreve ou acessa rede fora das raízes/hosts explicitamente autorizados — sem exceção, sem bypass.
- **14 Tools** (arquivo, git somente-leitura, HTTP, busca na web) com sanitização de saída contra injeção de prompt indireta.
- **Memória persistente** com proveniência (`user` vs. `learned`) e um Skill Builder que a IA usa para propor novas capacidades.
- **Múltiplas Personas** customizáveis, cada uma com sua própria voz.
- **Mais de 1800 testes automatizados**, TypeScript estrito de ponta a ponta, e todo o desenvolvimento passa por um processo formal de especificação (SPEC) antes de qualquer linha de código — auditado por um scanner de maturidade de harness de IA que dá nota máxima ao repositório.

## Quickstart

Requisitos: Node.js ≥ 24 e pnpm ≥ 11.

```bash
pnpm install

# CLI
pnpm --filter @atlas/cli atlas status
pnpm --filter @atlas/cli atlas ask "o que você consegue fazer?"

# GUI desktop (Electron)
pnpm --filter @atlas/desktop start

# suíte completa
pnpm lint && pnpm typecheck && pnpm test
```

## Arquitetura

| Se você quer... | Leia |
|---|---|
| Entender o projeto do zero | [PROJECT.md](PROJECT.md) |
| A visão e filosofia por trás das decisões | [docs/01-vision/Vision.md](docs/01-vision/Vision.md) |
| As camadas e o fluxo principal do sistema | [docs/03-architecture/SystemArchitecture.md](docs/03-architecture/SystemArchitecture.md) |
| Responsabilidade de cada módulo | [docs/03-architecture/ModuleCatalog.md](docs/03-architecture/ModuleCatalog.md) |
| As decisões arquiteturais registradas (ADRs) | [docs/06-adr/](docs/06-adr/) |
| O processo de especificação (SPEC) que rege toda mudança | [docs/04-engineering/DevelopmentGuide.md](docs/04-engineering/DevelopmentGuide.md) |

## Stack

TypeScript (strict, monorepo pnpm) · Electron · Vitest · ESLint + Prettier · Python (automação de agentes) · Whisper.cpp (STT) · Piper (TTS neural local) · Silero VAD (`onnxruntime-web`) — tudo local, sem dependência de infraestrutura de terceiros para funcionar.

## Licença

[MIT](LICENSE)
