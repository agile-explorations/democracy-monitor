import type { SuppressionAlert as SuppressionAlertType } from '@/lib/types/resilience';

interface SuppressionAlertProps {
  alerts: SuppressionAlertType[];
}

const SEVERITY_STYLES = {
  warning: {
    border: 'border-yellow-300',
    bg: 'bg-yellow-50',
    text: 'text-yellow-800',
    icon: '\u26A0',
  },
  drift: {
    border: 'border-orange-300',
    bg: 'bg-orange-50',
    text: 'text-orange-800',
    icon: '\u26A0',
  },
  capture: {
    border: 'border-red-300',
    bg: 'bg-red-50',
    text: 'text-red-800',
    icon: '\u2622',
  },
};

export function SuppressionAlertComponent({ alerts }: SuppressionAlertProps) {
  if (alerts.length === 0) return null;

  return (
    <div className="space-y-2">
      {alerts.map((alert, idx) => {
        const style = SEVERITY_STYLES[alert.severity];
        return (
          <div
            key={idx}
            className={`border ${style.border} ${style.bg} rounded px-3 py-2 text-xs ${style.text}`}
          >
            <div className="flex items-start gap-2">
              <span className="text-base leading-none">{style.icon}</span>
              <div>
                <p className="font-semibold">
                  {alert.type === 'content_removed' && 'Content Removal Detected'}
                  {alert.type === 'content_changed' && 'Significant Content Change'}
                  {alert.type === 'site_down' && 'Government Site Down'}
                  {alert.type === 'report_missing' && 'Expected Report Missing'}
                </p>
                <p className="mt-0.5">{alert.message}</p>
                <p className="text-[10px] mt-1 opacity-75">
                  Detected: {new Date(alert.detectedAt).toLocaleString()}
                </p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
