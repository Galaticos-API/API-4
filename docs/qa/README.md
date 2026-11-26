# Garantia da Qualidade (QA) e Validação — Sinapse

Este diretório centraliza os registros de homologação, matrizes de cenários, relatórios de verificação de requisitos não funcionais (RNFs), evidências de testes manuais e o roteiro do release final do **Sinapse**.

---

## 🚀 Entregas Principais e Validação Final

| Documento | Descrição |
|---|---|
| [S3-17: Release Final e Roteiro de Demonstração](S3-17-release-final.md) | **Relatório consolidado de entrega final.** Contém as evidências da suíte de 1.437 testes aprovados (unitários, integração, E2E), cobertura dos 66 PBIs, validação de seeds, rotinas de backup/restore e o roteiro completo de apresentação para os stakeholders da PRO4TECH. |
| [S3-16: Validação de Requisitos Não Funcionais (RNFs)](S3-16-validacao-rnfs.md) | Validação empírica de desempenho (busca híbrida < 2s, latência de streaming de chat), integridade de autorização (RBAC e isolamento estrito por `project_id`), privacidade/LGPD, acessibilidade (WCAG 2.1 AA) e execução 100% local sem provedores de nuvem. |

---

## 🧪 Homologação e Cenários da Sprint 1

| Documento | Descrição |
|---|---|
| [S1-23: Matriz de Cenários de Homologação](S1-23-matriz-cenarios.md) | Matriz completa de casos de teste para hierarquia de backlog, controle de acesso e motor determinístico de qualidade. |
| [S1-23: Roteiro de Review com o Cliente](S1-23-roteiro-review.md) | Roteiro passo a passo executado na sessão de homologação com os POs da PRO4TECH. |

---

## 🛠️ Correções e Evidências Técnicas

Documentos detalhados de correção e testes de regressão executados durante a estabilização das entregas:

- [Correções de Acesso e Evidências](CORRECOES-ACESSO-E-EVIDENCIAS.md)
- [Correções de Critérios e Decisões](CORRECOES-CRITERIOS-E-DECISOES.md)
- [Correções de Paginação](CORRECOES-PAGINACAO.md)
- [Correções de Upload e Processamento](CORRECOES-UPLOAD-E-PROCESSAMENTO.md)
- [Correções de Validação de API](CORRECOES-VALIDACAO-API.md)

---

## 📂 Acervo de Demonstração

A pasta [`acervo-demo/`](acervo-demo/) contém as especificações e documentos sintéticos utilizados para carregar os projetos de demonstração durante os testes de homologação e a execução de `seed-demo-acervos.ps1`.
