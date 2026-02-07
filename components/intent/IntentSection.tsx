import React, { useEffect, useState } from 'react';
import type { IntentAssessment } from '@/lib/types/intent';
import { Card } from '@/components/ui/Card';
import { IntentOverview } from './IntentOverview';
import { PolicyAreaBreakdown } from './PolicyAreaBreakdown';
import { RhetoricActionGap } from './RhetoricActionGap';
import { RecentStatements } from './RecentStatements';

interface IntentSectionProps {
  onAssessmentLoaded?: (assessment: IntentAssessment) => void;
}

export function IntentSection({ onAssessmentLoaded }: IntentSectionProps) {
  const [assessment, setAssessment] = useState<IntentAssessment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    loadAssessment();
  }, []);

  const loadAssessment = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/intent/assess');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      setAssessment(data);
      if (onAssessmentLoaded) onAssessmentLoaded(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load intent assessment');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <h2 className="text-lg font-bold text-slate-900 mb-2">Section 1: Administration&apos;s Intent</h2>
        <p className="text-sm text-slate-500">Loading governance assessment...</p>
      </Card>
    );
  }

  if (error || !assessment) {
    return (
      <Card>
        <h2 className="text-lg font-bold text-slate-900 mb-2">Section 1: Administration&apos;s Intent</h2>
        <p className="text-sm text-red-600">{error || 'No assessment data available'}</p>
        <button onClick={loadAssessment} className="text-xs text-blue-600 underline mt-1">Retry</button>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-slate-900">Section 1: Administration&apos;s Intent</h2>
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-blue-600 hover:text-blue-800 underline"
          >
            {expanded ? 'Collapse' : 'Expand Details'}
          </button>
        </div>

        <IntentOverview assessment={assessment} />

        <div className="mt-4">
          <RhetoricActionGap
            rhetoricScore={assessment.rhetoricScore}
            actionScore={assessment.actionScore}
            gap={assessment.gap}
            gaps={[]}
          />
        </div>
      </Card>

      {expanded && (
        <>
          <Card>
            <PolicyAreaBreakdown policyAreas={assessment.policyAreas} />
          </Card>
          <Card>
            <RecentStatements statements={assessment.recentStatements} />
          </Card>
        </>
      )}
    </div>
  );
}
