import { AppHeader } from '@/components/AppHeader';

export const RoomsPage = () => (
  <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-5 py-6 sm:px-8">
    <AppHeader />
    <section className="grid flex-1 place-items-center">
      <div className="card max-w-lg p-8 text-center">
        <h1 className="font-display text-2xl font-semibold">Rooms are next</h1>
        <p className="mt-2 text-sm leading-relaxed text-cream-400">
          You are signed in. Creating, joining, and sharing rooms lands in the next build step.
        </p>
      </div>
    </section>
  </main>
);
