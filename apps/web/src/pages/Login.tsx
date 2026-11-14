import { useState } from 'react';
import { Link } from 'react-router';
import { UtensilsCrossed } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { errorMessage } from '../lib/api';
import { Button, Field, Input } from '../components/ui';

export function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-full">
      <div className="hidden flex-1 flex-col justify-between bg-gradient-to-br from-brand-800 to-slate-900 p-12 text-white lg:flex">
        <div className="flex items-center gap-2 text-lg font-semibold">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/15"><UtensilsCrossed className="h-5 w-5" /></div>
          TableWise
        </div>
        <div className="max-w-md">
          <h2 className="text-3xl font-semibold leading-tight">Run every table, ticket and till from one place.</h2>
          <p className="mt-4 text-brand-100">Floor management, kitchen display, split payments, reservations, inventory and real-time reporting — across all your outlets.</p>
        </div>
        <p className="text-sm text-brand-200">© {new Date().getFullYear()} TableWise</p>
      </div>
      <div className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
          <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
          <div className="mt-8">{children}</div>
        </div>
      </div>
    </div>
  );
}

export function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  return (
    <AuthShell title="Sign in" subtitle="Welcome back. Sign in to your workspace.">
      <form className="space-y-4" onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError('');
        try { await login(email, password); } catch (err) { setError(errorMessage(err)); } finally { setBusy(false); }
      }}>
        <Field label="Email"><Input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} autoFocus /></Field>
        <Field label="Password"><Input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p>}
        <Button type="submit" className="w-full" size="lg" loading={busy}>Sign in</Button>
      </form>
      <p className="mt-6 text-center text-sm text-slate-500">
        New restaurant? <Link to="/register" className="font-medium text-brand-700 hover:underline">Create an account</Link>
      </p>
    </AuthShell>
  );
}
