import { lazy, Suspense, type ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router';
import type { Permission } from '@tablewise/shared';
import { useAuth } from './lib/auth';
import { useI18n } from './i18n';
import { useSystemInfo } from './lib/system';
import { Layout } from './components/Layout';
import { EmptyState, PageLoader } from './components/ui';
import { LoginPage } from './pages/Login';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const Floor = lazy(() => import('./pages/Floor'));
const OrderScreen = lazy(() => import('./pages/OrderScreen'));
const Orders = lazy(() => import('./pages/Orders'));
const Kitchen = lazy(() => import('./pages/Kitchen'));
const Reservations = lazy(() => import('./pages/Reservations'));
const MenuPage = lazy(() => import('./pages/Menu'));
const Inventory = lazy(() => import('./pages/Inventory'));
const Reports = lazy(() => import('./pages/Reports'));
const Staff = lazy(() => import('./pages/Staff'));
const AuditLog = lazy(() => import('./pages/AuditLog'));
const SettingsPage = lazy(() => import('./pages/Settings'));
const Register = lazy(() => import('./pages/Register'));

function Guard({ perms, children }: { perms?: Permission[]; children: ReactNode }) {
  const { can } = useAuth();
  const { t } = useI18n();
  if (perms && !perms.some(can)) {
    return <EmptyState title={t('common.accessRestricted')} description={t('common.accessRestrictedDesc')} />;
  }
  return <>{children}</>;
}

export function App() {
  const { session, loading, outlet } = useAuth();
  const { t } = useI18n();
  const system = useSystemInfo();
  if (loading || (!session && system.isLoading)) return <PageLoader />;

  if (!session) {
    // A brand-new on-prem install goes straight to the setup wizard.
    if (system.data?.setupRequired) {
      return <Suspense fallback={<PageLoader />}><Register setup /></Suspense>;
    }
    return (
      <Suspense fallback={<PageLoader />}>
        <Routes>
          {system.data?.signupAllowed !== false && <Route path="/register" element={<Register />} />}
          <Route path="*" element={<LoginPage signupAllowed={system.data?.signupAllowed !== false} />} />
        </Routes>
      </Suspense>
    );
  }
  if (!outlet) {
    return <EmptyState title={t('common.noOutlet')} description={t('common.noOutletDesc')} />;
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<S><Dashboard /></S>} />
        <Route path="floor" element={<S perms={['orders:view']}><Floor /></S>} />
        <Route path="orders" element={<S perms={['orders:view']}><Orders /></S>} />
        <Route path="orders/:orderId" element={<S perms={['orders:view']}><OrderScreen /></S>} />
        <Route path="kitchen" element={<S perms={['kitchen:view']}><Kitchen /></S>} />
        <Route path="reservations" element={<S perms={['reservations:view']}><Reservations /></S>} />
        <Route path="menu" element={<S perms={['menu:manage', 'kitchen:update']}><MenuPage /></S>} />
        <Route path="inventory" element={<S perms={['inventory:view']}><Inventory /></S>} />
        <Route path="reports" element={<S perms={['reports:view']}><Reports /></S>} />
        <Route path="staff" element={<S perms={['staff:manage']}><Staff /></S>} />
        <Route path="audit" element={<S perms={['audit:view']}><AuditLog /></S>} />
        <Route path="settings" element={<S><SettingsPage /></S>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

function S({ perms, children }: { perms?: Permission[]; children: ReactNode }) {
  const { outlet } = useAuth();
  return (
    <Guard perms={perms}>
      {/* Remount pages when the outlet changes so local state never leaks across outlets. */}
      <Suspense key={outlet?.id} fallback={<PageLoader />}>{children}</Suspense>
    </Guard>
  );
}
