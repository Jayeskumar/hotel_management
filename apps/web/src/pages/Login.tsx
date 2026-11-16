import { useState } from 'react';
import { Link } from 'react-router';
import { UtensilsCrossed } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { errorMessage } from '../lib/api';
import { LanguageToggle, useI18n } from '../i18n';
import { Button, Field, Input } from '../components/ui';

export function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  const { t } = useI18n();
  return (
    <div className="flex min-h-full">
      <div className="hidden flex-1 flex-col justify-between bg-gradient-to-br from-brand-800 to-slate-900 p-12 text-white lg:flex">
        <div className="flex items-center gap-2 text-lg font-semibold">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/15"><UtensilsCrossed className="h-5 w-5" /></div>
          {t('app.name')} <span className="text-sm font-normal text-brand-200">· {t('app.tagline')}</span>
        </div>
        <div className="max-w-md">
          <h2 className="text-3xl font-semibold leading-snug">{t('auth.heroTitle')}</h2>
          <p className="mt-4 text-brand-100">{t('auth.heroBody')}</p>
        </div>
        <p className="text-sm text-brand-200">© {new Date().getFullYear()} TableWise</p>
      </div>
      <div className="relative flex flex-1 items-center justify-center px-6 py-12">
        <LanguageToggle className="absolute right-6 top-6" />
        <div className="w-full max-w-sm">
          <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
          <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
          <div className="mt-8">{children}</div>
        </div>
      </div>
    </div>
  );
}

export function LoginPage({ signupAllowed = true }: { signupAllowed?: boolean }) {
  const { login } = useAuth();
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  return (
    <AuthShell title={t('auth.signIn')} subtitle={t('auth.signInSubtitle')}>
      <form className="space-y-4" onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError('');
        try { await login(email, password); } catch (err) { setError(errorMessage(err)); } finally { setBusy(false); }
      }}>
        <Field label={t('common.email')}><Input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} autoFocus /></Field>
        <Field label={t('auth.password')}><Input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p>}
        <Button type="submit" className="w-full" size="lg" loading={busy}>{t('auth.signIn')}</Button>
      </form>
      {signupAllowed && (
        <p className="mt-6 text-center text-sm text-slate-500">
          {t('auth.newRestaurant')} <Link to="/register" className="font-medium text-brand-700 hover:underline">{t('auth.createAccount')}</Link>
        </p>
      )}
    </AuthShell>
  );
}
