import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import QRCode from 'qrcode';
import { Copy, DatabaseBackup, KeyRound, Server, Wifi } from 'lucide-react';
import { toast } from 'sonner';
import { api, errorMessage } from '../lib/api';
import { dateTime } from '../lib/format';
import { getLocale } from '../i18n';

const dateOnly = (iso: string) => new Intl.DateTimeFormat(getLocale(), { dateStyle: 'long', timeZone: 'Asia/Kolkata' }).format(new Date(iso));
import { useI18n } from '../i18n';
import type { LicenseState } from '../lib/system';
import { Badge, Button, Card, EmptyState, Field, PageLoader, Table, Td, Textarea, Th, type Tone } from '../components/ui';

interface Details {
  mode: 'cloud' | 'onprem';
  version: string;
  license: {
    state: LicenseState; canOperate: boolean; daysLeft: number | null; trialEndsAt: string | null; maxOutlets: number | null;
    license: { customer: string; edition: string; maxOutlets: number; expiresAt: string | null } | null;
  };
  lanUrls: string[];
  dataDir: string | null;
  backupsAvailable: boolean;
  backups: { file: string; sizeBytes: number; createdAt: string }[];
}

const stateTone: Record<LicenseState, Tone> = { cloud: 'brand', licensed: 'green', trial: 'yellow', trial_expired: 'red', expired: 'red' };
const mb = (b: number) => `${(b / 1024 / 1024).toFixed(1)} MB`;

export default function SystemSettings() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['system-details'], queryFn: () => api.get<Details>('/system/details') });
  const [key, setKey] = useState('');
  const refresh = () => { qc.invalidateQueries({ queryKey: ['system-details'] }); qc.invalidateQueries({ queryKey: ['system-info'] }); };

  const activate = useMutation({
    mutationFn: () => api.post('/system/license', { key }),
    onSuccess: () => { toast.success(t('sys.activated')); setKey(''); refresh(); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const backup = useMutation({
    mutationFn: () => api.post('/system/backups'),
    onSuccess: () => { toast.success(t('sys.backupDone')); refresh(); },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (isLoading || !data) return <PageLoader />;
  const lic = data.license;

  return (
    <div className="grid max-w-5xl gap-6 lg:grid-cols-2">
      <Card title={<span className="flex items-center gap-2"><Server className="h-4 w-4" />{t(`sys.mode.${data.mode}`)}</span>}
        actions={<span className="text-xs text-slate-500">{t('sys.version', { v: data.version })}</span>} className="lg:col-span-2">
        <div className="p-4 text-sm text-slate-600">
          {data.mode === 'cloud' ? t('sys.cloudNote') : data.dataDir && <>{t('sys.dataFolder')}: <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">{data.dataDir}</code></>}
        </div>
      </Card>

      {data.mode === 'onprem' && (
        <Card title={<span className="flex items-center gap-2"><KeyRound className="h-4 w-4" />{t('sys.license')}</span>}
          actions={<Badge tone={stateTone[lic.state]}>{t(`sys.state.${lic.state}`)}</Badge>}>
          <div className="space-y-4 p-4">
            {lic.license ? (
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <dt className="text-slate-500">{t('sys.licensedTo')}</dt><dd className="font-medium">{lic.license.customer}</dd>
                <dt className="text-slate-500">{t('sys.edition')}</dt><dd className="capitalize">{lic.license.edition}</dd>
                <dt className="text-slate-500">{t('sys.branches')}</dt><dd>{lic.license.maxOutlets}</dd>
                <dt className="text-slate-500">{t('sys.expires')}</dt><dd>{lic.license.expiresAt ? dateOnly(lic.license.expiresAt) : t('sys.perpetual')}</dd>
              </dl>
            ) : (
              <p className="text-sm text-slate-600">
                {lic.state === 'trial' ? t('sys.trialLeft', { n: lic.daysLeft ?? 0 }) : t('banner.expired')} {t('sys.trialBranch')}
              </p>
            )}
            <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); activate.mutate(); }}>
              <Field label={t('sys.enterKey')} hint={t('sys.enterKeyHint')}>
                <Textarea rows={3} className="font-mono text-xs" value={key} onChange={(e) => setKey(e.target.value)} placeholder="TW1.…" />
              </Field>
              <Button type="submit" loading={activate.isPending} disabled={key.trim().length < 20}>{t('sys.activate')}</Button>
            </form>
          </div>
        </Card>
      )}

      {data.mode === 'onprem' && data.lanUrls.length > 0 && <NetworkCard urls={data.lanUrls} />}

      {data.backupsAvailable && (
        <Card title={<span className="flex items-center gap-2"><DatabaseBackup className="h-4 w-4" />{t('sys.backups')}</span>} className="lg:col-span-2"
          actions={<Button size="sm" onClick={() => backup.mutate()} loading={backup.isPending}>{t('sys.backupNow')}</Button>}>
          <p className="px-4 pt-3 text-xs text-slate-500">{t('sys.backupsHint')}</p>
          {data.backups.length === 0 ? <EmptyState title={t('sys.noBackups')} /> : (
            <Table>
              <thead><tr><Th>{t('inv.col.when')}</Th><Th>{t('sys.file')}</Th><Th className="text-right">{t('sys.size')}</Th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {data.backups.map((b) => (
                  <tr key={b.file}><Td>{dateTime(b.createdAt)}</Td><Td className="font-mono text-xs">{b.file}</Td><Td className="tabular text-right">{mb(b.sizeBytes)}</Td></tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      )}
    </div>
  );
}

function NetworkCard({ urls }: { urls: string[] }) {
  const { t } = useI18n();
  const [qr, setQr] = useState<string | null>(null);
  useEffect(() => { QRCode.toDataURL(urls[0]!, { margin: 1, width: 180 }).then(setQr).catch(() => setQr(null)); }, [urls]);
  return (
    <Card title={<span className="flex items-center gap-2"><Wifi className="h-4 w-4" />{t('sys.network')}</span>}>
      <div className="space-y-3 p-4">
        <p className="text-sm text-slate-600">{t('sys.networkHint')}</p>
        <ul className="space-y-1.5">
          {urls.map((u) => (
            <li key={u} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2">
              <code className="text-sm font-semibold text-slate-900">{u}</code>
              <Button size="sm" variant="ghost" onClick={() => navigator.clipboard?.writeText(u).then(() => toast.success(t('sys.copied')))} aria-label={t('sys.copy')}>
                <Copy className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
        {qr && (
          <div className="flex flex-col items-center gap-1 pt-2">
            <img src={qr} alt={urls[0]} className="h-40 w-40 rounded-lg ring-1 ring-slate-200" />
            <span className="text-xs text-slate-500">{t('sys.scan')}</span>
          </div>
        )}
      </div>
    </Card>
  );
}
