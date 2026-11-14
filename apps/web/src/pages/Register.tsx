import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useAuth } from '../lib/auth';
import { errorMessage } from '../lib/api';
import { useI18n } from '../i18n';
import { Button, Field, Input } from '../components/ui';
import { AuthShell } from './Login';

export default function Register() {
  const { register } = useAuth();
  const { t } = useI18n();
  const nav = useNavigate();
  const [form, setForm] = useState({
    organizationName: '', outletName: '', ownerName: '', email: '', password: '', currency: 'INR', timezone: 'Asia/Kolkata',
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  return (
    <AuthShell title={t('auth.registerTitle')} subtitle={t('auth.registerSubtitle')}>
      <form className="space-y-4" onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true); setError('');
        try { await register(form); nav('/settings'); } catch (err) { setError(errorMessage(err)); } finally { setBusy(false); }
      }}>
        <Field label={t('auth.businessName')}><Input required value={form.organizationName} onChange={set('organizationName')} /></Field>
        <Field label={t('auth.firstOutlet')}><Input required value={form.outletName} onChange={set('outletName')} placeholder={t('auth.firstOutletPh')} /></Field>
        <Field label={t('auth.yourName')}><Input required value={form.ownerName} onChange={set('ownerName')} /></Field>
        <Field label={t('auth.workEmail')}><Input type="email" required value={form.email} onChange={set('email')} /></Field>
        <Field label={t('auth.password')} hint={t('auth.passwordHint')}>
          <Input type="password" required minLength={10} value={form.password} onChange={set('password')} autoComplete="new-password" />
        </Field>
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p>}
        <Button type="submit" className="w-full" size="lg" loading={busy}>{t('auth.createAccount')}</Button>
      </form>
      <p className="mt-6 text-center text-sm text-slate-500">{t('auth.haveAccount')} <Link to="/" className="font-medium text-brand-700 hover:underline">{t('auth.signIn')}</Link></p>
    </AuthShell>
  );
}
