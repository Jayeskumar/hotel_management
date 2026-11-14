import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useAuth } from '../lib/auth';
import { errorMessage } from '../lib/api';
import { Button, Field, Input, Select } from '../components/ui';
import { AuthShell } from './Login';

const CURRENCIES = ['USD', 'EUR', 'GBP', 'INR', 'AED', 'SGD', 'AUD', 'CAD', 'JPY'];

export default function Register() {
  const { register } = useAuth();
  const nav = useNavigate();
  const [form, setForm] = useState({
    organizationName: '', outletName: '', ownerName: '', email: '', password: '',
    currency: 'USD', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value });

  return (
    <AuthShell title="Create your workspace" subtitle="Set up your restaurant group and first outlet.">
      <form className="space-y-4" onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true); setError('');
        try { await register(form); nav('/settings'); } catch (err) { setError(errorMessage(err)); } finally { setBusy(false); }
      }}>
        <Field label="Business name"><Input required value={form.organizationName} onChange={set('organizationName')} /></Field>
        <Field label="First outlet name"><Input required value={form.outletName} onChange={set('outletName')} placeholder="e.g. Downtown" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Currency"><Select value={form.currency} onChange={set('currency')}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</Select></Field>
          <Field label="Timezone"><Input required value={form.timezone} onChange={set('timezone')} /></Field>
        </div>
        <Field label="Your name"><Input required value={form.ownerName} onChange={set('ownerName')} /></Field>
        <Field label="Work email"><Input type="email" required value={form.email} onChange={set('email')} /></Field>
        <Field label="Password" hint="At least 10 characters, with a letter and a number.">
          <Input type="password" required minLength={10} value={form.password} onChange={set('password')} autoComplete="new-password" />
        </Field>
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p>}
        <Button type="submit" className="w-full" size="lg" loading={busy}>Create account</Button>
      </form>
      <p className="mt-6 text-center text-sm text-slate-500">Already have an account? <Link to="/" className="font-medium text-brand-700 hover:underline">Sign in</Link></p>
    </AuthShell>
  );
}
