import React from 'react';

export function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 shadow-sm p-4 md:p-6 bg-white">
      {children}
    </div>
  );
}
