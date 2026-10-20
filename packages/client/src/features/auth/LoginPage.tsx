import { ArrowRight } from 'lucide-react';
import { Link, Navigate, useLocation, useSearchParams } from 'react-router-dom';
import { useAppSelector } from '@/app/hooks';
import { useGetAuthConfigQuery } from '@/lib/api';

const errors: Record<string, string> = {
  google: 'Google sign-in did not complete. Please try again.',
  unconfigured: 'This server has no Google credentials configured yet.',
};

export const LoginPage = () => {
  const status = useAppSelector((state) => state.auth.status);
  const { data: config } = useGetAuthConfigQuery();
  const [params] = useSearchParams();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;
  const error = params.get('error');
  const googleEnabled = config?.googleEnabled ?? true;
  const googleHref = from ? `/auth/google?returnTo=${encodeURIComponent(from)}` : '/auth/google';

  if (status === 'authenticated') return <Navigate to="/rooms" replace />;

  return (
    <main className="grid min-h-screen place-items-center px-5 py-10">
      <div className="w-full max-w-md">
        <Link to="/" className="mb-8 flex items-center justify-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-xl bg-bean-400 text-sm font-bold text-ink-900">
            B
          </span>
          <span className="font-display text-lg font-semibold">BigBeanBag</span>
        </Link>

        <div className="card p-7">
          <h1 className="font-display text-2xl font-semibold">Pick up your bean</h1>
          <p className="mt-2 text-sm leading-relaxed text-cream-400">
            Sign in to create a listening room, queue tracks, and vote with your crew.
          </p>

          {error ? (
            <p className="mt-5 rounded-xl border border-coral/30 bg-coral/10 px-3.5 py-2.5 text-sm text-coral">
              {errors[error] ?? 'Sign-in failed. Please try again.'}
            </p>
          ) : null}

          {googleEnabled ? (
            <a href={googleHref} className="btn-primary mt-6 w-full">
              Continue with Google
              <ArrowRight size={16} />
            </a>
          ) : (
            <div className="mt-6 rounded-xl border border-white/10 bg-white/5 px-3.5 py-3 text-sm text-cream-400">
              Google sign-in is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET, then
              restart the server.
            </div>
          )}

          <p className="mt-4 text-center text-xs leading-relaxed text-cream-500">
            We only store your name, email, and avatar so rooms know who is in the bag.
          </p>
        </div>
      </div>
    </main>
  );
};
