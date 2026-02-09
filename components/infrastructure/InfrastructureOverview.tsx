import type { InfrastructureAssessment, ConvergenceLevel } from '@/lib/types/infrastructure';

const CONVERGENCE_COLORS: Record<ConvergenceLevel, string> = {
  none: 'bg-green-100 text-green-800 border-green-200',
  emerging: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  active: 'bg-orange-100 text-orange-800 border-orange-200',
  entrenched: 'bg-red-100 text-red-800 border-red-200',
};

const CONVERGENCE_LABELS: Record<ConvergenceLevel, string> = {
  none: 'No Convergence',
  emerging: 'Emerging',
  active: 'Active',
  entrenched: 'Entrenched',
};

interface InfrastructureOverviewProps {
  assessment: InfrastructureAssessment;
}

export function InfrastructureOverview({ assessment }: InfrastructureOverviewProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <span
          className={`px-2 py-1 rounded-full border text-xs font-medium cursor-help ${CONVERGENCE_COLORS[assessment.convergence]}`}
          title={`${assessment.activeThemeCount} of 3 infrastructure themes active (score: ${assessment.convergenceScore})`}
        >
          {CONVERGENCE_LABELS[assessment.convergence]}
          {assessment.convergenceScore > 0 && (
            <span className="ml-1 opacity-75">({assessment.convergenceScore})</span>
          )}
        </span>
        <span className="text-xs text-slate-500">
          {assessment.activeThemeCount}/3 themes active across {assessment.scannedCategories}{' '}
          categories
        </span>
      </div>

      <p className="text-sm text-slate-700">{assessment.convergenceNote}</p>

      <div className="flex gap-4">
        {assessment.themes.map((theme) => (
          <div
            key={theme.theme}
            className={`flex items-center gap-1.5 ${
              theme.active ? 'text-slate-800' : 'text-slate-400'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${theme.active ? 'bg-red-500' : 'bg-slate-300'}`}
            />
            <span className="text-xs">
              {theme.label} ({theme.matchCount})
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
