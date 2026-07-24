/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Single source of truth for the workflow progress stepper. Previously this markup
 * was duplicated (and drifting) in ReviewModal and DetailModal; both now render
 * this component. `size="md"` matches the review workspace, `size="sm"` the
 * compact detail view.
 */
interface WorkflowStepperProps {
  workflow: string[];
  stageIndex: number;
  size?: 'sm' | 'md';
  className?: string;
}

export default function WorkflowStepper({ workflow, stageIndex, size = 'md', className = '' }: WorkflowStepperProps) {
  const sm = size === 'sm';
  const dot = sm ? 'w-5 h-5 text-[9px]' : 'w-6 h-6 text-[10px]';
  const labelSize = sm ? 'text-[8px] max-w-[60px]' : 'text-[9px] tracking-tight max-w-[80px]';
  const itemMin = sm ? 'min-w-[80px]' : 'min-w-[100px]';
  const connMin = sm ? 'min-w-[10px]' : 'min-w-[20px]';
  const activeExtra = sm ? 'font-extrabold' : 'font-extrabold animate-pulse';

  return (
    <div className={`bg-surface-hover/30 p-4 border border-border/40 rounded flex items-center gap-1 overflow-x-auto ${className}`}>
      {workflow.map((step, idx) => {
        const done = idx < stageIndex;
        const active = idx === stageIndex;
        return (
          <div key={`${step}-${idx}`} className={`flex items-center gap-1 flex-1 ${itemMin}`}>
            <div className="flex flex-col items-center flex-1">
              <div
                className={`${dot} rounded-full flex items-center justify-center font-mono font-bold border transition-all ${
                  done
                    ? 'bg-brand-green/10 border-brand-green text-brand-green'
                    : active
                    ? `bg-accent/15 border-accent text-accent ${activeExtra}`
                    : 'border-border text-text-dim'
                }`}
              >
                {done ? '✓' : idx + 1}
              </div>
              <span
                className={`font-mono uppercase mt-1 truncate ${labelSize} ${
                  active ? 'text-accent font-bold' : done ? 'text-brand-green' : 'text-text-dim'
                }`}
                title={step}
              >
                {step}
              </span>
            </div>
            {idx < workflow.length - 1 && (
              <div
                className={`h-[1px] flex-1 ${connMin} translate-y-[-8px] ${
                  idx < stageIndex ? 'bg-brand-green' : 'bg-border/40'
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
