import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowUpRight,
  BrainCircuit,
  Calendar,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  Database,
  EyeOff,
  FileClock,
  GitBranch,
  History,
  Info,
  Layers3,
  Loader2,
  RefreshCw,
  Sparkles,
  Zap,
} from "lucide-react";
import { motion } from "motion/react";
import ReactMarkdown from "react-markdown";
import { formatInTimeZone } from "date-fns-tz";
import { cn } from "../../../shared/lib/classnames";
import {
  applyMemoryDraftAction,
  getMemoryReview,
  MemoryDraft,
  MemoryDraftReview,
  MemoryEvent,
  MemoryItem,
  MemoryReviewResponse,
} from "../../../lib/memory";

const LA_TZ = "America/Los_Angeles";

type MemoryMode = "stories" | "narratives";

export function MemoryView() {
  const [memory, setMemory] = useState<MemoryReviewResponse | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [mode, setMode] = useState<MemoryMode>("stories");
  const [isLoading, setIsLoading] = useState(true);
  const [refreshSpinKey, setRefreshSpinKey] = useState(0);
  const [draftActionKey, setDraftActionKey] = useState("");
  const [error, setError] = useState<string | null>(null);

  const loadMemory = async (animate = false) => {
    if (animate) setRefreshSpinKey((current) => current + 1);
    setIsLoading(true);
    setError(null);
    try {
      const data = await getMemoryReview();
      setMemory(data);
      const preferred = mode === "narratives" ? data.narratives[0]?.id : data.stories[0]?.id;
      setSelectedId((current) => current || preferred || "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load memory.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadMemory();
  }, []);

  const items = mode === "narratives" ? memory?.narratives || [] : memory?.stories || [];
  const selectedItem = useMemo(
    () => items.find((item) => item.id === selectedId) || items[0] || null,
    [items, selectedId]
  );
  const latestPropagation = memory?.events[0];
  const latestTargetIds = useMemo(() => {
    const targetType = mode === "stories" ? "story" : "narrative";
    return new Set(
      (latestPropagation?.updates || [])
        .filter((update) => update.targetType === targetType)
        .map((update) => update.targetId)
    );
  }, [latestPropagation, mode]);

  const stats = [
    { label: "Stories", value: memory?.stories.length || 0, icon: GitBranch, color: "text-blue-500" },
    { label: "Narratives", value: memory?.narratives.length || 0, icon: Layers3, color: "text-indigo-500" },
    { label: "Events", value: memory?.events.length || 0, icon: FileClock, color: "text-emerald-500" },
    {
      label: "Candidates",
      value: memory?.drafts.reduce((sum, draft) => sum + draft.newCandidates.length, 0) || 0,
      icon: Sparkles,
      color: "text-amber-500",
    },
  ];

  const handleDraftAction = async (fileName: string, candidateIndex: number, action: "promote" | "dismiss") => {
    const actionKey = `${fileName}-${candidateIndex}-${action}`;
    setDraftActionKey(actionKey);
    setError(null);
    try {
      await applyMemoryDraftAction(fileName, candidateIndex, action);
      await loadMemory();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to apply draft action.");
    } finally {
      setDraftActionKey("");
    }
  };

  return (
    <div className="memory-console animate-in fade-in duration-500">
      <header className="memory-hero">
        <div className="memory-hero-copy">
          <div className="memory-kicker">
            <div className="memory-brain-mark">
              <BrainCircuit className="relative z-10 h-5 w-5 text-indigo-600" />
              <motion.div
                animate={{ scale: [1, 1.45, 1], opacity: [0.22, 0, 0.22] }}
                transition={{ duration: 2.2, repeat: Infinity }}
                className="absolute inset-0 rounded-2xl bg-indigo-400"
              />
            </div>
            <span>Cognitive Layer v2.4</span>
          </div>
          <h1 className="memory-page-title">
            System <span className="italic text-black/35">Memory</span>
          </h1>
        </div>

        <div className="memory-hero-actions">
          <div className="memory-telemetry">
            {stats.map((stat) => (
              <MetricPill key={stat.label} icon={stat.icon} label={stat.label} value={stat.value} color={stat.color} />
            ))}
          </div>
          <button
            onClick={() => loadMemory(true)}
            className="memory-refresh-button"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw key={refreshSpinKey} className="memory-refresh-icon h-4 w-4" />
            )}
            System Refresh
          </button>
        </div>
      </header>

      {error && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 rounded-2xl border border-red-100 bg-red-50 px-6 py-4 text-sm font-semibold text-red-600"
        >
          <Info className="h-4 w-4" />
          {error}
        </motion.div>
      )}

      {isLoading && !memory ? (
        <div className="flex min-h-[50vh] items-center justify-center rounded-[3rem] border border-black/5 bg-white shadow-sm">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="h-10 w-10 animate-spin text-indigo-500" />
            <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-black/20">Accessing datastores...</p>
          </div>
        </div>
      ) : (
        <div className="memory-workbench">
          <motion.div initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} className="memory-column flex flex-col gap-4">
            <div className="memory-section-label">
              <h3>
                <Database className="h-3 w-3" />
                Knowledge Base
              </h3>
            </div>
            <MemoryIndex
              mode={mode}
              items={items}
              latestTargetIds={latestTargetIds}
              selectedId={selectedItem?.id || ""}
              onModeChange={(nextMode) => {
                setMode(nextMode);
                const nextItems = nextMode === "narratives" ? memory?.narratives || [] : memory?.stories || [];
                setSelectedId(nextItems[0]?.id || "");
              }}
              onSelect={setSelectedId}
            />
          </motion.div>

          <motion.div
            layout
            initial={{ opacity: 0, scale: 0.985 }}
            animate={{ opacity: 1, scale: 1 }}
            className="memory-column min-w-0"
          >
            <MemoryDetail item={selectedItem} mode={mode} />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            className="memory-column memory-side-column flex flex-col gap-6"
          >
            <ActivityPanel
              events={memory?.events || []}
              drafts={memory?.drafts || []}
              reviewTrail={memory?.reviewTrail || []}
              actionKey={draftActionKey}
              onDraftAction={handleDraftAction}
            />
          </motion.div>
        </div>
      )}
    </div>
  );
}

function MetricPill({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: any;
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="memory-metric">
      <div className="memory-metric-label">
        <Icon className={cn("h-3 w-3 opacity-70", color)} />
        <span>{label}</span>
      </div>
      <span className="memory-metric-value">{String(value).padStart(2, "0")}</span>
    </div>
  );
}

function MemoryIndex({
  mode,
  items,
  latestTargetIds,
  selectedId,
  onModeChange,
  onSelect,
}: {
  mode: MemoryMode;
  items: MemoryItem[];
  latestTargetIds: Set<string>;
  selectedId: string;
  onModeChange: (mode: MemoryMode) => void;
  onSelect: (id: string) => void;
}) {
  return (
    <aside className="memory-index-shell">
      <div className="memory-index-tabs">
        {(["stories", "narratives"] as MemoryMode[]).map((tab) => (
          <button
            key={tab}
            onClick={() => onModeChange(tab)}
            className={cn(
              "memory-index-tab",
              mode === tab ? "memory-index-tab-active" : "memory-index-tab-muted"
            )}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="memory-index-list custom-scrollbar">
        {items.map((item, index) => (
          <motion.button
            key={item.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(index * 0.025, 0.18) }}
            onClick={() => onSelect(item.id)}
            className={cn(
              "memory-index-card group",
              selectedId === item.id
                ? "memory-index-card-selected"
                : "memory-index-card-muted"
            )}
          >
            <div className="memory-index-meta">
              <span
                className={cn(
                  "min-w-0 flex-1 truncate font-mono text-[9px] font-bold uppercase tracking-widest",
                  selectedId === item.id ? "text-white/40" : "text-black/20"
                )}
              >
                {item.id}
              </span>
              <div className="flex shrink-0 items-center gap-1.5">
                {latestTargetIds.has(item.id) && <span className="memory-index-latest">Latest</span>}
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[8px] font-bold uppercase tracking-[0.15em]",
                    selectedId === item.id ? "bg-white/20 text-white" : "bg-black/5 text-black/40"
                  )}
                >
                  {item.status}
                </span>
              </div>
            </div>
            <div className={cn("memory-index-title", selectedId === item.id ? "text-white" : "text-black")}>
              {item.title}
            </div>
            <div className={cn("memory-index-summary", selectedId === item.id ? "text-white/65" : "text-black/40")}>
              {item.currentState}
            </div>
            <div className="memory-index-footer">
              <div className={cn("flex items-center gap-1 font-mono text-[10px] font-bold", selectedId === item.id ? "text-indigo-300" : "text-indigo-600")}>
                <Zap className="h-3 w-3" />
                {item.confidence}
              </div>
              <ChevronRight
                className={cn(
                  "h-4 w-4 transition-transform group-hover:translate-x-1",
                  selectedId === item.id ? "text-white/25" : "text-black/10"
                )}
              />
            </div>
          </motion.button>
        ))}
        {items.length === 0 && (
          <div className="py-12 text-center text-black/20">
            <p className="text-xs font-bold uppercase tracking-widest">No entries found</p>
          </div>
        )}
      </div>
    </aside>
  );
}

function MemoryDetail({ item, mode }: { item: MemoryItem | null; mode: MemoryMode }) {
  if (!item) {
    return (
      <section className="flex h-[70vh] flex-col items-center justify-center rounded-[2.5rem] border border-dashed border-black/10 bg-black/[0.01] p-10 text-center text-black/20">
        <BrainCircuit className="mb-4 h-12 w-12" />
        <p className="text-sm font-bold uppercase tracking-widest">Initialization Required</p>
      </section>
    );
  }

  return (
    <section className="memory-detail-shell">
      <div className="memory-detail-hero">
        <div className="pointer-events-none absolute right-0 top-0 p-8 opacity-[0.025]">
          <BrainCircuit className="h-52 w-52 rotate-12" />
        </div>

        <div className="relative z-10">
          <div className="mb-7 flex flex-wrap items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black text-white">
              {mode === "stories" ? <GitBranch className="h-5 w-5" /> : <Layers3 className="h-5 w-5" />}
            </div>
            <div className="rounded-full bg-black/5 px-4 py-1.5">
              <span className="font-mono text-[10px] font-bold text-black/40">ID: {item.id}</span>
            </div>
            <div className="rounded-full bg-emerald-50 px-4 py-1.5">
              <span className="font-mono text-[10px] font-bold text-emerald-600">CONFIDENCE: {item.confidence}</span>
            </div>
          </div>

          <h2 className="memory-detail-title">{item.title}</h2>

          <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-black/5 pt-7 text-[10px] font-bold uppercase tracking-widest text-black/30">
            <div className="flex items-center gap-2">
              <Clock className="h-3.5 w-3.5" />
              <span>
                Status: <span className="text-black">{item.status}</span>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <History className="h-3.5 w-3.5" />
              <span>
                Target: <span className="text-black">{mode === "stories" ? "Discrete Story" : "Macro Narrative"}</span>
              </span>
            </div>
            {item.lastUpdated && (
              <div className="flex items-center gap-2">
                <Calendar className="h-3.5 w-3.5" />
                <span>
                  Last Updated: <span className="text-black">{item.lastUpdated}</span>
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      <article className="memory-detail-body custom-scrollbar">
        <div className="markdown-body memory-document">
          <ReactMarkdown>{stripMemoryMeta(item.content)}</ReactMarkdown>
        </div>
      </article>
    </section>
  );
}

function ActivityPanel({
  events,
  drafts,
  reviewTrail,
  actionKey,
  onDraftAction,
}: {
  events: MemoryEvent[];
  drafts: MemoryDraft[];
  reviewTrail: MemoryDraftReview[];
  actionKey: string;
  onDraftAction: (fileName: string, candidateIndex: number, action: "promote" | "dismiss") => void;
}) {
  const candidateCount = drafts.flatMap((draft) => draft.newCandidates).length;
  const [openReview, setOpenReview] = useState("");
  const activityItems = useMemo(() => {
    const eventItems = events.map((event) => ({
      kind: "event" as const,
      key: event.fileName,
      timestamp: new Date(event.createdAt || event.reportDate).getTime(),
      event,
    }));
    const draftItems = drafts.map((draft) => ({
      kind: "draft" as const,
      key: draft.fileName,
      timestamp: new Date(draft.reportDate).getTime(),
      draft,
    }));
    return [...eventItems, ...draftItems]
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 15);
  }, [events, drafts]);

  return (
    <div className="memory-activity-stack">
      <section className="memory-draft-panel">
        <div className="memory-draft-watermark">
          <Sparkles className="h-40 w-40" />
        </div>

        <div className="relative z-10">
          <div className="mb-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-white/20 p-2 backdrop-blur-sm">
                <Sparkles className="h-5 w-5 text-white" />
              </div>
              <h3 className="font-mono text-xs font-bold uppercase tracking-widest text-white">Draft Candidates</h3>
            </div>
            <span className="rounded-full bg-white/20 px-3 py-1 font-mono text-sm font-bold backdrop-blur-sm">{candidateCount}</span>
          </div>

          <div className="space-y-4">
            {drafts.flatMap((draft) =>
              draft.newCandidates.map((candidate, index) => (
                <motion.div
                  key={`${draft.fileName}-${index}`}
                  initial={{ opacity: 0, x: 14 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="memory-draft-card group/card"
                >
                  <div className="mb-2 flex items-center justify-between">
                    <span className="font-mono text-[9px] font-bold uppercase tracking-widest text-amber-600">{candidate.targetType} candidate</span>
                    <ArrowUpRight className="h-3.5 w-3.5 text-amber-600 opacity-0 transition-opacity group-hover/card:opacity-100" />
                  </div>
                  <div className="mb-2 font-serif text-xl font-bold">{candidate.title}</div>
                  <p className="text-xs italic leading-relaxed text-black/50">&quot;{candidate.reason}&quot;</p>
                  <div className="memory-draft-actions">
                    <button
                      type="button"
                      className="memory-draft-action memory-draft-action-primary"
                      disabled={Boolean(actionKey)}
                      onClick={() => onDraftAction(draft.fileName, index, "promote")}
                    >
                      {actionKey === `${draft.fileName}-${index}-promote` ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Check className="h-3.5 w-3.5" />
                      )}
                      Promote
                    </button>
                    <button
                      type="button"
                      className="memory-draft-action memory-draft-action-muted"
                      disabled={Boolean(actionKey)}
                      onClick={() => onDraftAction(draft.fileName, index, "dismiss")}
                    >
                      {actionKey === `${draft.fileName}-${index}-dismiss` ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <EyeOff className="h-3.5 w-3.5" />
                      )}
                      Dismiss
                    </button>
                  </div>
                </motion.div>
              ))
            )}
            {candidateCount === 0 && (
              <div className="rounded-3xl border border-white/30 bg-white px-6 py-8 text-center font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-amber-700 shadow-sm">
                No draft candidates pending
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="memory-review-panel">
        <div className="mb-5 flex items-center justify-between px-1">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-black/[0.03] p-2">
              <CheckCircle2 className="h-4 w-4 text-black/40" />
            </div>
            <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-black/40">Review Trail</h3>
          </div>
          <span className="font-mono text-[10px] font-bold text-black/25">{reviewTrail.length} Decisions</span>
        </div>

        <div className="space-y-3">
          {reviewTrail.slice(0, 6).map((review) => (
            <button
              key={review.fileName}
              type="button"
              onClick={() => setOpenReview((current) => current === review.fileName ? "" : review.fileName)}
              className="memory-review-card"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="mb-1 flex items-center gap-2">
                    <span className={cn("memory-review-badge", review.action === "promote" ? "memory-review-badge-promote" : "memory-review-badge-dismiss")}>
                      {review.action === "promote" ? "Promoted" : "Dismissed"}
                    </span>
                    <span className="font-mono text-[9px] font-bold uppercase tracking-widest text-black/25">{review.candidate.targetType}</span>
                  </div>
                  <div className="line-clamp-2 font-serif text-base font-bold leading-tight text-black">{review.candidate.title}</div>
                </div>
                <span className="shrink-0 font-mono text-[9px] font-bold text-black/25">
                  {formatInTimeZone(new Date(review.reviewedAt), LA_TZ, "MM-dd HH:mm")}
                </span>
              </div>
              {openReview === review.fileName && (
                <div className="mt-3 border-t border-black/5 pt-3 text-left">
                  <p className="text-xs leading-relaxed text-black/55">{review.candidate.reason}</p>
                  {review.promoted && (
                    <p className="mt-2 font-mono text-[9px] font-bold uppercase tracking-widest text-emerald-600">
                      Created {review.promoted.targetType} :: {review.promoted.targetId}
                    </p>
                  )}
                  {review.candidate.evidence.length > 0 && (
                    <ul className="mt-2 space-y-1 text-[11px] leading-relaxed text-black/45">
                      {review.candidate.evidence.slice(0, 3).map((item, index) => (
                        <li key={`${review.fileName}-evidence-${index}`}>- {item}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </button>
          ))}
          {reviewTrail.length === 0 && <EmptyMini label="No review decisions yet" />}
        </div>
      </section>

      <section className="memory-log-panel">
        <div className="mb-6 flex items-center justify-between px-1">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-black/[0.03] p-2">
              <Activity className="h-4 w-4 text-black/40" />
            </div>
            <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-black/40">Propagation Log</h3>
          </div>
          <span className="font-mono text-[10px] font-bold text-black/25">{activityItems.length} Entries</span>
        </div>

        <div className="memory-event-list custom-scrollbar">
          {activityItems.map((item, index) => (
            <motion.div key={item.key} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: Math.min(index * 0.025, 0.18) }}>
              {item.kind === "event" ? <EventCard event={item.event} /> : <DraftLogCard draft={item.draft} />}
            </motion.div>
          ))}
          {activityItems.length === 0 && <EmptyMini label="Log stream empty" />}
        </div>
      </section>
    </div>
  );
}

function DraftLogCard({ draft }: { draft: MemoryDraft }) {
  const eventDate = new Date(draft.reportDate);
  return (
    <div className="memory-event-card group">
      <div className="mb-4 flex items-center justify-between gap-3 font-mono">
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-1.5 rounded-full bg-amber-500" />
          <span className="max-w-[150px] truncate text-[9px] font-bold uppercase tracking-widest text-black/30">
            {draft.reportType} draft
          </span>
        </div>
        <span className="text-[10px] font-bold text-black/20">{formatInTimeZone(eventDate, LA_TZ, "MMM d, HH:mm")}</span>
      </div>
      <div className="space-y-2.5">
        {draft.newCandidates.map((candidate, index) => (
          <div key={`${draft.fileName}-${index}`} className="memory-event-update">
            <div className="memory-event-target">
              <span className="memory-event-target-type">{candidate.targetType}</span>
              <span className="memory-event-target-separator">::</span>
              <span className="memory-event-target-id">draft candidate</span>
            </div>
            <p className="text-[11px] font-medium leading-relaxed text-black/65">{candidate.title}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function EventCard({ event }: { event: MemoryEvent }) {
  const eventDate = new Date(event.createdAt || event.reportDate);
  return (
    <div className="memory-event-card group">
      <div className="mb-4 flex items-center justify-between gap-3 font-mono">
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
          <span className="max-w-[150px] truncate text-[9px] font-bold uppercase tracking-widest text-black/30">{event.reportType}</span>
        </div>
        <span className="text-[10px] font-bold text-black/20">{formatInTimeZone(eventDate, LA_TZ, "MMM d, HH:mm")}</span>
      </div>
      <div className="space-y-2.5">
        {event.updates.map((update, index) => (
          <div key={`${event.fileName}-${index}`} className="memory-event-update">
            <div className="memory-event-target">
              <span className="memory-event-target-type">{update.targetType}</span>
              <span className="memory-event-target-separator">::</span>
              <span className="memory-event-target-id">{update.targetId}</span>
            </div>
            <p className="text-[11px] font-medium leading-relaxed text-black/65">{update.summary}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function stripMemoryMeta(content: string) {
  return content
    .replace(/^Status:\s*.+\n/im, "")
    .replace(/^Confidence:\s*.+\n/im, "")
    .replace(/^Last Updated:\s*.+\n+/im, "")
    .trim();
}

function EmptyMini({ label, dark }: { label: string; dark?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-3xl border border-dashed px-6 py-10 text-center text-[10px] font-bold uppercase tracking-[0.2em]",
        dark ? "border-white/20 text-white/45" : "border-black/5 text-black/20"
      )}
    >
      {label}
    </div>
  );
}
