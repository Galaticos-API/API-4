import {
  Pool,
  PoolClient,
} from "pg";
import { pool } from "../../database/db.js";
import {
  type ArchiveImpact
} from "./archive.types.js";
import { ProjectArchiveRepository } from "./projects.archive.js";
import { ProjectBacklogRepository } from "./projects.backlog.js";
import { ProjectCommands } from "./projects.commands.js";
import { ProjectQueries } from "./projects.queries.js";
import {
  CreateProjectDTO,
  PaginatedProjects,
  Project,
  ProjectBacklogTree,
  ProjectQueryDTO,
  ProjectWithStats,
  UpdateProjectDTO
} from "./projects.types.js";

export class ProjectsRepository {
  private readonly queries: ProjectQueries;
  private readonly backlog: ProjectBacklogRepository;
  private readonly archiver: ProjectArchiveRepository;
  private readonly commands: ProjectCommands;

  constructor(customPool: Pool = pool) {
    this.queries = new ProjectQueries(customPool);
    this.backlog = new ProjectBacklogRepository(customPool);
    this.archiver = new ProjectArchiveRepository(customPool);
    this.commands = new ProjectCommands(customPool);
  }

  async findActiveByName(
    nome: string,
    excludeId?: string,
  ): Promise<Project | null> {
    return this.queries.findActiveByName(nome, excludeId);
  }

  async findById(
    id: string,
    connection?: Pool | PoolClient,
  ): Promise<ProjectWithStats | null> {
    return this.queries.findById(id, connection);
  }

  async findAll(
    query: ProjectQueryDTO,
    userId?: string,
  ): Promise<PaginatedProjects> {
    return this.queries.findAll(query, userId);
  }

  async findBacklogTree(
    id: string,
  ): Promise<ProjectBacklogTree | null> {
    return this.backlog.findBacklogTree(id);
  }

  async archiveImpact(
    id: string,
    connection?: Pool | PoolClient,
  ): Promise<ArchiveImpact | null> {
    return this.archiver.archiveImpact(id, connection);
  }

  async archive(
    id: string,
    usuarioId?: string | null,
    justificativa?: string,
    expected?: ArchiveImpact,
  ): Promise<ProjectWithStats | null> {
    return this.archiver.archive(id, usuarioId, justificativa, expected);
  }

  async create(
    data: CreateProjectDTO,
    usuarioId?: string | null,
  ): Promise<Project> {
    return this.commands.create(data, usuarioId);
  }

  async update(
    id: string,
    data: UpdateProjectDTO,
    usuarioId?: string | null,
  ): Promise<ProjectWithStats | null> {
    return this.commands.update(id, data, usuarioId);
  }
}

export const projectsRepository = new ProjectsRepository();
