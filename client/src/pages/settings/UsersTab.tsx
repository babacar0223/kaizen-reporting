import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { userService } from '../../services/user.service';
import type { Role } from '../../types';
import { UserPlus, UserX, UserCheck, Edit2, Check, X, Shield, Eye, Users } from 'lucide-react';

const ROLE_STYLE: Record<Role, string> = {
  SUPER_ADMIN: 'bg-red-100 text-red-700',
  ADMIN:       'bg-orange-100 text-orange-700',
  VIEWER:      'bg-blue-100 text-blue-700',
};

const ROLE_ICON: Record<Role, typeof Shield> = {
  SUPER_ADMIN: Shield,
  ADMIN:       Users,
  VIEWER:      Eye,
};

const ALL_BU = ['PROCUREMENT', 'FREIGHT_FORWARDING', 'LOGISTICS'];

interface UserForm { nom: string; prenom: string; role: string; buAccess: string[]; entitesAccess: string; actif: boolean }

const emptyForm = (): UserForm => ({ nom: '', prenom: '', role: 'VIEWER', buAccess: [], entitesAccess: '', actif: true });

function NewUserModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<UserForm>(emptyForm());
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: userService.create,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users-all'] }); onClose(); },
    onError: (e: { response?: { data?: { message?: string } } }) => setError(e?.response?.data?.message ?? 'Creation failed'),
  });

  const toggleBu = (bu: string) => {
    setForm(f => ({
      ...f,
      buAccess: f.buAccess.includes(bu) ? f.buAccess.filter(b => b !== bu) : [...f.buAccess, bu],
    }));
  };

  const handleSubmit = () => {
    if (!email || !password || !form.nom) { setError('Email, name and password are required'); return; }
    mutation.mutate({
      email, password,
      nom: form.nom, prenom: form.prenom,
      role: form.role,
      buAccess: form.buAccess,
      entitesAccess: form.entitesAccess ? form.entitesAccess.split(',').map(s => parseInt(s.trim())).filter(Boolean) : [],
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        <div className="bg-[#1B3A6B] px-6 py-4 flex items-center justify-between">
          <h2 className="text-white font-bold">Create New User</h2>
          <button onClick={onClose} className="text-blue-200 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 space-y-4">
          {error && <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">First Name</label>
              <input value={form.prenom} onChange={e => setForm(f => ({ ...f, prenom: e.target.value }))} className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#00A3B4] focus:outline-none" placeholder="Jean" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Last Name *</label>
              <input value={form.nom} onChange={e => setForm(f => ({ ...f, nom: e.target.value }))} className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#00A3B4] focus:outline-none" placeholder="Dupont" />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Email *</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#00A3B4] focus:outline-none" placeholder="user@company.com" />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Password *</label>
            <input type="text" value={password} onChange={e => setPassword(e.target.value)} className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-[#00A3B4] focus:outline-none" placeholder="Temporary password" />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Role</label>
            <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))} className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#00A3B4] focus:outline-none">
              <option value="VIEWER">VIEWER – Read only (assigned entities)</option>
              <option value="ADMIN">ADMIN – Data entry & imports</option>
              <option value="SUPER_ADMIN">SUPER_ADMIN – Full access</option>
            </select>
          </div>
          {form.role !== 'SUPER_ADMIN' && (
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">BU Access</label>
              <div className="mt-1 flex gap-2 flex-wrap">
                {ALL_BU.map(bu => (
                  <button key={bu} type="button" onClick={() => toggleBu(bu)}
                    className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${form.buAccess.includes(bu) ? 'bg-[#1B3A6B] text-white border-[#1B3A6B]' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'}`}>
                    {bu.replace('_', ' ')}
                  </button>
                ))}
              </div>
            </div>
          )}
          {form.role === 'VIEWER' && (
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Entity IDs (comma-separated)</label>
              <input value={form.entitesAccess} onChange={e => setForm(f => ({ ...f, entitesAccess: e.target.value }))} className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-[#00A3B4] focus:outline-none" placeholder="e.g. 3, 7, 12" />
              <p className="text-xs text-gray-400 mt-1">Leave empty for access to all entities in selected BUs.</p>
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <button onClick={onClose} className="flex-1 border border-gray-200 text-gray-600 py-2.5 rounded-xl text-sm font-semibold hover:bg-gray-50 transition-colors">Cancel</button>
            <button onClick={handleSubmit} disabled={mutation.isPending} className="flex-1 bg-[#1B3A6B] text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-[#1B3A6B]/90 disabled:opacity-50 transition-colors">
              {mutation.isPending ? 'Creating…' : 'Create User'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function UsersTab() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [editRole, setEditRole] = useState<string>('');

  const { data: users = [], isLoading } = useQuery({ queryKey: ['users-all'], queryFn: userService.getAll });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: object }) => userService.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users-all'] }); setEditId(null); },
  });
  const disableMutation = useMutation({
    mutationFn: (id: number) => userService.disable(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users-all'] }),
  });

  const activeCount = users.filter(u => u.actif !== false).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500">{users.length} users total</span>
          <span className="text-sm text-green-600 font-medium">{activeCount} active</span>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 bg-[#1B3A6B] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#1B3A6B]/90 transition-colors"
        >
          <UserPlus className="w-4 h-4" />
          New User
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-sm text-gray-400">Loading users…</div>
        ) : (
          <table className="min-w-full text-xs">
            <thead>
              <tr className="bg-gray-50 border-b text-gray-500">
                <th className="text-left px-4 py-3 font-semibold">User</th>
                <th className="text-left px-4 py-3 font-semibold">Email</th>
                <th className="text-left px-4 py-3 font-semibold">Role</th>
                <th className="text-left px-4 py-3 font-semibold">BU Access</th>
                <th className="text-center px-4 py-3 font-semibold">Status</th>
                <th className="text-right px-4 py-3 font-semibold">Last Login</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {users.map(user => {
                const RoleIcon = ROLE_ICON[user.role as Role] ?? Eye;
                const isActive = user.actif !== false;
                return (
                  <tr key={user.id} className={`border-b border-gray-100 hover:bg-gray-50/50 ${!isActive ? 'opacity-50' : ''}`}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-[#1B3A6B]/10 flex items-center justify-center flex-shrink-0">
                          <span className="text-[#1B3A6B] font-bold text-xs">{(user.prenom?.[0] ?? '') + (user.nom?.[0] ?? '')}</span>
                        </div>
                        <div>
                          <p className="font-semibold text-gray-800">{user.prenom} {user.nom}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-gray-600">{user.email}</td>
                    <td className="px-4 py-3">
                      {editId === user.id ? (
                        <div className="flex items-center gap-1">
                          <select value={editRole} onChange={e => setEditRole(e.target.value)} className="border border-gray-200 rounded px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[#00A3B4]">
                            <option value="VIEWER">VIEWER</option>
                            <option value="ADMIN">ADMIN</option>
                            <option value="SUPER_ADMIN">SUPER_ADMIN</option>
                          </select>
                          <button onClick={() => updateMutation.mutate({ id: user.id, data: { role: editRole } })} className="p-1 text-green-600 hover:bg-green-50 rounded"><Check className="w-3 h-3" /></button>
                          <button onClick={() => setEditId(null)} className="p-1 text-red-500 hover:bg-red-50 rounded"><X className="w-3 h-3" /></button>
                        </div>
                      ) : (
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${ROLE_STYLE[user.role as Role] ?? 'bg-gray-100 text-gray-600'}`}>
                          <RoleIcon className="w-2.5 h-2.5" />
                          {user.role}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500 max-w-[140px] truncate">
                      {user.buAccess?.length ? user.buAccess.join(', ') : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {isActive
                        ? <span className="inline-flex items-center gap-1 text-green-600 text-xs font-medium"><span className="w-1.5 h-1.5 rounded-full bg-green-500" />Active</span>
                        : <span className="inline-flex items-center gap-1 text-gray-400 text-xs font-medium"><span className="w-1.5 h-1.5 rounded-full bg-gray-300" />Disabled</span>
                      }
                    </td>
                    <td className="px-4 py-3 text-right text-gray-400">
                      {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => { setEditId(user.id); setEditRole(user.role); }} title="Edit role" className="p-1 text-gray-300 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors">
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => isActive ? disableMutation.mutate(user.id) : updateMutation.mutate({ id: user.id, data: { actif: true } })}
                          title={isActive ? 'Disable' : 'Enable'}
                          className={`p-1 rounded transition-colors ${isActive ? 'text-gray-300 hover:text-red-600 hover:bg-red-50' : 'text-gray-300 hover:text-green-600 hover:bg-green-50'}`}
                        >
                          {isActive ? <UserX className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {showCreate && <NewUserModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}
