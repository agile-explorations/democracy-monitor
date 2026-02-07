import { useCallback, useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';
import type { IntentAssessment } from '@/lib/types/intent';
import { IntentOverview } from './IntentOverview';
import { PolicyAreaBreakdown } from './PolicyAreaBreakdown';
import { RecentStatements } from './RecentStatements';
import { RhetoricActionGap } from './RhetoricActionGap';

interface IntentSectionProps {
  onAssessmentLoaded?: (assessment: IntentAssessment) => void;
}

export function IntentSection({ onAssessmentLoaded }: IntentSectionProps) {
  const [assessment, setAssessment] = useState<IntentAssessment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const loadAssessment = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/intent/assess');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      setAssessment(data);
      if (onAssessmentLoaded) onAssessmentLoaded(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load intent assessment');
    } finally {
      setLoading(false);
    }
  }, [onAssessmentLoaded]);

  useEffect(() => {
    loadAssessment();
  }, [loadAssessment]);

  if (loading) {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-bold text-slate-900 pt-2">
          Section 1: Administration&apos;s Intent
        </h2>
        <Card>
          <p className="text-sm text-slate-500">Loading governance assessment...</p>
        </Card>
      </div>
    );
  }

  if (error || !assessment) {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-bold text-slate-900 pt-2">
          Section 1: Administration&apos;s Intent
        </h2>
        <Card>
          <p className="text-sm text-red-600">{error || 'No assessment data available'}</p>
          <button onClick={loadAssessment} className="text-xs text-blue-600 underline mt-1">
            Retry
          </button>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-slate-900 pt-2">
        Section 1: Administration&apos;s Intent
      </h2>

      <Card>
        <IntentOverview assessment={assessment} />

        <div className="mt-4">
          <RhetoricActionGap
            rhetoricScore={assessment.rhetoricScore}
            actionScore={assessment.actionScore}
            gap={assessment.gap}
            gaps={[]}
          />
        </div>

        <div className="mt-3 text-center">
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-blue-600 hover:text-blue-800 underline"
          >
            {expanded ? 'Collapse Details' : 'Expand Details'}
          </button>
        </div>

        {expanded && (
          <div className="mt-4 space-y-4 border-t border-slate-200 pt-4">
            <PolicyAreaBreakdown policyAreas={assessment.policyAreas} />
            <RecentStatements statements={assessment.recentStatements} />
          </div>
        )}
      </Card>
    </div>
  );
}
