import { Router } from 'express';
import { parseFilters } from '../services/report.service.js';

export function createReportRouter(service) {
  const router = Router();
  router.get('/inventario', async (req, res) => {
    const filters = parseFilters(req.query);
    res.json({ data: await service.generate(filters) });
  });
  return router;
}
