import { createServer } from 'node:http';
export function createHarnessModel(token) {
    if (!token)
        throw new Error('Token obrigatório');
    const state = { invalid: false, clarificationOnly: false, unavailable: false, delayMs: 0, captures: [] };
    const MAX_BODY = 256 * 1024;
    const server = createServer(async (req, res) => {
        res.setHeader('Content-Type', 'application/json');
        const prefix = '/' + token + '/';
        if (!req.url?.startsWith(prefix)) {
            res.writeHead(401);
            res.end('{}');
            return;
        }
        const route = '/' + req.url.slice(prefix.length);
        if (req.method === 'GET') {
            res.end(JSON.stringify(route === '/control' ? state : { models: [] }));
            return;
        }
        let size = 0;
        const parts = [];
        try {
            for await (const part of req) {
                size += part.length;
                if (size > MAX_BODY) {
                    res.writeHead(413);
                    res.end('{"error":"Corpo excede o limite"}');
                    return;
                }
                parts.push(part);
            }
            const payload = JSON.parse(Buffer.concat(parts).toString('utf8'));
            if (route === '/control') {
                for (const key of ['invalid', 'clarificationOnly', 'unavailable'])
                    if (typeof payload[key] === 'boolean')
                        state[key] = payload[key];
                if (Number.isInteger(payload.delayMs) && payload.delayMs >= 0 && payload.delayMs <= 10000)
                    state.delayMs = payload.delayMs;
                res.end(JSON.stringify(state));
                return;
            }
            if (route === '/api/embeddings') {
                res.statusCode = state.unavailable ? 503 : 200;
                res.end(JSON.stringify(state.unavailable ? { error: 'Indisponivel' } : { embedding: Array(1024).fill(0.1) }));
                return;
            }
            state.captures.push(payload);
            if (state.captures.length > 200)
                state.captures.shift();
            const data = JSON.parse(payload.prompt);
            if (state.unavailable) {
                res.statusCode = 503;
                res.end(JSON.stringify({ error: "Indisponível" }));
                return;
            }
            if (state.delayMs)
                await new Promise((resolve) => setTimeout(resolve, state.delayMs));
            const proposalSchema = payload.format.properties.proposal;
            const scenario = (nome, tipo, entao) => ({
                nome,
                tipo,
                dado: "que existe um pedido registrado",
                quando: "o usuário solicita a aprovação",
                entao,
            });
            const result = state.invalid
                ? { questions: [], summary: "SEGREDO", extra: "proibido" }
                : payload.format.properties.evidence
                    ? (evidence => ({evidence, coverage: evidence.length ? 'complete' : 'no_evidence'}))(data.context.slice(0,2).map(chunk=>({source_id:chunk.id,quote:chunk.text.length<=1000?chunk.text:chunk.text.split('\n')[0]})).filter(item=>item.quote.length<=1000))
                : state.clarificationOnly && payload.format.properties.scenarios
                    ? { scenarios: [], questions: ["Qual o resultado esperado quando o pedido nao existir?"] }
                    : payload.format.properties.scenarios
                        ? {
                            scenarios: [
                                scenario("Aprovar pedido com permissão", "caminho_principal", "o pedido passa a constar como aprovado"),
                                ...(payload.system.includes("obrigatoriamente")
                                    ? [
                                        scenario("Recusar aprovação sem permissão", "acesso_nao_autorizado", "o sistema recusa a ação e o pedido permanece inalterado"),
                                    ]
                                    : []),
                            ],
                            questions: [],
                        }
                        : proposalSchema
                            ? {
                                proposal: Object.fromEntries(Object.keys((proposalSchema.anyOf
                                    ? proposalSchema.anyOf.find((item) => item.type === "object")
                                    : proposalSchema).properties).map((field) => [
                                    field,
                                    field === "titulo"
                                        ? "Consultar pagamento padronizado"
                                        : field === "regras_observacoes"
                                            ? ""
                                            : data.fields[field] || "Resultado funcional do produto",
                                ])),
                                questions: [],
                            }
                            : payload.format.properties.questions
                                ? {
                                    questions: data.fields.titulo?.includes("pagamento")
                                        ? [
                                            {
                                                dimension: "validacoes",
                                                question: "Qual o tempo máximo para considerar a consulta rápida?",
                                            },
                                            {
                                                dimension: "permissoes_seguranca",
                                                question: "Quem pode consultar o pagamento?",
                                            },
                                        ]
                                        : [],
                                    summary: payload.system.includes("orientacao-v2")
                                        ? "Nova revisão"
                                        : "Revisão inicial",
                                }
                                : { answer: "Evidência do projeto", sources: [data.context[0].id] };
            res.end(JSON.stringify({ response: JSON.stringify(result) }));
        }
        catch {
            if (!res.headersSent)
                res.writeHead(400);
            res.end('{"error":"Requisição inválida"}');
        }
    });
    server.requestTimeout = 5000;
    server.headersTimeout = 5000;
    // Acesso pela rede Docker temporária; a porta publicada no host usa apenas loopback.
    return server;
}
if (process.env.HARNESS_TOKEN)
    createHarnessModel(process.env.HARNESS_TOKEN).listen(11434, '0.0.0.0');
