import { useEffect, useRef, useState } from "react";
import { ChevronDown, Loader2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { cn } from "../lib/classnames";

type RunStatusProps = {
  isGenerating: boolean;
  logs: string[];
  content: string;
  reasoning: string;
  tone?: "dark" | "light";
};

export function RunStatus({
  isGenerating,
  logs,
  content,
  reasoning,
  tone = "dark",
}: RunStatusProps) {
  const [showReasoning, setShowReasoning] = useState(false);
  const logRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const reasoningRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [logs]);

  useEffect(() => {
    contentRef.current?.scrollTo({ top: contentRef.current.scrollHeight });
  }, [content]);

  useEffect(() => {
    if (showReasoning) {
      reasoningRef.current?.scrollTo({ top: reasoningRef.current.scrollHeight });
    }
  }, [reasoning, showReasoning]);

  if (!isGenerating) return null;

  const latest = logs[0]?.replace(/^\d{2}:\d{2}:\d{2}\s*/, "") || "Preparing local run...";
  const isDark = tone === "dark";

  return (
    <div className={cn(
      "overflow-hidden rounded-xl border",
      isDark ? "border-white/10 bg-white/[0.06]" : "border-black/5 bg-white shadow-sm"
    )}>
      <div className={cn(
        "flex items-center justify-between gap-4 border-b px-4 py-3",
        isDark ? "border-white/10" : "border-black/5"
      )}>
        <div className="flex min-w-0 items-center gap-3">
          <div className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
            isDark ? "bg-white/10 text-white" : "bg-black text-white"
          )}>
            <Loader2 className="h-4.5 w-4.5 animate-spin" />
          </div>
          <div className="min-w-0">
            <div className={cn("text-sm font-semibold", isDark ? "text-white" : "text-black")}>
              Model Run Active
            </div>
            <div className={cn("mt-0.5 truncate text-xs", isDark ? "text-white/50" : "text-black/45")}>
              {latest}
            </div>
          </div>
        </div>
        <span className={cn(
          "shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold",
          isDark ? "bg-emerald-400/15 text-emerald-200" : "bg-emerald-50 text-emerald-700"
        )}>
          Streaming
        </span>
      </div>

      <div className="grid grid-cols-1">
        <div
          ref={logRef}
          className={cn(
            "max-h-28 overflow-y-auto px-4 py-3 font-mono text-[10px] leading-relaxed custom-scrollbar",
            isDark ? "text-white/45" : "text-black/45"
          )}
        >
          {logs.length > 0 ? logs.map((line) => (
            <div key={line} className="truncate">{line}</div>
          )) : <div>Waiting for first event...</div>}
        </div>

        {content && (
          <div
            ref={contentRef}
            className={cn(
              "max-h-72 overflow-y-auto border-t px-4 py-4 text-sm leading-relaxed custom-scrollbar",
              isDark ? "border-white/10 bg-black/20 text-white/80" : "border-black/5 bg-[#FDFCFB] text-black/75"
            )}
          >
            <ReactMarkdown>{content}</ReactMarkdown>
          </div>
        )}

        {reasoning && (
          <div className={cn(
            "border-t",
            isDark ? "border-white/10 text-white/45" : "border-black/5 text-black/45"
          )}>
            <button
              type="button"
              onClick={() => setShowReasoning((value) => !value)}
              className={cn(
                "flex w-full items-center justify-between px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest",
                isDark ? "hover:bg-white/5" : "hover:bg-black/[0.02]"
              )}
            >
              <span>Reasoning stream</span>
              <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", showReasoning && "rotate-180")} />
            </button>
            {showReasoning && (
              <div ref={reasoningRef} className="max-h-40 overflow-y-auto whitespace-pre-wrap px-4 pb-4 font-mono text-[10px] leading-relaxed custom-scrollbar">
                {reasoning}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
