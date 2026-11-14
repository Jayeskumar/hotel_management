import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Users } from 'lucide-react';
import { toast } from 'sonner';
import { assignableRoles, ROLE_PERMISSIONS, type Role } from '@tablewise/shared';
import { api, errorMessage } from '../lib/api';
import { useAuth } from '../lib/auth';
import { dateTime } from '../lib/format';
import { useI18n } from '../i18n';
import type { StaffMember } from '../lib/types';
import { Badge, Button, Card, Checkbox, EmptyState, Field, Input, Modal, PageHeader, PageLoader, Select, Table, Td, Th } from '../components/ui';
import { Page } from '../components/Layout';

export default function Staff() {
  const { session } = useAuth();
  const { t } = useI18n();
  const [edit, setEdit] = useState<StaffMember | 'new' | null>(null);
  const { data, isLoading } = useQuery({ queryKey: ['staff'], queryFn: () => api.get<StaffMember[]>('/staff') });
  const roles = assignableRoles(session!.user.role);
  const outletName = (id: string) => session!.outlets.find((o) => o.id === id)?.name;

  return (
    <Page>
      <PageHeader title={t('staff.title')} description={t('staff.subtitle')}
        actions={<Button onClick={() => setEdit('new')}><Plus className="h-4 w-4" />{t('staff.add')}</Button>} />
      <Card>
        {isLoading ? <PageLoader /> : !data?.length ? <EmptyState icon={<Users className="h-10 w-10" />} title={t('staff.none')} /> : (
          <Table>
            <thead className="bg-slate-50"><tr><Th>{t('staff.col.name')}</Th><Th>{t('staff.col.role')}</Th><Th>{t('staff.col.outlets')}</Th><Th>{t('staff.col.lastLogin')}</Th><Th>{t('staff.col.status')}</Th><Th /></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {data.map((s) => (
                <tr key={s.id}>
                  <Td><p className="font-medium text-slate-900">{s.name}</p><p className="text-xs text-slate-500">{s.email}</p></Td>
                  <Td><Badge tone={s.role === 'OWNER' ? 'purple' : s.role === 'MANAGER' ? 'blue' : 'gray'}>{t(`role.${s.role}`)}</Badge></Td>
                  <Td className="max-w-56 truncate">{s.role === 'OWNER' ? t('staff.allOutlets') : s.outletIds.map(outletName).filter(Boolean).join(', ') || '—'}</Td>
                  <Td>{s.lastLoginAt ? dateTime(s.lastLoginAt) : t('common.never')}</Td>
                  <Td>{s.isActive ? <Badge tone="green">{t('staff.active')}</Badge> : <Badge tone="red">{t('staff.disabled')}</Badge>}</Td>
                  <Td className="text-right">
                    {roles.includes(s.role) && s.id !== session!.user.id && <Button size="sm" variant="ghost" onClick={() => setEdit(s)} aria-label={t('common.edit')}><Pencil className="h-4 w-4" /></Button>}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      <Card title={t('staff.permissions')} className="mt-6">
        <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-5">
          {(Object.keys(ROLE_PERMISSIONS) as Role[]).map((r) => (
            <div key={r}>
              <p className="mb-1 text-sm font-semibold">{t(`role.${r}`)}</p>
              <ul className="space-y-0.5 text-xs text-slate-500">{ROLE_PERMISSIONS[r].map((p) => <li key={p}>{p.replace(':', ' · ').replace(/_/g, ' ')}</li>)}</ul>
            </div>
          ))}
        </div>
      </Card>
      {edit && <StaffForm member={edit === 'new' ? null : edit} roles={roles} onClose={() => setEdit(null)} />}
    </Page>
  );
}

function StaffForm({ member, roles, onClose }: { member: StaffMember | null; roles: Role[]; onClose: () => void }) {
  const { session } = useAuth();
  const { t } = useI18n();
  const qc = useQueryClient();
  const [f, setF] = useState({
    name: member?.name ?? '', email: member?.email ?? '', password: '', role: member?.role ?? roles[roles.length - 1] ?? 'WAITER',
    outletIds: member?.outletIds ?? (session!.outlets[0] ? [session!.outlets[0].id] : []), isActive: member?.isActive ?? true,
  });
  const save = useMutation({
    mutationFn: () => member
      ? api.patch(`/staff/${member.id}`, { name: f.name, role: f.role, outletIds: f.outletIds, isActive: f.isActive, ...(f.password && { password: f.password }) })
      : api.post('/staff', { name: f.name, email: f.email, password: f.password, role: f.role, outletIds: f.outletIds }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['staff'] }); toast.success(t('staff.saved')); onClose(); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Modal open onClose={onClose} title={member ? t('staff.editTitle', { name: member.name }) : t('staff.addTitle')}
      footer={<><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button><Button form="staff-form" type="submit" loading={save.isPending} disabled={!f.outletIds.length}>{t('common.save')}</Button></>}>
      <form id="staff-form" className="space-y-3" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
        <Field label={t('staff.fullName')}><Input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label={t('common.email')}><Input type="email" required disabled={!!member} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        <Field label={member ? t('staff.resetPassword') : t('staff.tempPassword')} hint={t('staff.passwordHint')}>
          <Input type="password" required={!member} minLength={10} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} autoComplete="new-password" />
        </Field>
        <Field label={t('staff.role')}><Select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as Role })}>{roles.map((r) => <option key={r} value={r}>{t(`role.${r}`)}</option>)}</Select></Field>
        <div>
          <p className="mb-1 text-sm font-medium text-slate-700">{t('staff.outlets')}</p>
          <div className="space-y-1">
            {session!.outlets.map((o) => (
              <Checkbox key={o.id} label={o.name} checked={f.outletIds.includes(o.id)}
                onChange={(v) => setF({ ...f, outletIds: v ? [...f.outletIds, o.id] : f.outletIds.filter((x) => x !== o.id) })} />
            ))}
          </div>
        </div>
        {member && <Checkbox label={t('staff.accountActive')} checked={f.isActive} onChange={(v) => setF({ ...f, isActive: v })} />}
      </form>
    </Modal>
  );
}
