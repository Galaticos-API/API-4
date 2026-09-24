import { Router, Request, Response, NextFunction } from "express";
import { pool } from "../../database/db.js";
import { requireAuth } from "../../middleware/requireAuth.js";
import { env } from "../../config/env.js";
import axios from "axios";

export const chatRouter = Router();

chatRouter.use(requireAuth);

// GET /api/v1/chat/conversations - Lista conversas do usuário logado
chatRouter.get("/conversations", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const usuarioId = req.auth?.id;
    if (!usuarioId) {
      res.status(401).json({ error: "Não autenticado" });
      return;
    }

    const result = await pool.query(
      `SELECT c.id, c.usuario_id, c.projeto_id, c.titulo, c.created_at, c.updated_at, p.nome as projeto_nome
       FROM conversa c
       LEFT JOIN projeto p ON c.projeto_id = p.id
       WHERE c.usuario_id = $1
       ORDER BY c.updated_at DESC`,
      [usuarioId]
    );

    res.json({ items: result.rows, total: result.rowCount });
  } catch (error) {
    next(error);
  }
});

// POST /api/v1/chat/conversations - Cria nova conversa
chatRouter.post("/conversations", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const usuarioId = req.auth?.id;
    const { titulo, projeto_id } = req.body;

    if (!usuarioId) {
      res.status(401).json({ error: "Não autenticado" });
      return;
    }

    const result = await pool.query(
      `INSERT INTO conversa (usuario_id, projeto_id, titulo)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [usuarioId, projeto_id || null, titulo || "Nova Conversa Sinapse"]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

// GET /api/v1/chat/conversations/:id/messages - Mensagens da conversa
chatRouter.get("/conversations/:id/messages", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `SELECT id, conversa_id, remetente, conteudo, fontes_json, created_at
       FROM mensagem
       WHERE conversa_id = $1
       ORDER BY created_at ASC`,
      [id]
    );

    res.json({ items: result.rows, total: result.rowCount });
  } catch (error) {
    next(error);
  }
});

// POST /api/v1/chat/query - Envia mensagem do usuário, consulta RAG e grava no banco
chatRouter.post("/query", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const usuarioId = req.auth?.id;
    const { conversa_id, projeto_id, pergunta } = req.body;

    if (!pergunta || typeof pergunta !== "string") {
      res.status(400).json({ error: "Pergunta é obrigatória" });
      return;
    }

    let conversaId = conversa_id;

    // Se não informou conversa_id, cria uma conversa nova
    if (!conversaId && usuarioId) {
      const convRes = await pool.query(
        `INSERT INTO conversa (usuario_id, projeto_id, titulo)
         VALUES ($1, $2, $3)
         RETURNING id`,
        [usuarioId, projeto_id || null, pergunta.slice(0, 50)]
      );
      conversaId = convRes.rows[0].id;
    }

    // Registra a mensagem do usuário
    if (conversaId) {
      await pool.query(
        `INSERT INTO mensagem (conversa_id, remetente, conteudo)
         VALUES ($1, 'user', $2)`,
        [conversaId, pergunta]
      );
    }

    // Tenta consultar o serviço Python RAG ou busca chunks locais no Postgres
    let respostaText = "";
    let fontes: Array<{ id: string; titulo: string; tipo: string }> = [];

    try {
      const aiResponse = await axios.post(`${env.AI_SERVICE_URL}/rag/query`, {
        pergunta,
        projeto_id: projeto_id || undefined,
      }, { timeout: 5000 });

      respostaText = aiResponse.data.resposta || aiResponse.data.conteudo;
      fontes = aiResponse.data.fontes || [];
    } catch {
      // Fallback para busca vetorial / textual direta no PostgreSQL se o serviço Python estiver em inicialização
      let sql = "SELECT id, entidade_tipo, entidade_id, texto FROM chunk WHERE 1=1";
      const params: unknown[] = [];
      if (projeto_id) {
        sql += " AND projeto_id = $1";
        params.push(projeto_id);
      }
      sql += " ORDER BY created_at DESC LIMIT 3";
      const chunks = await pool.query(sql, params);

      if (chunks.rows.length > 0) {
        respostaText = `Com base no acervo indexado do projeto, encontrei as seguintes evidências:\n\n${chunks.rows.map(c => `• ${c.texto}`).join("\n\n")}`;
        fontes = chunks.rows.map(c => ({ id: c.id, titulo: `Trecho ${c.entidade_tipo}`, tipo: c.entidade_tipo }));
      } else {
        respostaText = "Informação não encontrada no acervo do projeto.";
      }
    }

    // Registra a mensagem da assistente no DB
    if (conversaId) {
      await pool.query(
        `INSERT INTO mensagem (conversa_id, remetente, conteudo, fontes_json)
         VALUES ($1, 'assistant', $2, $3)`,
        [conversaId, respostaText, JSON.stringify(fontes)]
      );

      await pool.query("UPDATE conversa SET updated_at = CURRENT_TIMESTAMP WHERE id = $1", [conversaId]);
    }

    res.json({
      conversa_id: conversaId,
      resposta: respostaText,
      fontes,
    });
  } catch (error) {
    next(error);
  }
});
