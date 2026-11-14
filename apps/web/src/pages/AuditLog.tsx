import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ScrollText } from 'lucide-react';
import { api } from '../lib/api';
import { useOutlet } from '../lib/auth';
import { dateTime } from '../lib/format';
import { useI18n } from '../i18n';
import type { AuditEntry, Paged } from '../lib/types';
import { Badge, Button, Card, EmptyState, PageHeader, PageLoader, Table, Td, Th } from '../components/ui';
import { Page } from '../components/Layout';

const tone = (action: string) =>
  /void|cancel|refund|deleted|86d/.test(action) ? 'red' : /payment|completed/.test(action) ? 'green' : /discount|updated|transferred/.test(action) ? 'yellow' : 'gray';

export default function AuditLog() {
  const { outlet, base } = useOutlet();
  const { t } = useI18n();
  const [page, setPage] = useState(1);
  const { data, isLoading } = useQuery({
    queryKey: ['audit', outlet.id, page],
    queryFn: () => api.get<Paged<AuditEntry>>(`${base}/audit?page=${page}&pageSize=50`),
    placeholderData: keepPreviousData,
  });
  return (
    <Page>
      <PageHeader title={t('audit.title')} description={t('audit.subtitle')} />
      <Card>
        {isLoading ? <PageLoader /> : !data?.data.length ? <EmptyState icon={<ScrollText className="h-10 w-10" />} title={t('audit.none')} /> : (
          <>
            <Table>
              <thead className="bg-slate-50"><tr><Th>{t('audit.col.when')}</Th><Th>{t('audit.col.user')}</Th><Th>{t('audit.col.action')}</Th><Th>{t('audit.col.details')}</Th><Th>{t('audit.col.ip')}</Th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {data.data.map((a) => (
                  <tr key={a.id}>
                    <Td>{dateTime(a.createdAt, outlet.timezone)}</Td>
                    <Td>{a.userName ?? t('common.system')}</Td>
                    <Td><Badge tone={tone(a.action)}>{a.action}</Badge></Td>
                    <Td className="max-w-md truncate font-mono text-xs text-slate-500" >{a.metadata && Object.keys(a.metadata).length ? JSON.stringify(a.metadata) : '—'}</Td>
                    <Td className="text-xs text-slate-500">{a.ip ?? '—'}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-4 py-3 text-sm">
              <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>{t('common.previous')}</Button>
              <span>{t('common.pageOf', { page: data.page, total: data.totalPages })}</span>
              <Button size="sm" variant="secondary" disabled={page >= data.totalPages} onClick={() => setPage(page + 1)}>{t('common.next')}</Button>
            </div>
          </>
        )}
      </Card>
    </Page>
  );
}
