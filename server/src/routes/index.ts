import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import * as auth from '../controllers/auth.controller';
import * as users from '../controllers/user.controller';
import * as ref from '../controllers/referentiel.controller';
import * as pl from '../controllers/pl.controller';
import * as sales from '../controllers/sales.controller';
import * as stats from '../controllers/stats.controller';
import { importBu, previewImport, upload } from '../controllers/import.controller';

const router = Router();

// Auth
router.post('/auth/login', auth.login);
router.get('/auth/me', authenticate, auth.me);
router.put('/auth/password', authenticate, auth.changePassword);

// Référentiels
router.get('/referentiels/bu', authenticate, ref.getAllBu);
router.get('/referentiels/entites', authenticate, ref.getAllEntites);
router.post('/referentiels/entites', authenticate, authorize('SUPER_ADMIN', 'ADMIN'), ref.createEntite);
router.put('/referentiels/entites/:id', authenticate, authorize('SUPER_ADMIN', 'ADMIN'), ref.updateEntite);
router.delete('/referentiels/entites/:id', authenticate, authorize('SUPER_ADMIN'), ref.deleteEntite);
router.get('/referentiels/clients', authenticate, ref.getClients);
router.post('/referentiels/clients', authenticate, authorize('SUPER_ADMIN', 'ADMIN'), ref.createClient);
router.post('/referentiels/sous-clients', authenticate, authorize('SUPER_ADMIN', 'ADMIN'), ref.createSousClient);
router.get('/referentiels/lignes-pl', authenticate, ref.getLignesPl);
router.post('/referentiels/lignes-pl', authenticate, authorize('SUPER_ADMIN'), ref.createLignePl);

// P&L
router.get('/pl/:bu/:annee/:mois', authenticate, pl.getPlBu);
router.get('/pl/:bu/:entiteId/:annee/:mois', authenticate, pl.getPlEntite);
router.get('/kpi/bu/:bu/:annee/:mois', authenticate, pl.getKpiBu);
router.post('/admin/pl', authenticate, authorize('SUPER_ADMIN', 'ADMIN'), pl.upsertPl);
router.post('/admin/pl/batch', authenticate, authorize('SUPER_ADMIN', 'ADMIN'), pl.batchUpsertPl);
router.delete('/admin/pl/entity/:entiteId/year/:annee', authenticate, authorize('SUPER_ADMIN', 'ADMIN'), pl.resetEntityPlData);

// Sales & Margin
router.get('/sales/:bu/:entiteId/:annee/:mois', authenticate, sales.getSales);
router.get('/sales/consolidation/:bu/:annee/:mois', authenticate, sales.getConsolidationClients);
router.post('/admin/sales', authenticate, authorize('SUPER_ADMIN', 'ADMIN'), sales.upsertSales);

// Statistics
router.get('/stats/:bu/:annee/:mois', authenticate, stats.getStats);
router.get('/admin/export/pl/:bu/:entiteId/:annee', authenticate, pl.exportEntityPl);

// Import Excel + Template download
router.get('/admin/template/monthly', authenticate, authorize('SUPER_ADMIN', 'ADMIN'), stats.downloadMonthlyTemplate);
router.post('/admin/import/preview', authenticate, upload.single('file'), previewImport);
router.post('/admin/import/:bu', authenticate, authorize('SUPER_ADMIN', 'ADMIN'), upload.single('file'), importBu);

// Users
router.get('/admin/users', authenticate, authorize('SUPER_ADMIN'), users.getAll);
router.get('/admin/users/:id', authenticate, authorize('SUPER_ADMIN'), users.getOne);
router.post('/admin/users', authenticate, authorize('SUPER_ADMIN'), users.create);
router.put('/admin/users/:id', authenticate, authorize('SUPER_ADMIN'), users.update);
router.delete('/admin/users/:id', authenticate, authorize('SUPER_ADMIN'), users.remove);

export default router;
