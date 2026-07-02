import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import prisma from '../lib/prisma';
import { AuthRequest } from '../middleware/auth.middleware';

export async function getAll(req: Request, res: Response): Promise<void> {
  const users = await prisma.user.findMany({
    select: { id: true, email: true, nom: true, prenom: true, role: true, buAccess: true, entitesAccess: true, actif: true, lastLoginAt: true, createdAt: true },
    orderBy: { nom: 'asc' },
  });
  res.json(users);
}

export async function getOne(req: Request, res: Response): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: parseInt(String(req.params.id)) },
    select: { id: true, email: true, nom: true, prenom: true, role: true, buAccess: true, entitesAccess: true, actif: true, lastLoginAt: true },
  });
  if (!user) { res.status(404).json({ message: 'Utilisateur introuvable' }); return; }
  res.json(user);
}

export async function create(req: Request, res: Response): Promise<void> {
  const { email, password, nom, prenom, role, buAccess, entitesAccess } = req.body;
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) { res.status(409).json({ message: 'Email déjà utilisé' }); return; }
  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: { email, passwordHash, nom, prenom, role: role || 'VIEWER', buAccess: buAccess || [], entitesAccess: entitesAccess || [] },
    select: { id: true, email: true, nom: true, prenom: true, role: true, buAccess: true, entitesAccess: true },
  });
  res.status(201).json(user);
}

export async function update(req: Request, res: Response): Promise<void> {
  const { email, nom, prenom, role, buAccess, entitesAccess, actif, password } = req.body;
  const data: Record<string, unknown> = { nom, prenom, role, buAccess, entitesAccess, actif };
  if (email) data.email = email;
  if (password) data.passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.update({
    where: { id: parseInt(String(req.params.id)) },
    data,
    select: { id: true, email: true, nom: true, prenom: true, role: true, buAccess: true, entitesAccess: true, actif: true },
  });
  res.json(user);
}

export async function remove(req: AuthRequest, res: Response): Promise<void> {
  await prisma.user.update({ where: { id: parseInt(String(req.params.id)) }, data: { actif: false } });
  res.json({ message: 'Utilisateur désactivé' });
}
