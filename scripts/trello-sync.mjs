#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

// Load a local, gitignored credential file when the caller did not export the
// variables in the current process. The values are never printed.
const localEnvPath = path.resolve(process.env.TRELLO_ENV_FILE || ".env.trello.local");
try {
  const localEnv = await fs.readFile(localEnvPath, "utf8");
  for (const line of localEnv.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match || match[1].startsWith("#") || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].replace(/^['\"]|['\"]$/g, "");
  }
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}

const API_BASE = "https://api.trello.com/1";
const API_KEY = process.env.TRELLO_API_KEY;
const API_TOKEN = process.env.TRELLO_TOKEN;
const BOARD_REFERENCE = process.env.TRELLO_BOARD_ID || "CY2QHrh1";
let boardId = BOARD_REFERENCE;
const PLAN_PATH = path.resolve(
  process.env.TRELLO_PLAN_PATH || "docs/planning/PLANO_DE_TAREFAS_DESENVOLVIMENTO.md",
);
const DRY_RUN = process.argv.includes("--dry-run");
const RESET_STATUS = process.argv.includes("--reset-status");

if (!API_KEY || !API_TOKEN) {
  console.error("Defina TRELLO_API_KEY e TRELLO_TOKEN somente no ambiente local.");
  process.exit(1);
}

const workflowLists = [
  "📘 Visão e Regras",
  "🚧 Decisões e Impedimentos",
  "1️⃣ Sprint 1 — Backlog",
  "2️⃣ Sprint 2 — Backlog",
  "3️⃣ Sprint 3 — Backlog",
  "🏃 Em andamento",
  "👀 Revisão de código",
  "🧪 Teste e Validação",
  "✅ Concluído",
];

const sprintList = {
  1: "1️⃣ Sprint 1 — Backlog",
  2: "2️⃣ Sprint 2 — Backlog",
  3: "3️⃣ Sprint 3 — Backlog",
};

const sprintDates = {
  1: { start: "2026-09-07T03:00:00.000Z", due: "2026-09-28T02:59:00.000Z" },
  2: { start: "2026-10-05T03:00:00.000Z", due: "2026-10-26T02:59:00.000Z" },
  3: { start: "2026-11-02T03:00:00.000Z", due: "2026-11-23T02:59:00.000Z" },
};

const boardDescription = [
  "Quadro Scrum do projeto Sinapse — API do 4º semestre de ADS da Fatec São José dos Campos para a PRO4TECH.",
  "",
  "Backlog: 63 PBIs convertidos em 67 tarefas técnicas, distribuídas em três sprints.",
  "Equipe: 7 integrantes do Dev Team, 1 Product Owner e Cauan Gabriel como Scrum Master.",
  "Repositório: https://github.com/Galaticos-API/API-4",
  "",
  "Política de WIP: até 7 cartões em andamento, 4 em revisão e 4 em teste/validação.",
  "Atribuição: usar o campo nativo Membros; etiquetas representam sprint, prioridade, componente ou papel Scrum.",
].join("\n");

const labelColors = {
  "🗓️ Sprint 1": "blue",
  "🗓️ Sprint 2": "purple",
  "🗓️ Sprint 3": "sky",
  "🚨 Bloqueante": "red",
  "🔴 Obrigatória (Must)": "orange",
  "🟡 Importante (Should)": "yellow",
  "🟢 Opcional (Could)": "lime",
  "Área: Frontend": "green",
  "Área: Backend": "blue",
  "Área: Banco de Dados": "purple",
  "Área: IA e RAG": "pink",
  "Área: Automação n8n": "sky",
  "Área: Qualidade e Testes": "yellow",
  "Área: UX/UI": "lime",
  "Área: Segurança": "red",
  "Área: Documentação": "black",
  "Área: Produto": "orange",
  "Área: CI/CD": "green",
  "Área: DevOps": "blue",
  "Área: LGPD": "red",
  "Tipo: Governança": "black",
  "Papel: Dev Team": "green",
  "Papel: Product Owner": "purple",
  "Papel: Scrum Master": "blue",
};

const priorityLabels = {
  Bloqueante: "🚨 Bloqueante",
  Must: "🔴 Obrigatória (Must)",
  Should: "🟡 Importante (Should)",
  Could: "🟢 Opcional (Could)",
};

const componentLabels = {
  Frontend: "Área: Frontend",
  Backend: "Área: Backend",
  Banco: "Área: Banco de Dados",
  "IA/RAG": "Área: IA e RAG",
  n8n: "Área: Automação n8n",
  QA: "Área: Qualidade e Testes",
  UX: "Área: UX/UI",
  Segurança: "Área: Segurança",
  Docs: "Área: Documentação",
  Produto: "Área: Produto",
  CI: "Área: CI/CD",
  DevOps: "Área: DevOps",
  LGPD: "Área: LGPD",
};

const legacyLabelNames = {
  "Sprint 1": "🗓️ Sprint 1",
  "Sprint 2": "🗓️ Sprint 2",
  "Sprint 3": "🗓️ Sprint 3",
  Governança: "Tipo: Governança",
  "Dev Team": "Papel: Dev Team",
  "Product Owner": "Papel: Product Owner",
  "Scrum Master": "Papel: Scrum Master",
  ...priorityLabels,
  ...componentLabels,
};

const sprintLabel = (sprint) => `🗓️ Sprint ${sprint}`;
const priorityLabel = (priority) => priorityLabels[priority];
const componentLabel = (component) => componentLabels[component] || `Área: ${component}`;

const preparationResults = {
  "PRE-01": "Hierarquia, identificação, papel principal da plataforma, estimativa e transcrições documentados sem ambiguidade",
  "PRE-02": "Banco reproduzível contém todos os campos, tabelas, índices, chaves, restrições e auditoria exigidos",
  "PRE-03": "OpenAPI e JSON Schemas versionados distinguem comandos, sugestões, indexação, erros e correlação",
  "PRE-04": "Backend, frontend e serviço de IA possuem testes mínimos e scripts executados na integração contínua",
  "PRE-05": "Tokens, componentes base, estados de interface e fluxo Projeto até PBI estão aprovados",
  "PRE-06": "Base possui projetos anonimizados ou dados fictícios aprovados, sempre com origem registrada",
  "PRE-07": "Relatório compara modelos em português e define dimensão e configuração dos vetores",
  "PRE-08": "Vulnerabilidades, impactos e atualizações seguras estão registrados, com build e testes verdes",
  "PRE-09": "Ambiente completo sobe do zero e comprova health checks, persistência e ciclo do n8n",
};

const backlogFiles = {
  "01": "EP-01-especificar-backlog.md",
  "02": "EP-02-preservar-conhecimento.md",
  "03": "EP-03-apoio-inteligencia-artificial.md",
  "04": "EP-04-consultar-conhecimento.md",
  "05": "EP-05-competencias-equipe.md",
  "06": "EP-06-acesso-controlado.md",
};

function pbiIds(value) {
  return [...new Set(value.match(/PBI-\d{2}\.\d\.\d/g) || [])];
}

function pbiLinks(value) {
  return pbiIds(value).map((id) => {
    const epic = id.slice(4, 6);
    const file = backlogFiles[epic];
    return file
      ? `[${id}](https://github.com/Galaticos-API/API-4/blob/main/docs/backlog/${file})`
      : id;
  }).join(", ");
}

const authHeader =
  `OAuth oauth_consumer_key="${API_KEY}", oauth_token="${API_TOKEN}"`;

async function trello(endpoint, { method = "GET", params, form } = {}) {
  const url = new URL(`${API_BASE}${endpoint}`);
  for (const [key, value] of Object.entries(params || {})) {
    if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
  }

  if (DRY_RUN && method !== "GET") {
    console.log(`[dry-run] ${method} ${endpoint}`, form || params || "");
    return { id: `dry-${Math.random().toString(16).slice(2)}` };
  }

  const response = await fetch(url, {
    method,
    headers: {
      Accept: "application/json",
      Authorization: authHeader,
      ...(form ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    body: form ? new URLSearchParams(form) : undefined,
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`${method} ${endpoint}: ${response.status} ${detail}`);
  }

  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

function parseRow(line) {
  return line
    .slice(1, -1)
    .split("|")
    .map((cell) => cell.trim().replaceAll("`", ""));
}

function parseTasks(markdown) {
  return markdown
    .split(/\r?\n/)
    .filter((line) => /^\|\s*(PRE-\d+|S[123]-\d+)\s*\|/.test(line))
    .map((line) => {
      const [id, priority, scope, pbiOrResult, dependencies, size, labels] = parseRow(line);
      const sprint = id.startsWith("PRE-") || id.startsWith("S1-")
        ? 1
        : id.startsWith("S2-")
          ? 2
          : 3;
      const isPreparation = id.startsWith("PRE-");
      const components = labels.split(",").map((item) => item.trim()).filter(Boolean);

      return {
        id,
        priority,
        scope,
        sprint,
        dependencies,
        size,
        components,
        pbi: pbiOrResult,
        expectedResult: isPreparation ? preparationResults[id] : scope,
      };
    });
}

function cardName(task) {
  return `[${task.id}] ${task.scope}`;
}

function cardDescription(task) {
  return [
    `<!-- sinapse-task:${task.id} -->`,
    `## Resumo`,
    task.scope.endsWith(".") ? task.scope : `${task.scope}.`,
    "",
    `## Detalhamento`,
    task.expectedResult.endsWith(".") ? task.expectedResult : `${task.expectedResult}.`,
    "",
    `## Referência do backlog`,
    pbiLinks(task.pbi),
    "",
    `## Resultado esperado`,
    task.expectedResult,
    "",
    `## Dependências`,
    task.dependencies || "—",
    "",
    `## Tamanho estimado`,
    `${task.size} — P: até 1 dia; M: 1–2 dias; G: 2–3 dias`,
    "",
    `## Áreas envolvidas`,
    task.components.join(", "),
    "",
    `## Como validar a conclusão`,
    "- [ ] Critérios do PBI demonstráveis",
    "- [ ] Testes automatizados relevantes passando",
    "- [ ] Pull Request revisado por outra pessoa",
    "- [ ] OpenAPI e documentação atualizadas quando aplicável",
    "- [ ] Sem exposição de dados sensíveis em logs",
    "",
    `**Sprint:** ${task.sprint} · **Prioridade:** ${task.priority}`,
    "**Responsável:** ainda não definido; será atribuído no Sprint Planning.",
  ].join("\n");
}

async function ensureLists() {
  const existing = await trello(`/boards/${boardId}/lists`, {
    params: { fields: "name,pos,closed", filter: "open" },
  });
  const byName = new Map(existing.map((list) => [list.name, list]));

  for (const [index, name] of workflowLists.entries()) {
    if (!byName.has(name)) {
      const created = await trello("/lists", {
        method: "POST",
        form: { idBoard: boardId, name, pos: String((index + 1) * 16384) },
      });
      byName.set(name, created);
      console.log(`Lista criada: ${name}`);
    }
  }
  return byName;
}

async function updateBoardMetadata() {
  await trello(`/boards/${boardId}`, {
    method: "PUT",
    form: { desc: boardDescription },
  });
  console.log("Descrição executiva do quadro atualizada.");
}

async function ensureLabels(tasks) {
  const existing = await trello(`/boards/${boardId}/labels`, {
    params: { fields: "name,color", limit: 1000 },
  });
  const byName = new Map(existing.filter((label) => label.name).map((label) => [label.name, label]));
  for (const [oldName, newName] of Object.entries(legacyLabelNames)) {
    if (byName.has(oldName) && !byName.has(newName)) {
      const renamed = await trello(`/labels/${byName.get(oldName).id}`, {
        method: "PUT",
        form: { name: newName, color: labelColors[newName] || "black" },
      });
      byName.delete(oldName);
      byName.set(newName, renamed);
      console.log(`Etiqueta renomeada: ${oldName} → ${newName}`);
    }
  }

  const desired = new Set([
    "Tipo: Governança",
    "Papel: Dev Team",
    "Papel: Product Owner",
    "Papel: Scrum Master",
  ]);
  for (const task of tasks) {
    desired.add(sprintLabel(task.sprint));
    desired.add(priorityLabel(task.priority));
    task.components.forEach((component) => desired.add(componentLabel(component)));
  }

  for (const name of desired) {
    if (!byName.has(name)) {
      const created = await trello("/labels", {
        method: "POST",
        form: { idBoard: boardId, name, color: labelColors[name] || "black" },
      });
      byName.set(name, created);
      console.log(`Etiqueta criada: ${name}`);
    }
  }
  return byName;
}

async function ensureMetaCards(lists, labels) {
  const existing = await trello(`/boards/${boardId}/cards`, {
    params: { fields: "name,desc,idList,closed", filter: "open", limit: 1000 },
  });
  const byName = new Map(existing.map((card) => [card.name, card]));
  const cards = [
    {
      list: "📘 Visão e Regras",
      name: "📌 Guia do quadro e Definição de Pronto",
      desc: [
        "## Fluxo",
        "Backlog da sprint → Em andamento → Revisão de código → Teste e Validação → Concluído.",
        "",
        "## Limites de trabalho em andamento",
        "- Em andamento: máximo 7 cartões (um foco principal por integrante do Dev Team).",
        "- Revisão de código: máximo 4 cartões.",
        "- Teste e Validação: máximo 4 cartões.",
        "",
        "## Definição de Pronto",
        "Um cartão só é concluído quando critérios, testes, revisão, integração e documentação aplicáveis estiverem prontos.",
        "Não atribuir responsáveis antes do Sprint Planning e da confirmação de capacidade.",
      ].join("\n"),
      labelNames: ["Tipo: Governança", "Papel: Dev Team"],
    },
    {
      list: "🚧 Decisões e Impedimentos",
      name: "⚠️ Q1–Q5 e dependências externas da PRO4TECH",
      desc: "Registrar aqui decisões de hierarquia, identificação, papel principal da plataforma, estimativas, transcrições e disponibilidade de dados históricos. Vincular impedimentos aos cartões afetados.",
      labelNames: ["Tipo: Governança", "Papel: Product Owner", "Papel: Scrum Master"],
    },
    {
      list: "📘 Visão e Regras",
      name: "👥 Equipe Scrum — 7 Devs + PO + SM",
      desc: [
        "## Composição",
        "- Scrum Master: Cauan Gabriel",
        "- Product Owner: convidar e identificar no quadro",
        "- Dev Team: 7 integrantes, a convidar",
        "",
        "## Regra de distribuição",
        "1. Convidar PO e os 7 integrantes como membros do quadro.",
        "2. Durante o Sprint Planning, atribuir cada cartão selecionado a um integrante usando o campo nativo Membros.",
        "3. Manter um responsável principal por cartão; colaboração e revisão podem ser registradas em checklist/comentário.",
        "4. Não usar etiquetas com nomes de pessoas: etiquetas representam sprint, prioridade, componente e papel Scrum.",
        "5. Limitar trabalho em andamento e só puxar nova tarefa após encaminhar a atual para revisão.",
        "",
        "A distribuição individual permanece vazia até a confirmação dos nomes, competências e capacidade.",
      ].join("\n"),
      labelNames: ["Tipo: Governança", "Papel: Dev Team", "Papel: Product Owner", "Papel: Scrum Master"],
    },
    {
      list: "📘 Visão e Regras",
      name: "📅 Sprints, cerimônias e responsabilidades",
      desc: [
        "## Sprint 1 — 07/09 a 27/09",
        "Meta: hierarquia PRO4TECH, autenticação, validações, decisões e anexos sem dependência de IA.",
        "",
        "## Sprint 2 — 05/10 a 25/10",
        "Meta: acervo pesquisável e IA assistiva com confirmação humana.",
        "",
        "## Sprint 3 — 02/11 a 22/11",
        "Meta: chat fundamentado, perfis profissionais, administração e release final.",
        "",
        "## Papéis",
        "- PO: ordenar valor, esclarecer PBIs e aceitar resultados.",
        "- Scrum Master: facilitar eventos, remover impedimentos e proteger o processo.",
        "- Dev Team (7): estimar, selecionar trabalho, implementar, revisar, testar e entregar o incremento.",
      ].join("\n"),
      labelNames: ["Tipo: Governança", "Papel: Product Owner", "Papel: Scrum Master", "Papel: Dev Team"],
    },
    {
      list: "📘 Visão e Regras",
      name: "🎯 Sprint 1 — Meta e janela",
      desc: "**07/09 a 27/09**\n\nCadastrar e consultar a hierarquia completa no padrão PRO4TECH, com autenticação, validações determinísticas, decisões e anexos, sem depender de IA.",
      labelNames: ["Tipo: Governança", "🗓️ Sprint 1", "Papel: Product Owner", "Papel: Scrum Master", "Papel: Dev Team"],
      ...sprintDates[1],
    },
    {
      list: "📘 Visão e Regras",
      name: "🎯 Sprint 2 — Meta e janela",
      desc: "**05/10 a 25/10**\n\nConstituir o acervo pesquisável e introduzir a IA como copiloto assistivo, sempre com confirmação humana.",
      labelNames: ["Tipo: Governança", "🗓️ Sprint 2", "Papel: Product Owner", "Papel: Scrum Master", "Papel: Dev Team"],
      ...sprintDates[2],
    },
    {
      list: "📘 Visão e Regras",
      name: "🎯 Sprint 3 — Meta e janela",
      desc: "**02/11 a 22/11**\n\nOferecer chat fundamentado, memória de conversas, conhecimento sobre pessoas e administração, concluindo o produto para a apresentação final.",
      labelNames: ["Tipo: Governança", "🗓️ Sprint 3", "Papel: Product Owner", "Papel: Scrum Master", "Papel: Dev Team"],
      ...sprintDates[3],
    },
  ];

  for (const card of cards) {
    const idLabels = card.labelNames.map((name) => labels.get(name)?.id).filter(Boolean).join(",");
    const existingCard = byName.get(card.name);
    if (existingCard) {
      await trello(`/cards/${existingCard.id}`, {
        method: "PUT",
        form: {
          name: card.name,
          desc: card.desc,
          idList: lists.get(card.list).id,
          idLabels,
          ...(card.start ? { start: card.start } : {}),
          ...(card.due ? { due: card.due } : {}),
        },
      });
      console.log(`Cartão de controle atualizado: ${card.name}`);
    } else {
      await trello("/cards", {
        method: "POST",
        form: {
          idList: lists.get(card.list).id,
          name: card.name,
          desc: card.desc,
          idLabels,
          pos: "top",
          ...(card.start ? { start: card.start } : {}),
          ...(card.due ? { due: card.due } : {}),
        },
      });
      console.log(`Cartão de controle criado: ${card.name}`);
    }
  }
}

async function syncTasks(tasks, lists, labels) {
  const existing = await trello(`/boards/${boardId}/cards`, {
    params: { fields: "name,desc,idList,closed", filter: "open", limit: 1000 },
  });
  const byTaskId = new Map();
  for (const card of existing) {
    const match = card.desc?.match(/<!-- sinapse-task:(PRE-\d+|S[123]-\d+) -->/)
      || card.name?.match(/^\[(PRE-\d+|S[123]-\d+)\]/);
    if (match) byTaskId.set(match[1], card);
  }

  const priorityOrder = { Bloqueante: 0, Must: 1, Should: 2, Could: 3 };
  const orderedTasks = [...tasks].sort((left, right) =>
    left.sprint - right.sprint
    || priorityOrder[left.priority] - priorityOrder[right.priority]
    || left.id.localeCompare(right.id, "pt-BR", { numeric: true }),
  );
  const positionInSprint = new Map();
  for (const sprint of [1, 2, 3]) {
    orderedTasks.filter((task) => task.sprint === sprint).forEach((task, index) => {
      positionInSprint.set(task.id, (index + 1) * 16384);
    });
  }

  for (const task of orderedTasks) {
    const list = lists.get(sprintList[task.sprint]);
    const labelIds = [
      labels.get(sprintLabel(task.sprint))?.id,
      labels.get(priorityLabel(task.priority))?.id,
      ...task.components.map((name) => labels.get(componentLabel(name))?.id),
    ].filter(Boolean);
    const existingCard = byTaskId.get(task.id);
    const form = {
      name: cardName(task),
      desc: cardDescription(task),
      idLabels: labelIds.join(","),
      start: sprintDates[task.sprint].start,
      due: sprintDates[task.sprint].due,
    };

    if (existingCard) {
      if (RESET_STATUS) form.idList = list.id;
      if (existingCard.idList === list.id) form.pos = String(positionInSprint.get(task.id));
      await trello(`/cards/${existingCard.id}`, { method: "PUT", form });
      console.log(`Cartão atualizado: ${task.id}`);
    } else {
      await trello("/cards", {
        method: "POST",
        form: { ...form, idList: list.id, pos: "bottom" },
      });
      console.log(`Cartão criado: ${task.id}`);
    }
  }
}

const markdown = await fs.readFile(PLAN_PATH, "utf8");
const tasks = parseTasks(markdown);
const counts = tasks.reduce((acc, task) => {
  acc[task.sprint] = (acc[task.sprint] || 0) + 1;
  return acc;
}, {});

if (tasks.length !== 67 || counts[1] !== 32 || counts[2] !== 18 || counts[3] !== 17) {
  throw new Error(`Distribuição inesperada: total=${tasks.length}, sprints=${JSON.stringify(counts)}`);
}

const board = await trello(`/boards/${BOARD_REFERENCE}`, { params: { fields: "id,name,shortLink,url" } });
boardId = board.id;
console.log(`Sincronizando ${tasks.length} tarefas no quadro ${board.name} (${board.shortLink})...`);
const lists = await ensureLists();
await updateBoardMetadata();
const labels = await ensureLabels(tasks);
await ensureMetaCards(lists, labels);
await syncTasks(tasks, lists, labels);
console.log("Sincronização concluída: Sprint 1=32, Sprint 2=18, Sprint 3=17.");
