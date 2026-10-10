import { Router, type RequestHandler } from "express";
import { requireAuth } from "./requireAuth.js";
import { ProjectAccess } from "../modules/projects/project-access.js";

// Mounted before business routers, on both /api/v1 and the legacy /api prefix.
export function createProjectAccessRouter(access = new ProjectAccess(), authenticate: RequestHandler = requireAuth) {
  const router = Router();
  const guard = (kind: string, idParam = "id"): RequestHandler => async (req,_res,next) => {
    try { await access.assertEntity(req.auth!.id,kind || String(req.params.kind),String(req.params[idParam])); next(); }
    catch(error) { next(error); }
  };
  for (const [path,kind] of [["projects","projeto"],["epics","epico"],["epicos","epico"],["features","feature"],["pbis","pbi"],["criteria","criterio"]]) {
    router.use('/'+path+'/:id',authenticate,guard(kind));
  }
  router.use('/quality/pbis/:id',authenticate,guard('pbi'));
  router.use('/audit/:kind/:id',authenticate,guard(''));
  router.get('/criteria',authenticate,async (req,_res,next) => {
    try { await access.assertEntity(req.auth!.id,String(req.query.entidade_tipo),String(req.query.entidade_id)); next(); }
    catch(error) { next(error); }
  });
  return router;
}
