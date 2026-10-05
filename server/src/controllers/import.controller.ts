import { Response } from 'express';
import multer from 'multer';
import { AuthRequest } from '../middleware/auth.middleware';
import { importProcurementPl, importFreightForwardingPl, importLogisticsEntite, importPlTemplate, previewPlTemplate } from '../services/excel-import.service';

export const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

export async function previewImport(req: AuthRequest, res: Response): Promise<void> {
  if (!req.file) { res.status(400).json({ errors: ['Fichier requis'], lines: [] }); return; }
  const fallbackAnnee = req.body.annee ? parseInt(req.body.annee) : new Date().getFullYear();
  const result = await previewPlTemplate(req.file.buffer, fallbackAnnee);
  res.json(result);
}

export async function importBu(req: AuthRequest, res: Response): Promise<void> {
  const { bu } = req.params;
  const { annee, mois, nomCourt } = req.body;

  if (!req.file) { res.status(400).json({ message: 'Fichier Excel requis' }); return; }
  if (!annee || !mois) { res.status(400).json({ message: 'Année et mois requis' }); return; }

  const year = parseInt(annee);
  const month = parseInt(mois);
  const buffer = req.file.buffer;
  const userId = req.user!.userId;
  const user = req.user!;
  const isViewer = user.role === 'VIEWER';
  const allowedEntiteIds = isViewer && user.entitesAccess.length > 0 ? user.entitesAccess : undefined;

  let result;
  switch ((bu as string).toUpperCase()) {
    case 'PROCUREMENT':
      if (isViewer) { res.status(403).json({ message: 'Import multi-entités réservé aux administrateurs' }); return; }
      result = await importProcurementPl(buffer, year, month, userId);
      break;
    case 'FREIGHT_FORWARDING':
      if (isViewer) { res.status(403).json({ message: 'Import multi-entités réservé aux administrateurs' }); return; }
      result = await importFreightForwardingPl(buffer, year, month, userId);
      break;
    case 'LOGISTICS':
      if (!nomCourt) { res.status(400).json({ message: 'nomCourt requis pour Logistics' }); return; }
      result = await importLogisticsEntite(buffer, year, month, nomCourt, userId, allowedEntiteIds);
      break;
    case 'TEMPLATE':
      result = await importPlTemplate(buffer, year, month, userId, allowedEntiteIds);
      break;
    default:
      res.status(400).json({ message: `BU "${bu}" non supportée pour l'import automatique` });
      return;
  }

  res.json(result);
}
