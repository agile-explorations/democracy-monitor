import type { InfrastructureThemeResult } from '@/lib/types/infrastructure';

interface InfrastructureThemeCardProps {
  theme: InfrastructureThemeResult;
}

export function InfrastructureThemeCard({ theme }: InfrastructureThemeCardProps) {
  const borderColor = theme.active ? 'border-red-200' : 'border-slate-200';
  const bgColor = theme.active ? 'bg-red-50' : 'bg-slate-50';

  return (
    <div className={`rounded-lg border ${borderColor} ${bgColor} p-3`}>
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-sm font-semibold text-slate-900">{theme.label}</h4>
        <span
          className={`px-2 py-0.5 rounded-full text-xs font-medium ${
            theme.active
              ? 'bg-red-100 text-red-800 border border-red-200'
              : 'bg-slate-100 text-slate-500 border border-slate-200'
          }`}
        >
          {theme.active ? `Active (${theme.matchCount})` : 'Inactive'}
        </span>
      </div>

      <p className="text-xs text-slate-500 mb-2">{theme.description}</p>

      {theme.matches.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-slate-600">
            Categories: {theme.categoriesInvolved.join(', ')}
          </p>
          <div className="flex flex-wrap gap-1 mt-1">
            {theme.matches.slice(0, 8).map((m, i) => (
              <span
                key={`${m.keyword}-${m.category}-${i}`}
                className="inline-block px-1.5 py-0.5 bg-white rounded text-xs text-slate-600 border border-slate-200"
              >
                {m.keyword}
                <span className="text-slate-400 ml-1">({m.category})</span>
              </span>
            ))}
            {theme.matches.length > 8 && (
              <span className="text-xs text-slate-400">+{theme.matches.length - 8} more</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
