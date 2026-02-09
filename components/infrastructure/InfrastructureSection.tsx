import { useCallback, useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { analyzeInfrastructure } from '@/lib/services/infrastructure-analysis';
import type { EnhancedAssessment } from '@/lib/types';
import type { InfrastructureAssessment } from '@/lib/types/infrastructure';
import { InfrastructureOverview } from './InfrastructureOverview';
import { InfrastructureThemeCard } from './InfrastructureThemeCard';

interface InfrastructureSectionProps {
  onAssessmentLoaded?: (assessment: InfrastructureAssessment) => void;
}

export function InfrastructureSection({ onAssessmentLoaded }: InfrastructureSectionProps) {
  const [assessment, setAssessment] = useState<InfrastructureAssessment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const loadAssessment = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/snapshots/latest');
      if (!res.ok) throw new Error('Failed to fetch snapshots');
      const snapshots: Record<string, EnhancedAssessment> = await res.json();
      const result = analyzeInfrastructure(snapshots);
      setAssessment(result);
      onAssessmentLoaded?.(result);
    } catch {
      setError('Unable to load infrastructure analysis');
    } finally {
      setLoading(false);
    }
  }, [onAssessmentLoaded]);

  useEffect(() => {
    loadAssessment();
  }, [loadAssessment]);

  if (loading) {
    return (
      <Card>
        <div className="animate-pulse text-center py-6 text-slate-400">
          Analyzing infrastructure patterns...
        </div>
      </Card>
    );
  }

  if (error || !assessment) {
    return (
      <Card>
        <div className="text-center py-6 text-slate-400">{error || 'No data available'}</div>
      </Card>
    );
  }

  return (
    <Card>
      <div className="space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-base font-semibold text-slate-900">Authoritarian Infrastructure</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Cross-cutting patterns across all monitored categories
            </p>
          </div>
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-blue-600 hover:text-blue-800"
          >
            {expanded ? 'Collapse Details' : 'Expand Details'}
          </button>
        </div>

        <InfrastructureOverview assessment={assessment} />

        {expanded && (
          <div className="space-y-3 pt-2">
            {assessment.themes.map((theme) => (
              <InfrastructureThemeCard key={theme.theme} theme={theme} />
            ))}
            <p className="text-xs text-slate-400 pt-1">
              Scanned {assessment.scannedCategories} categories, {assessment.totalItemsScanned} text
              items. Assessed {new Date(assessment.assessedAt).toLocaleString()}.
            </p>
          </div>
        )}
      </div>
    </Card>
  );
}
