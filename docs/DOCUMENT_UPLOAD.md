# Upload de Documentos - Guia para Desenvolvedores

## Visão Geral

O sistema Sinapse permite que usuários façam upload de documentos (PDF, DOCX, MD, TXT) associados a projetos. Após o upload, os documentos são processados pelo pipeline RAG para indexação e busca semântica.

## Arquitetura

```
Frontend/Cliente
    ↓
Backend (Node.js/Express)
    ↓
Storage Compartilhado (./storage:/files)
    ↓
PostgreSQL (metadados)
    ↓
n8n Webhook
    ↓
Pipeline RAG (AI Service)
```

### Componentes

| Componente | Tecnologia | Função |
|-----------|-----------|--------|
| **Frontend** | React 19 | Interface para upload de arquivos |
| **Backend** | Node.js 20 + Express | API REST, validação, armazenamento |
| **Storage** | Bind mount `./storage:/files` | Armazenamento compartilhado entre backend e n8n |
| **PostgreSQL** | PostgreSQL 16 + pgvector | Metadados dos documentos |
| **n8n** | n8n latest | Orquestrador de workflows de ingestão |
| **AI Service** | Python 3.11 + FastAPI | Processamento RAG e embeddings |

## Estrutura de Armazenamento

Os arquivos são salvos no storage compartilhado com a seguinte estrutura:

```
./storage/
└── {projectId}/
    └── {documentId}.{extensao}
```

**Exemplo:**
```
./storage/
└── a0000000-0000-4000-8000-000000000001/
    └── c0000000-0000-4000-8000-000000000001.pdf
```

### Extensões Suportadas

- `.pdf` - Documentos PDF
- `.docx` - Documentos Word
- `.md` - Markdown
- `.txt` - Texto puro

## API de Upload

### Endpoint

```
POST /api/v1/projects/{projectId}/documents
```

### Headers

```
Authorization: Bearer {token}
Content-Type: multipart/form-data
```

### Body (multipart/form-data)

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| `file` | File | Sim | Arquivo a ser enviado |

### Resposta de Sucesso (201)

```json
{
  "id": "c0000000-0000-4000-8000-000000000001",
  "projeto_id": "a0000000-0000-4000-8000-000000000001",
  "nome": "documento.pdf",
  "extensao": ".pdf",
  "mime": "application/pdf",
  "tamanho_bytes": 123456,
  "status_processamento": "pendente",
  "armazenamento_pendente": false,
  "autor_id": "b0000000-0000-4000-8000-000000000001",
  "autor_nome": "Ana PO",
  "created_at": "2026-10-02T15:30:00.000Z",
  "updated_at": "2026-10-02T15:30:00.000Z"
}
```

### Respostas de Erro

| Código | Descrição |
|-------|-----------|
| 400 | Arquivo inválido, vazio ou formato não suportado |
| 403 | Sem permissão de escrita (perfil dev) |
| 404 | Projeto não encontrado |
| 409 | Projeto arquivado (somente leitura) |
| 413 | Arquivo acima do limite configurado (default: 20MB) |

## Fluxo de Processamento

### 1. Upload do Arquivo

O usuário envia o arquivo via frontend para o endpoint do backend.

### 2. Validação

O backend valida:
- Tamanho do arquivo (limite configurado via `DOCUMENT_MAX_SIZE_MB`)
- Extensão do arquivo (deve ser .pdf, .docx, .md ou .txt)
- Conteúdo do arquivo (correspondência entre extensão e MIME real)
- Nome do arquivo (sanitização para path traversal)

### 3. Armazenamento

O arquivo é salvo no storage compartilhado:
- Caminho: `{projectId}/{documentId}.{extensao}`
- Processo atômico com staging (`.{extensao}.uploading`)
- Finalização via rename para garantir consistência

### 4. Registro no PostgreSQL

Os metadados são registrados na tabela `documento`:
- `id`: UUID do documento
- `projeto_id`: UUID do projeto
- `nome`: Nome original do arquivo
- `extensao`: Extensão do arquivo
- `mime`: Tipo MIME detectado
- `tamanho_bytes`: Tamanho em bytes
- `caminho`: Caminho no storage
- `usuario_id`: UUID do usuário que fez upload
- `status_processamento`: `pendente` (inicial)

### 5. Webhook n8n

Após armazenamento bem-sucedido, o backend chama o webhook do n8n:

**URL (do container backend):** `POST http://n8n:5678/webhook-test/sinapse-ingest`
**URL (local):** `POST http://localhost:5678/webhook-test/sinapse-ingest`

**Nota:** Em desenvolvimento, usamos a URL de teste (`/webhook-test/`) que não requer ativação do workflow. Em produção, deve-se usar `/webhook/` e ativar o workflow manualmente.

**Payload:**
```json
{
  "documentId": "c0000000-0000-4000-8000-000000000001",
  "projectId": "a0000000-0000-4000-8000-000000000001",
  "filename": "documento.pdf",
  "storagePath": "a0000000-0000-4000-8000-000000000001/c0000000-0000-4000-8000-000000000001.pdf"
}
```

### 6. Processamento RAG

O workflow n8n:
1. Lê o arquivo do storage compartilhado (`/files/{storagePath}`)
2. Extrai o conteúdo textual
3. Envia para o AI Service via `POST http://ai-service:8000/ingest/document`
4. AI Service:
   - Faz chunking do texto
   - Calcula embeddings via `bge-m3` (Ollama)
   - Armazena chunks e embeddings no PostgreSQL (tabela `chunk`)
5. Atualiza `status_processamento` para `processado`

## Exemplos de Requisição

### Testar Webhook n8n Diretamente

Para testar o webhook do n8n sem fazer upload pelo backend:

```bash
curl -X POST http://localhost:5678/webhook/sinapse-ingest \
  -H "Content-Type: application/json" \
  -d '{
    "documentId": "test-001",
    "projectId": "760bf960-d302-4219-aba5-0e29f7eb03b5",
    "filename": "documento.pdf",
    "storagePath": "760bf960-d302-4219-aba5-0e29f7eb03b5/test.pdf"
  }'
```

**Nota:** O workflow do n8n deve estar ativado para que o webhook responda.

### cURL

```bash
# 1. Login para obter token
TOKEN=$(curl -s -X POST http://localhost:3001/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"danieldias@galaticos.com","password":"123456"}' \
  | jq -r '.token')

# 2. Listar projetos para obter o projectId
curl -s http://localhost:3001/api/v1/projects \
  -H "Authorization: Bearer $TOKEN"

# 3. Upload do documento (substitua {projectId} pelo ID real)
curl -X POST http://localhost:3001/api/v1/projects/{projectId}/documents \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@/caminho/do/documento.pdf"
```

### Postman

1. Configure a nova requisição:
   - **Method:** `POST`
   - **URL:** `http://localhost:3001/api/v1/projects/{projectId}/documents`
   - **Headers:**
     - `Authorization`: `Bearer {token}`
   - **Body:**
     - Selecione `form-data`
     - Chave: `file`
     - Tipo: `File`
     - Valor: selecione o arquivo

### JavaScript/Fetch

```javascript
const formData = new FormData();
formData.append('file', fileInput.files[0]);

const response = await fetch(
  `http://localhost:3001/api/v1/projects/${projectId}/documents`,
  {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
    body: formData,
  }
);

const result = await response.json();
```

## Configuração

### Variáveis de Ambiente

| Variável | Default | Descrição |
|----------|---------|-----------|
| `DOCUMENT_MAX_SIZE_MB` | 20 | Tamanho máximo do arquivo em MB |
| `DOCUMENT_STORAGE_DIR` | `/files` | Diretório de armazenamento no container |
| `N8N_WEBHOOK_URL` | `http://n8n:5678/webhook/sinapse-ingest` | URL do webhook n8n |

### Docker Compose

O `docker-compose.yml` configura o storage compartilhado:

```yaml
services:
  backend:
    volumes:
      - ./storage:/files
    environment:
      - DOCUMENT_STORAGE_DIR=/files
      - N8N_WEBHOOK_URL=http://n8n:5678/webhook/sinapse-ingest

  n8n:
    volumes:
      - ./storage:/files
```

## Verificação e Debug

### Verificar arquivo no storage

```bash
# Listar arquivos do projeto
ls -la ./storage/{projectId}/

# Verificar arquivo específico
file ./storage/{projectId}/{documentId}.{extensao}
```

### Verificar arquivo no container n8n

```bash
# Listar arquivos
docker exec sinapse-n8n sh -c "ls -la /files/{projectId}/"

# Nota: Arquivos podem ter permissões restritas devido ao processo de upload
# Se precisar ler o conteúdo, faça isso via backend ou PostgreSQL
```

### Verificar metadados no PostgreSQL

```bash
# Entrar no container postgres
docker exec -it sinapse-postgres psql -U sinapse -d sinapse

# Consultar documento
SELECT id, nome, extensao, caminho, status_processamento 
FROM documento 
WHERE projeto_id = '{projectId}';
```

### Verificar chunks gerados

```bash
# Consultar chunks do documento
SELECT id, texto, metadados_json 
FROM chunk 
WHERE entidade_tipo = 'documento' 
  AND entidade_id = '{documentId}';
```

## Tratamento de Erros

### Erros de Upload

| Erro | Causa | Solução |
|------|-------|---------|
| 400 - "Arquivo inválido" | Extensão não suportada | Use PDF, DOCX, MD ou TXT |
| 400 - "O arquivo está vazio" | Arquivo sem conteúdo | Envie um arquivo com conteúdo |
| 413 - "Arquivo acima do limite" | Arquivo muito grande | Reduza o tamanho ou aumente `DOCUMENT_MAX_SIZE_MB` |
| 404 - "Projeto não encontrado" | ID do projeto inválido | Verifique o projectId |
| 409 - "Projeto arquivado" | Projeto em modo leitura | O projeto arquivado não aceita novos documentos |

### Erros de Webhook n8n

| Erro | Causa | Solução |
|------|-------|---------|
| 404 - "Webhook not registered" | Workflow não ativado | Ative o workflow na interface do n8n |
| Timeout | n8n não respondeu | Verifique se o container n8n está rodando |
| Connection refused | Porta errada ou n8n parado | Verifique `docker compose ps` |

### Erros de Processamento

| Erro | Causa | Solução |
|------|-------|---------|
| 400 - "Arquivo inválido" | Extensão não suportada | Use PDF, DOCX, MD ou TXT |
| 400 - "O arquivo está vazio" | Arquivo sem conteúdo | Envie um arquivo com conteúdo |
| 413 - "Arquivo acima do limite" | Arquivo muito grande | Reduza o tamanho ou aumente `DOCUMENT_MAX_SIZE_MB` |
| 404 - "Projeto não encontrado" | ID do projeto inválido | Verifique o projectId |
| 409 - "Projeto arquivado" | Projeto em modo leitura | O projeto arquivado não aceita novos documentos |

### Erros de Processamento

Se o webhook n8n falhar:
- O documento permanece salvo no storage
- `status_processamento` permanece `pendente`
- O background worker pode reprocessar documentos pendentes
- Verifique logs do backend e n8n para detalhes

## Segurança

### Sanitização de Caminhos

- Nomes de arquivos são sanitizados para remover caminhos relativos (`../`)
- Extensões são validadas contra lista permitida
- IDs gerados via UUID para evitar colisões
- Paths são construídos com template string seguro

### Isolamento por Projeto

- Cada projeto tem seu próprio diretório no storage
- Queries PostgreSQL sempre filtram por `projeto_id`
- n8n workflow processa no contexto do projeto específico

## Manutenção

### Limpeza de Arquivos Órfãos

O background worker do backend:
- Reconcilia arquivos em staging (`.uploading`, `.removing`)
- Remove arquivos sem registro no PostgreSQL
- Marca operações falhadas para retry

### Reindexação

Para reprocessar documentos com status `pendente`:
```bash
# O background worker processa automaticamente
# Ou chame manualmente o endpoint de manutenção (se disponível)
```

## Workflow n8n

O workflow atual está em `n8n/workflows/kbeyMs38qerFoS65-sinapse-document-ingestion-trigger.json`:

1. **Webhook Ingestão** - Recebe payload do backend
2. **Ler arquivo de /files** - Lê arquivo do storage compartilhado
3. **Enviar para AI Service** - Envia conteúdo para processamento
4. **Resposta HTTP** - Confirma recebimento

### Ativar o Workflow

O workflow precisa estar ativado para processar webhooks. Existem duas formas:

**Opção 1 - Via Interface do n8n:**
1. Acesse `http://localhost:5678`
2. Faça login
3. Abra o workflow "Sinapse - Document Ingestion Trigger"
4. Clique no toggle no canto superior direito para ativar
5. Verifique se aparece "Active" no nome do workflow

**Opção 2 - Via n8n-local-sync:**
1. Configure `N8N_API_KEY` no `.env` (obtenha em Settings -> API)
2. Instale `n8n-local-sync`: `pip install n8n-local-sync`
3. Execute: `n8n-local-sync validate` (sincroniza e ativa workflows)

## Referências

- [AGENTS.md](../AGENTS.md) - Contexto do projeto
- [OpenAPI](api/openapi.yaml) - Contrato completo da API
- [Architecture README](Architecture/README.md) - Arquitetura do sistema
