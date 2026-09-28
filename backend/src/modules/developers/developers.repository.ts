import type { Developer, DeveloperTechnology, Competency } from "./developers.types.js";
import type { Pool } from "pg";
import { pool } from "../../database/db.js";

export class DevelopersRepository {
  constructor(private readonly db: Pick<Pool, "query"> = pool) {}

  async listDevelopers(): Promise<Developer[]> {
    const { rows } = await this.db.query<Developer>(
      `SELECT d.id, d.senioridade, d.bio, u.nome, u.email, u.role
       FROM desenvolvedor d JOIN usuario u ON d.usuario_id = u.id ORDER BY u.nome ASC`,
    );
    return rows;
  }

  async listTechnologies(): Promise<DeveloperTechnology[]> {
    const { rows } = await this.db.query<DeveloperTechnology>("SELECT id, nome, categoria FROM tecnologia ORDER BY nome ASC");
    return rows;
  }

  async listCompetencies(): Promise<Competency[]> {
    const { rows } = await this.db.query<Competency>(
      `SELECT c.id, c.desenvolvedor_id, c.tecnologia_id, c.nivel, c.evidencia, t.nome AS tecnologia_nome
       FROM competencia c JOIN tecnologia t ON c.tecnologia_id = t.id`,
    );
    return rows;
  }
}
