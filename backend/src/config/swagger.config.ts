import swaggerJsdoc from 'swagger-jsdoc';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Sinapse API',
      version: '1.0.0',
      description: 'API de Backend do Sinapse - Base Inteligente de Requisitos',
      contact: {
        name: 'Sinapse Team',
      },
    },
    servers: [
      {
        url: 'http://localhost:3000',
        description: 'Servidor de desenvolvimento',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
      schemas: {
        User: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              format: 'uuid',
            },
            nome: {
              type: 'string',
            },
            email: {
              type: 'string',
              format: 'email',
            },
            role: {
              type: 'string',
              enum: ['admin', 'po', 'dev'],
            },
          },
        },
        Project: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              format: 'uuid',
            },
            nome: {
              type: 'string',
            },
            cliente: {
              type: 'string',
            },
            descricao: {
              type: 'string',
              nullable: true,
            },
            status: {
              type: 'string',
              enum: ['ativo', 'em_andamento', 'concluido', 'arquivado'],
            },
            data_inicio: {
              type: 'string',
              format: 'date-time',
              nullable: true,
            },
            created_at: {
              type: 'string',
              format: 'date-time',
            },
            updated_at: {
              type: 'string',
              format: 'date-time',
            },
          },
        },
        Epic: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              format: 'uuid',
            },
            projeto_id: {
              type: 'string',
              format: 'uuid',
            },
            titulo: {
              type: 'string',
            },
            descricao: {
              type: 'string',
              nullable: true,
            },
            objetivo: {
              type: 'string',
              nullable: true,
            },
            escopo_macro: {
              type: 'string',
              nullable: true,
            },
            resultado_esperado: {
              type: 'string',
              nullable: true,
            },
            prioridade: {
              type: 'string',
              enum: ['Must', 'Should', 'Could'],
            },
            status: {
              type: 'string',
              enum: ['rascunho', 'concluido', 'ativo', 'arquivado'],
            },
            created_at: {
              type: 'string',
              format: 'date-time',
            },
            updated_at: {
              type: 'string',
              format: 'date-time',
            },
          },
        },
        Feature: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              format: 'uuid',
            },
            epico_id: {
              type: 'string',
              format: 'uuid',
            },
            titulo: {
              type: 'string',
            },
            descricao: {
              type: 'string',
              nullable: true,
            },
            objetivo: {
              type: 'string',
              nullable: true,
            },
            prioridade: {
              type: 'string',
              enum: ['Must', 'Should', 'Could'],
            },
            status: {
              type: 'string',
              enum: ['rascunho', 'concluido'],
            },
            created_at: {
              type: 'string',
              format: 'date-time',
            },
            updated_at: {
              type: 'string',
              format: 'date-time',
            },
          },
        },
        Pbi: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              format: 'uuid',
            },
            feature_id: {
              type: 'string',
              format: 'uuid',
            },
            codigo: {
              type: 'string',
            },
            titulo: {
              type: 'string',
            },
            historia_como_um: {
              type: 'string',
            },
            historia_eu_quero: {
              type: 'string',
            },
            historia_para_que: {
              type: 'string',
            },
            regras_observacoes: {
              type: 'string',
              nullable: true,
            },
            tipo: {
              type: 'string',
            },
            prioridade: {
              type: 'string',
              enum: ['Must', 'Should', 'Could'],
            },
            requer_interface: {
              type: 'boolean',
            },
            prototipo_vinculado: {
              type: 'boolean',
            },
            status: {
              type: 'string',
              enum: ['rascunho', 'concluido'],
            },
            score_completude: {
              type: 'number',
              nullable: true,
            },
            provenance: {
              type: 'string',
            },
            created_at: {
              type: 'string',
              format: 'date-time',
            },
            updated_at: {
              type: 'string',
              format: 'date-time',
            },
          },
        },
        Criterion: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              format: 'uuid',
            },
            entidade_tipo: {
              type: 'string',
              enum: ['epico', 'feature', 'pbi'],
            },
            entidade_id: {
              type: 'string',
              format: 'uuid',
            },
            texto: {
              type: 'string',
              nullable: true,
            },
            nome: {
              type: 'string',
              nullable: true,
            },
            dado: {
              type: 'string',
              nullable: true,
            },
            quando: {
              type: 'string',
              nullable: true,
            },
            entao: {
              type: 'string',
              nullable: true,
            },
            ordem: {
              type: 'number',
            },
            created_at: {
              type: 'string',
              format: 'date-time',
            },
          },
        },
        Error: {
          type: 'object',
          properties: {
            error: {
              type: 'string',
            },
            message: {
              type: 'string',
            },
          },
        },
      },
    },
    security: [
      {
        bearerAuth: [],
      },
    ],
  },
  apis: ['./src/**/*.routes.ts', './src/**/*.controller.ts'],
};

export const swaggerSpec = swaggerJsdoc(options);
