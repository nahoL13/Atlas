# ADR-0003 — packages/core como composition root

> **Project Atlas — Architecture Decision Record**

Status: Accepted

Data: 2026-07-10

---

# Contexto

A Regra de Dependência 3 do Project Structure exige que packages dependam de contratos públicos, nunca de implementações internas de outros packages.

Porém, algum componente precisa importar as implementações concretas para compor a plataforma na inicialização.

Sem definição explícita, essa dependência "invertida" do composition root tenderia a ser interpretada como erro e "corrigida", quebrando o design silenciosamente.

A Constituição (Artigo 3) estabelece o Core como único orquestrador da plataforma.

---

# Decisão

`packages/core` é o composition root da plataforma:

- é o único package autorizado a depender de implementações dos demais packages, exclusivamente para composição (wiring, ciclo de vida, configuração);
- os demais packages dependem apenas de contratos públicos;
- aplicações (`apps/*`) consomem a composição oferecida pelo Core e permanecem finas.

Essa exceção está formalizada como Regra de Dependência 11 do Project Structure.

---

# Consequências

Positivas:

- coerente com o Artigo 3 (Core como único orquestrador);
- aplicações triviais: inicializam o Core e conectam os gateways de entrada e saída;
- um único lugar de composição evita wiring duplicado e divergente entre aplicações.

Custos e riscos:

- o grafo de dependências do Core é intencionalmente amplo; a validação arquitetural (dependency-cruiser) deve tratá-lo como exceção explícita;
- o Core não deve acumular lógica de domínio — apenas composição, ciclo de vida e configuração.

---

# Alternativas Consideradas

**Composição nas aplicações.** Cada app montaria a plataforma a partir dos packages. Rejeitada: duplica o wiring, dilui o Artigo 3 e permite que aplicações componham configurações divergentes da plataforma.
