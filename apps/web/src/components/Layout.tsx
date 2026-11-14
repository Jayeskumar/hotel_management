import { useState } from 'react';
import { NavLink, Outlet } from 'react-router';
import { clsx } from 'clsx';
import {
  BarChart3, Boxes, CalendarDays, ChefHat, ClipboardList, LayoutDashboard, LayoutGrid, LogOut, Menu as MenuIcon,
  ScrollText, Settings, UtensilsCrossed, Users, Wifi, WifiOff, X,
} from 'lucide-react';
import type { Permission } from '@tablewise/shared';
import { useAuth } from '../lib/auth';
import { useRealtime } from '../lib/realtime';
import { titleCase } from '../lib/format';

interface NavItem { to: string; label: string; icon: typeof LayoutDashboard; perms?: Permission[] }

const NAV: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/floor', label: 'Floor & Tables', icon: LayoutGrid, perms: ['orders:view'] },
  { to: '/orders', label: 'Orders', icon: ClipboardList, perms: ['orders:view'] },
  { to: '/kitchen', label: 'Kitchen Display', icon: ChefHat, perms: ['kitchen:view'] },
  { to: '/reservations', label: 'Reservations', icon: CalendarDays, perms: ['reservations:view'] },
  { to: '/menu', label: 'Menu', icon: UtensilsCrossed, perms: ['menu:manage', 'kitchen:update'] },
  { to: '/inventory', label: 'Inventory', icon: Boxes, perms: ['inventory:view'] },
  { to: '/reports', label: 'Reports', icon: BarChart3, perms: ['reports:view'] },
  { to: '/staff', label: 'Staff', icon: Users, perms: ['staff:manage'] },
  { to: '/audit', label: 'Audit Log', icon: ScrollText, perms: ['audit:view'] },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export function Layout() {
  const { session, outlet, setOutletId, logout, can } = useAuth();
  const connected = useRealtime(outlet?.id);
  const [open, setOpen] = useState(false);
  const items = NAV.filter((n) => !n.perms || n.perms.some(can));

  const sidebar = (
    <div className="flex h-full flex-col bg-slate-900 text-slate-300">
      <div className="flex items-center gap-2 px-5 py-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white"><UtensilsCrossed className="h-4 w-4" /></div>
        <div>
          <p className="text-sm font-semibold text-white">TableWise</p>
          <p className="max-w-[10rem] truncate text-xs text-slate-400">{session?.organization?.name}</p>
        </div>
      </div>
      {session && session.outlets.length > 1 && (
        <div className="px-4 pb-3">
          <select
            aria-label="Outlet"
            className="w-full rounded-lg border-0 bg-slate-800 px-3 py-2 text-sm text-white ring-1 ring-slate-700 focus:ring-brand-500"
            value={outlet?.id} onChange={(e) => setOutletId(e.target.value)}>
            {session.outlets.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </div>
      )}
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3">
        {items.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.to === '/'} onClick={() => setOpen(false)}
            className={({ isActive }) => clsx('flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition',
              isActive ? 'bg-slate-800 text-white' : 'hover:bg-slate-800/60 hover:text-white')}>
            <n.icon className="h-4 w-4 shrink-0" />
            {n.label}
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-slate-800 p-4">
        <div className="mb-3 flex items-center gap-2 text-xs">
          {connected
            ? <><Wifi className="h-3.5 w-3.5 text-emerald-400" /><span>Live updates on</span></>
            : <><WifiOff className="h-3.5 w-3.5 text-amber-400" /><span>Reconnecting…</span></>}
        </div>
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-white">{session?.user.name}</p>
            <p className="text-xs text-slate-400">{titleCase(session?.user.role ?? '')} · {outlet?.name}</p>
          </div>
          <button onClick={logout} className="rounded-md p-2 text-slate-400 hover:bg-slate-800 hover:text-white" title="Sign out" aria-label="Sign out">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-full">
      <aside className="hidden w-64 shrink-0 lg:block">{sidebar}</aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/60" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64">{sidebar}</aside>
          <button className="absolute left-64 top-3 ml-2 rounded-md bg-white p-1.5" onClick={() => setOpen(false)} aria-label="Close menu"><X className="h-5 w-5" /></button>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 lg:hidden">
          <button onClick={() => setOpen(true)} className="rounded-md p-1.5 hover:bg-slate-100" aria-label="Open menu"><MenuIcon className="h-5 w-5" /></button>
          <span className="font-semibold">TableWise</span>
          <span className="ml-auto truncate text-sm text-slate-500">{outlet?.name}</span>
        </header>
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export function Page({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  return <div className={clsx('mx-auto px-4 py-6 sm:px-6 lg:px-8', wide ? 'max-w-[1600px]' : 'max-w-7xl')}>{children}</div>;
}
