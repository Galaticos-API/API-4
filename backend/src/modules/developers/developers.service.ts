import type { DevelopersOverview } from "./developers.types.js";
import { DevelopersRepository } from "./developers.repository.js";

export class DevelopersService {
  constructor(private readonly repository: Pick<DevelopersRepository, "listDevelopers" | "listTechnologies" | "listCompetencies"> = new DevelopersRepository()) {}

  async overview(): Promise<DevelopersOverview> {
    const [desenvolvedores, tecnologias, competencias] = await Promise.all([
      this.repository.listDevelopers(),
      this.repository.listTechnologies(),
      this.repository.listCompetencies(),
    ]);
    return { desenvolvedores, tecnologias, competencias };
  }
}
