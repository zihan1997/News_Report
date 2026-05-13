import { ChevronRight, Moon, Sun } from "lucide-react";
import { cn } from "../../../shared/lib/classnames";
import { LlmRuntime, ReportDepth } from "../../../types";

export const REPORT_DEPTHS: Array<{
  value: ReportDepth;
  label: string;
  caption: string;
  detail: string;
}> = [
  { value: "fast", label: "Fast", caption: "5-7 items", detail: "Lean scan" },
  { value: "balanced", label: "Balanced", caption: "7-9 items", detail: "Daily default" },
  { value: "wide", label: "Wide", caption: "8-10 items", detail: "Broader read" },
];

type GeneratePanelProps = {
  isGenerating: boolean;
  llmRuntime: LlmRuntime;
  onRuntimeChange: (runtime: LlmRuntime) => void;
  healthStatus: "loading" | "ok" | "error";
  modelName?: string;
  reportDepth: ReportDepth;
  onReportDepthChange: (depth: ReportDepth) => void;
  onGenerate: (type: "morning" | "evening") => void;
  error: string | null;
};

export function GeneratePanel({
  isGenerating,
  llmRuntime,
  onRuntimeChange,
  healthStatus,
  modelName,
  reportDepth,
  onReportDepthChange,
  onGenerate,
  error,
}: GeneratePanelProps) {
  return (
    <div className="bg-white border border-black/5 text-black p-7 rounded-2xl space-y-7 shadow-sm">
      <div>
        <h2 className="text-2xl font-serif font-bold mb-2 tracking-tight">Generate</h2>
        <p className="text-black/50 text-[15px] leading-relaxed">Get the latest high-signal news summarized by AI.</p>
      </div>

      <div className="space-y-2.5">
        <div className="flex rounded-xl bg-black/[0.04] p-1">
          {(["cloud", "local"] as LlmRuntime[]).map((runtime) => (
            <button
              key={runtime}
              type="button"
              disabled={isGenerating}
              onClick={() => onRuntimeChange(runtime)}
              className={cn(
                "flex-1 rounded-lg py-2.5 text-sm font-semibold capitalize transition-all disabled:opacity-50",
                llmRuntime === runtime
                  ? "bg-white text-black shadow-sm ring-1 ring-black/5"
                  : "text-black/40 hover:text-black"
              )}
            >
              {runtime}
            </button>
          ))}
        </div>
        <div className="truncate px-1 text-xs font-medium text-black/35">
          {healthStatus === "loading" ? `Checking ${llmRuntime}...` : modelName || `${llmRuntime} model not configured`}
        </div>
      </div>

      <div className="space-y-3.5">
        <div className="flex items-center justify-between px-1">
          <span className="text-sm font-semibold text-black/65">Coverage</span>
          <span className="text-xs font-medium text-black/35">
            {REPORT_DEPTHS.find((option) => option.value === reportDepth)?.caption}
          </span>
        </div>
        <div className="space-y-2">
          {REPORT_DEPTHS.map((option) => {
            const active = option.value === reportDepth;
            return (
              <button
                key={option.value}
                type="button"
                disabled={isGenerating}
                onClick={() => onReportDepthChange(option.value)}
                className={cn(
                  "group flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left transition-all disabled:opacity-50",
                  active
                    ? "border-indigo-100 bg-indigo-50 text-indigo-950 shadow-sm"
                    : "border-black/10 bg-black/[0.02] text-black/55 hover:border-black/20 hover:bg-black/[0.04] hover:text-black"
                )}
              >
                <div className="min-w-0">
                  <div className="text-sm font-semibold leading-none">{option.label}</div>
                  <div className={cn(
                    "mt-1.5 truncate text-xs",
                    active ? "text-indigo-700/60" : "text-black/35"
                  )}>
                    {option.detail} · {option.caption}
                  </div>
                </div>
                <div className={cn(
                  "ml-3 h-2.5 w-2.5 shrink-0 rounded-full border",
                  active ? "border-indigo-500 bg-indigo-500" : "border-black/20 bg-transparent"
                )} />
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-3">
        <button
          disabled={isGenerating}
          onClick={() => onGenerate("morning")}
          className="w-full bg-amber-50 text-amber-900 border border-amber-100 py-4.5 px-5 rounded-2xl font-semibold text-[15px] flex items-center justify-between hover:bg-amber-100/70 transition-colors disabled:opacity-50"
        >
          <span className="flex items-center gap-2"><Sun className="w-5 h-5" /> Morning</span>
          <ChevronRight className="w-5 h-5" />
        </button>
        <button
          disabled={isGenerating}
          onClick={() => onGenerate("evening")}
          className="w-full bg-indigo-50 text-indigo-950 border border-indigo-100 py-4.5 px-5 rounded-2xl font-semibold text-[15px] flex items-center justify-between hover:bg-indigo-100/70 transition-colors disabled:opacity-50"
        >
          <span className="flex items-center gap-2"><Moon className="w-5 h-5" /> Evening</span>
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-100 rounded-xl text-sm leading-relaxed text-red-600">
          {error}
        </div>
      )}
    </div>
  );
}
