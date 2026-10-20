export const Loader = ({ label = 'Loading' }: { label?: string }) => (
  <div className="grid min-h-[50vh] place-items-center">
    <div className="flex flex-col items-center gap-3 text-cream-400">
      <span className="size-9 animate-spin rounded-full border-2 border-white/10 border-t-bean-300" />
      <p className="text-sm">{label}</p>
    </div>
  </div>
);
