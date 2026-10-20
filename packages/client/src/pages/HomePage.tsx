import { Disc3, Radio, Users, Vote } from 'lucide-react';
import { useHealthQuery } from '@/lib/api';

const features = [
  {
    icon: Users,
    title: 'Rooms for every crew',
    body: 'Spin up a room, share a code or QR, and let everyone in.',
  },
  {
    icon: Vote,
    title: 'The queue votes back',
    body: 'One upvote each. The crowd decides what plays next.',
  },
  {
    icon: Radio,
    title: 'Hosts keep it in sync',
    body: 'Owners and hosts drive playback. Everyone else stays locked in.',
  },
];

export const HomePage = () => {
  const { data, isLoading } = useHealthQuery();
  const online = data?.status === 'ok';

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-5 py-6 sm:px-8">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-xl bg-bean-400 text-ink-900">
            <Disc3 size={20} strokeWidth={2.4} />
          </span>
          <span className="font-display text-lg font-semibold tracking-tight">BigBeanBag</span>
        </div>
        <div
          className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-cream-300"
          title={data ? `API ${data.status}, database ${data.database}` : 'Checking API'}
        >
          <span
            className={`size-2 rounded-full ${online ? 'bg-mint' : 'bg-coral'} ${isLoading ? 'animate-pulseDot' : ''}`}
          />
          {isLoading ? 'Checking API' : online ? 'API online' : 'API offline'}
        </div>
      </header>

      <section className="grid flex-1 items-center gap-12 py-16 lg:grid-cols-[1.1fr_0.9fr]">
        <div>
          <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-bean-300/30 bg-bean-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-bean-200">
            Listen together
          </p>
          <h1 className="font-display text-4xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">
            One bag.
            <br />
            <span className="text-bean-300">Everyone&apos;s taste.</span>
          </h1>
          <p className="mt-5 max-w-lg text-base leading-relaxed text-cream-300 sm:text-lg">
            BigBeanBag is a shared listening room. Drop in songs and videos, upvote the next track,
            and let the host keep the whole room on the same beat.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <button type="button" className="btn-primary" disabled>
              Sign in with Google
            </button>
            <button type="button" className="btn-ghost" disabled>
              Join a room
            </button>
          </div>
          <p className="mt-3 text-xs text-cream-500">Sign-in and rooms land in the next build phase.</p>
        </div>

        <div className="card p-6">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-widest text-cream-400">
              Room preview
            </p>
            <span className="rounded-md bg-mint/10 px-2 py-1 text-[11px] font-semibold text-mint">
              LIVE
            </span>
          </div>
          <div className="mt-4 space-y-2">
            {[
              { title: 'Midnight City', artist: 'M83', votes: 7, tone: 'bg-bean-400/20' },
              { title: 'Redbone', artist: 'Childish Gambino', votes: 4, tone: 'bg-mint/15' },
              { title: 'Nights', artist: 'Frank Ocean', votes: 2, tone: 'bg-coral/15' },
            ].map((track) => (
              <div
                key={track.title}
                className="flex items-center gap-3 rounded-xl border border-white/5 bg-ink-900/60 p-3"
              >
                <span className={`size-10 shrink-0 rounded-lg ${track.tone}`} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{track.title}</span>
                  <span className="block truncate text-xs text-cream-400">{track.artist}</span>
                </span>
                <span className="rounded-full bg-white/5 px-2.5 py-1 text-xs font-semibold text-cream-200">
                  ▲ {track.votes}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-5 grid grid-cols-2 gap-2 text-center text-xs text-cream-400">
            <div className="rounded-xl border border-white/5 bg-ink-900/60 p-3">
              <p className="text-lg font-semibold text-cream-100">12</p>
              listening
            </div>
            <div className="rounded-xl border border-white/5 bg-ink-900/60 p-3">
              <p className="text-lg font-semibold text-cream-100">28</p>
              songs queued
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-3 pb-10 sm:grid-cols-3">
        {features.map((feature) => (
          <article key={feature.title} className="card p-5">
            <feature.icon size={18} className="text-bean-300" />
            <h2 className="mt-3 text-sm font-semibold">{feature.title}</h2>
            <p className="mt-1 text-sm leading-relaxed text-cream-400">{feature.body}</p>
          </article>
        ))}
      </section>
    </main>
  );
};
