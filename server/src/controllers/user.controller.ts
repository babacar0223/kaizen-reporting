import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import prisma from '../lib/prisma';
import { AuthRequest } from '../middleware/auth.middleware';

export async function getAll(req: Request, res: Response): Promise<void> {
  const users = await prisma.user.findMany({
    select: { id: true, email: true, nom: true, prenom: true, role: true, buAccess: true, entitesAccess: true, tresorerieEntitesAccess: true, actif: true, lastLoginAt: true, createdAt: true },
    orderBy: { nom: 'asc' },
  });
  res.json(users);
}

export async function getOne(req: Request, res: Response): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: parseInt(String(req.params.id)) },
    select: { id: true, email: true, nom: true, prenom: true, role: true, buAccess: true, entitesAccess: true, tresorerieEntitesAccess: true, actif: true, lastLoginAt: true },
  });
  if (!user) { res.status(404).json({ message: 'Utilisateur introuvable' }); return; }
  res.json(user);
}

export async function create(req: Request, res: Response): Promise<void> {
  const { email, password, nom, prenom, role, buAccess, entitesAccess, tresorerieEntitesAccess } = req.body;
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) { res.status(409).json({ message: 'Email déjà utilisé' }); return; }
  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: { email, passwordHash, nom, prenom, role: role || 'VIEWER', buAccess: buAccess || [], entitesAccess: entitesAccess || [], tresorerieEntitesAccess: tresorerieEntitesAccess || [] },
    select: { id: true, email: true, nom: true, prenom: true, role: true, buAccess: true, entitesAccess: true, tresorerieEntitesAccess: true },
  });
  res.status(201).json(user);
}

export async function update(req: Request, res: Response): Promise<void> {
  const id = parseInt(String(req.params.id));
  const { email, nom, prenom, role, buAccess, entitesAccess, tresorerieEntitesAccess, actif, password } = req.body;

  // N'applique que les champs réellement fournis (permet les mises à jour partielles).
  const data: Record<string, unknown> = {};
  if (nom !== undefined) data.nom = nom;
  if (prenom !== undefined) data.prenom = prenom;
  if (role !== undefined) data.role = role;
  if (buAccess !== undefined) data.buAccess = buAccess;
  if (entitesAccess !== undefined) data.entitesAccess = entitesAccess;
  if (tresorerieEntitesAccess !== undefined) data.tresorerieEntitesAccess = tresorerieEntitesAccess;
  if (actif !== undefined) data.actif = actif;

  if (email) {
    const norm = String(email).trim().toLowerCase();
    const clash = await prisma.user.findFirst({ where: { email: norm, NOT: { id } }, select: { id: true } });
    if (clash) { res.status(409).json({ message: 'Cet email est déjà utilisé par un autre utilisateur' }); return; }
    data.email = norm;
  }
  if (password) {
    if (String(password).length < 6) { res.status(400).json({ message: 'Le mot de passe doit faire au moins 6 caractères' }); return; }
    data.passwordHash = await bcrypt.hash(password, 12);
  }

  const user = await prisma.user.update({
    where: { id },
    data,
    select: { id: true, email: true, nom: true, prenom: true, role: true, buAccess: true, entitesAccess: true, tresorerieEntitesAccess: true, actif: true },
  });
  res.json(user);
}

export async function remove(req: AuthRequest, res: Response): Promise<void> {
  await prisma.user.update({ where: { id: parseInt(String(req.params.id)) }, data: { actif: false } });
  res.json({ message: 'Utilisateur désactivé' });
}
