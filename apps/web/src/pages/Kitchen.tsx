import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { clsx } from 'clsx';
import { BellRing, ChefHat, Maximize2 } from 'lucide-react';
import { toast } from 'sonner';
import { STATIONS, type ItemStatus } from '@tablewise/shared';
import { api, errorMessage } from '../lib/api';
import { useAuth, useOutlet } from '../lib/auth';
import { elapsed, minutesSince, titleCase } from '../lib/format';
import type { KitchenTicket, OrderItem } from '../lib/types';
import { EmptyState, PageLoader } from '../components/ui';

const NEXT: Partial<Record<ItemStatus, ItemStatus>> = { QUEUED: 'PREPARING', PREPARING: 'READY' };

/** Full-height dark Kitchen Display designed for wall-mounted screens. */
export default function Kitchen() {
  const { outlet, base } = useOutlet();
  const { can } = useAuth();
  const qc = useQueryClient();
  const [station, setStation] = useState<string>(() => localStorage.getItem('tw.kds.station') ?? '');
  const [now, setNow] = useState(Date.now());
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 15_000); return () => clearInterval(t); }, []);
  useEffect(() => { localStorage.setItem('tw.kds.station', station); seen.current = null; }, [station]);

  const { data, isLoading } = useQuery({
    queryKey: ['kitchen', outlet.id, station],
    queryFn: () => api.get<KitchenTicket[]>(`${base}/kitchen${station ? `?station=${station}` : ''}`),
    refetchInterval: 20_000,
  });

  // Chime when a new ticket arrives.
  useEffect(() => {
    if (!data) return;
    const ids = new Set(data.map((t) => t.orderId + t.items.length));
    if (seen.current && [...ids].some((id) => !seen.current!.has(id))) chime();
    seen.current = ids;
  }, [data]);

  const advance = useMutation({
    mutationFn: ({ item, status }: { item: OrderItem; status: ItemStatus }) => api.post(`${base}/kitchen/items/${item.id}/status`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['kitchen'] }),
    onError: (e) => toast.error(errorMessage(e)),
  });
  const bump = useMutation({
    mutationFn: (orderId: string) => api.post(`${base}/kitchen/orders/${orderId}/bump`, station ? { station } : {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['kitchen'] }),
    onError: (e) => toast.error(errorMessage(e)),
  });
  const editable = can('kitchen:update');

  return (
    <div className="flex min-h-full flex-col bg-slate-950 text-slate-100">
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-800 px-4 py-3">
        <ChefHat className="h-6 w-6 text-brand-500" />
        <h1 className="text-lg font-semibold">Kitchen Display</h1>
        <div className="ml-4 flex gap-1 overflow-x-auto rounded-lg bg-slate-900 p-1">
          {['', ...STATIONS].map((s) => (
            <button key={s} onClick={() => setStation(s)}
              className={clsx('rounded-md px-3 py-1.5 text-sm font-medium', station === s ? 'bg-brand-700 text-white' : 'text-slate-400 hover:text-white')}>
              {s ? titleCase(s) : 'All stations'}
            </button>
          ))}
        </div>
        <span className="ml-auto text-sm text-slate-400">{data?.length ?? 0} active tickets</span>
        <button onClick={() => document.documentElement.requestFullscreen?.()} className="rounded-md p-2 text-slate-400 hover:bg-slate-800" title="Full screen" aria-label="Full screen"><Maximize2 className="h-4 w-4" /></button>
      </div>
      {isLoading ? <PageLoader /> : !data?.length ? (
        <div className="flex flex-1 items-center justify-center"><EmptyState icon={<BellRing className="h-12 w-12 text-slate-700" />} title="All caught up" description="New tickets appear here the moment they're sent." /></div>
      ) : (
        <div className="grid flex-1 auto-rows-max grid-cols-1 gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
          {data.map((t) => {
            const age = minutesSince(t.firedAt, now);
            const allReady = t.items.every((i) => i.status === 'READY');
            return (
              <div key={t.orderId} className={clsx('flex flex-col overflow-hidden rounded-xl bg-slate-900 ring-2',
                allReady ? 'ring-emerald-500' : age >= 20 ? 'ring-red-500' : age >= 10 ? 'ring-amber-500' : 'ring-slate-700')}>
                <div className={clsx('flex items-center justify-between px-4 py-2.5',
                  allReady ? 'bg-emerald-600' : age >= 20 ? 'bg-red-600' : age >= 10 ? 'bg-amber-600' : 'bg-slate-800')}>
                  <div>
                    <p className="text-lg font-bold">#{t.orderNumber} · {t.tableLabel ? `Table ${t.tableLabel}` : titleCase(t.orderType)}</p>
                    {t.customerName && <p className="text-xs opacity-80">{t.customerName}</p>}
                  </div>
                  <span className="tabular text-xl font-bold">{elapsed(t.firedAt, now)}</span>
                </div>
                {t.notes && <p className="border-b border-slate-800 bg-amber-950/40 px-4 py-2 text-sm text-amber-300">{t.notes}</p>}
                <ul className="flex-1 divide-y divide-slate-800">
                  {t.items.map((i) => {
                    const next = NEXT[i.status];
                    return (
                      <li key={i.id}>
                        <button disabled={!editable || !next || advance.isPending} onClick={() => next && advance.mutate({ item: i, status: next })}
                          className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-slate-800/60 disabled:cursor-default">
                          <span className="tabular text-xl font-bold text-brand-400">{i.quantity}</span>
                          <span className="flex-1">
                            <span className={clsx('block text-base font-semibold', i.status === 'READY' && 'text-emerald-400 line-through')}>{i.name}</span>
                            {i.modifiers.length > 0 && <span className="block text-sm text-slate-400">+ {i.modifiers.map((m) => m.name).join(', ')}</span>}
                            {i.notes && <span className="block text-sm font-medium text-amber-400">⚠ {i.notes}</span>}
                            {!station && <span className="block text-xs uppercase text-slate-500">{i.station}</span>}
                          </span>
                          <span className={clsx('rounded px-2 py-0.5 text-xs font-semibold',
                            i.status === 'QUEUED' && 'bg-sky-900 text-sky-300', i.status === 'PREPARING' && 'bg-amber-900 text-amber-300',
                            i.status === 'READY' && 'bg-emerald-900 text-emerald-300')}>{titleCase(i.status)}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
                {editable && !allReady && (
                  <button onClick={() => bump.mutate(t.orderId)} disabled={bump.isPending}
                    className="bg-emerald-700 py-3 text-sm font-bold uppercase tracking-wide text-white hover:bg-emerald-600">
                    Bump — all ready
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function chime() {
  try {
    const ctx = new AudioContext();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.frequency.value = 880;
    g.gain.setValueAtTime(0.2, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
    o.start(); o.stop(ctx.currentTime + 0.6);
  } catch { /* audio not permitted */ }
}
