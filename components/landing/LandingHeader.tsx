import { ReadingLevelToggle } from './ReadingLevelToggle';
import { ThemeToggle } from './ThemeToggle';

interface LandingHeaderProps {
  lastUpdated: string | null;
}

export function LandingHeader({ lastUpdated }: LandingHeaderProps) {
  return (
    <header className="border-b border-dm-border pb-6 mb-8">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-dm-text-primary">Democracy Monitor</h1>
          <p className="text-sm text-dm-text-secondary mt-1">
            Automated analysis of the U.S. government documentary record
          </p>
          <div className="flex items-center gap-3 mt-2">
            <span className="px-1.5 py-0.5 rounded border border-dm-border text-[10px] text-dm-text-secondary">
              Experimental
            </span>
            {lastUpdated && (
              <span className="text-[11px] text-dm-muted">
                Last updated: {new Date(lastUpdated).toLocaleDateString()}
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-col sm:items-end gap-2">
          <ReadingLevelToggle />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
