/**
 * Minimal placeholder shown for admin modules that are not yet built.
 * Renders the module name and a "Coming Soon" note — nothing more.
 */
export function ComingSoon({ title }: { title: string }) {
  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto">
      <h1 className="text-xl font-semibold text-white">{title}</h1>
      <p className="text-sm text-slate-500 mt-1">Coming Soon</p>
    </div>
  );
}
