import api from '../lib/api';
import type { User } from '../types';

export interface CreateUserDto {
  email: string;
  password: string;
  nom: string;
  prenom: string;
  role: string;
  buAccess: string[];
  entitesAccess: number[];
}

export interface UpdateUserDto {
  nom?: string;
  prenom?: string;
  role?: string;
  buAccess?: string[];
  entitesAccess?: number[];
  actif?: boolean;
  password?: string;
}

export const userService = {
  getAll: () => api.get<(User & { actif: boolean; createdAt: string })[]>('/admin/users').then(r => r.data),
  create: (data: CreateUserDto) => api.post<User>('/admin/users', data).then(r => r.data),
  update: (id: number, data: UpdateUserDto) => api.put<User>(`/admin/users/${id}`, data).then(r => r.data),
  disable: (id: number) => api.delete(`/admin/users/${id}`).then(r => r.data),
};
