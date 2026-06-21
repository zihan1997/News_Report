import { useEffect, useMemo, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
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
  Move,
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
  applyMemoryConsolidation,
  applyPendingMemoryConsolidation,
  getMemoryReview,
  MemoryDraft,
  MemoryConsolidationProposal,
  MemoryDraftReview,
  MemoryEvent,
  MemoryItem,
  MemoryReviewResponse,
  proposeMemoryConsolidation,
  rollbackMemoryConsolidation,
} from "../../../lib/memory";
import { LlmRuntime } from "../../../types";

const LA_TZ = "America/Los_Angeles";

type MemoryMode = "stories" | "narratives";
type MemorySurface = "console" | "board";
type BoardPanelId = "metrics" | "index" | "detail" | "drafts" | "review" | "log";

type BoardPanelLayout = {
  x: number;
  y: number;
  w: number;
  h: number;
};

type BoardLayoutState = Record<BoardPanelId, BoardPanelLayout>;

const BOARD_LAYOUT_STORAGE_KEY = "signal-desk-memory-board-layout-v1";

const DEFAULT_BOARD_LAYOUT: BoardLayoutState = {
  metrics: { x: 72, y: 24, w: 520, h: 150 },
  index: { x: 72, y: 210, w: 430, h: 720 },
  detail: { x: 538, y: 210, w: 820, h: 720 },
  drafts: { x: 1394, y: 210, w: 430, h: 330 },
  review: { x: 1394, y: 574, w: 430, h: 330 },
  log: { x: 1394, y: 938, w: 430, h: 440 },
};

function loadBoardLayout() {
  if (typeof window === "undefined") return DEFAULT_BOARD_LAYOUT;
  try {
    const raw = window.localStorage.getItem(BOARD_LAYOUT_STORAGE_KEY);
    if (!raw) return DEFAULT_BOARD_LAYOUT;
    return { ...DEFAULT_BOARD_LAYOUT, ...JSON.parse(raw) } as BoardLayoutState;
  } catch {
    return DEFAULT_BOARD_LAYOUT;
  }
}

export function MemoryView({ llmRuntime }: { llmRuntime: LlmRuntime }) {
  const [memory, setMemory] = useState<MemoryReviewResponse | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [mode, setMode] = useState<MemoryMode>("stories");
  const [surface, setSurface] = useState<MemorySurface>("console");
  const [boardLayout, setBoardLayout] = useState<BoardLayoutState>(() => loadBoardLayout());
  const [isLoading, setIsLoading] = useState(true);
  const [refreshSpinKey, setRefreshSpinKey] = useState(0);
  const [draftActionKey, setDraftActionKey] = useState("");
  const [consolidation, setConsolidation] = useState<{
    targetType: "story" | "narrative";
    targetId: string;
    proposal: MemoryConsolidationProposal;
  } | null>(null);
  const [consolidationAction, setConsolidationAction] = useState("");
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

  useEffect(() => {
    window.localStorage.setItem(BOARD_LAYOUT_STORAGE_KEY, JSON.stringify(boardLayout));
  }, [boardLayout]);

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

  const pendingConsolidationCount = memory?.pendingConsolidations?.length || 0;
  const stats = [
    { label: "Stories", value: memory?.stories.length || 0, icon: GitBranch, color: "text-blue-500" },
    { label: "Narratives", value: memory?.narratives.length || 0, icon: Layers3, color: "text-indigo-500" },
    { label: "Events", value: memory?.events.length || 0, icon: FileClock, color: "text-emerald-500" },
    {
      label: "Candidates",
      value: (memory?.drafts.reduce((sum, draft) => sum + draft.newCandidates.length, 0) || 0) + pendingConsolidationCount,
      icon: Sparkles,
      color: "text-amber-500",
    },
  ];

  const handleBoardLayoutChange = (panel: BoardPanelId, patch: Partial<BoardPanelLayout>) => {
    setBoardLayout((current) => {
      const candidate = {
        ...current[panel],
        ...patch,
      };
      return {
        ...current,
        [panel]: candidate,
      };
    });
  };

  const resetBoardLayout = () => setBoardLayout(DEFAULT_BOARD_LAYOUT);

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

  const handleProposeConsolidation = async () => {
    if (!selectedItem) return;
    const targetType = mode === "stories" ? "story" : "narrative";
    setConsolidationAction("propose");
    setError(null);
    try {
      const response = await proposeMemoryConsolidation(targetType, selectedItem.id, llmRuntime);
      setConsolidation({ targetType, targetId: selectedItem.id, proposal: response.proposal });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to propose consolidation.");
    } finally {
      setConsolidationAction("");
    }
  };

  const handleApplyConsolidation = async () => {
    if (!consolidation) return;
    setConsolidationAction("apply");
    setError(null);
    try {
      await applyMemoryConsolidation(consolidation.targetType, consolidation.targetId, consolidation.proposal, llmRuntime);
      setConsolidation(null);
      await loadMemory();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to apply consolidation.");
    } finally {
      setConsolidationAction("");
    }
  };

  const handleRollbackConsolidation = async (reviewFileName: string) => {
    setConsolidationAction(`rollback-${reviewFileName}`);
    setError(null);
    try {
      await rollbackMemoryConsolidation(reviewFileName);
      await loadMemory();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to rollback consolidation.");
    } finally {
      setConsolidationAction("");
    }
  };

  const handlePendingConsolidationAction = async (fileName: string, action: "apply" | "dismiss") => {
    setConsolidationAction(`pending-${fileName}-${action}`);
    setError(null);
    try {
      await applyPendingMemoryConsolidation(fileName, action);
      await loadMemory();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update pending consolidation.");
    } finally {
      setConsolidationAction("");
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
          <div className="memory-surface-toggle">
            {(["console", "board"] as MemorySurface[]).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setSurface(item)}
                className={cn("memory-surface-option", surface === item && "memory-surface-option-active")}
              >
                {item}
              </button>
            ))}
          </div>
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
      ) : surface === "board" ? (
        <MemoryBoard
          stats={stats}
          mode={mode}
          items={items}
          selectedItem={selectedItem}
          selectedId={selectedItem?.id || ""}
          latestTargetIds={latestTargetIds}
          memory={memory}
          layout={boardLayout}
          actionKey={draftActionKey}
          onLayoutChange={handleBoardLayoutChange}
          onResetLayout={resetBoardLayout}
          onModeChange={(nextMode) => {
            setMode(nextMode);
            const nextItems = nextMode === "narratives" ? memory?.narratives || [] : memory?.stories || [];
            setSelectedId(nextItems[0]?.id || "");
          }}
          onSelect={setSelectedId}
          onDraftAction={handleDraftAction}
          onConsolidate={handleProposeConsolidation}
          onRollbackConsolidation={handleRollbackConsolidation}
          onPendingConsolidationAction={handlePendingConsolidationAction}
          consolidationTrail={memory?.consolidationTrail || []}
          consolidationAction={consolidationAction}
        />
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
            <MemoryDetail
              item={selectedItem}
              mode={mode}
              onConsolidate={handleProposeConsolidation}
              isConsolidating={consolidationAction === "propose"}
            />
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
              consolidationTrail={memory?.consolidationTrail || []}
              pendingConsolidations={memory?.pendingConsolidations || []}
              actionKey={draftActionKey}
              consolidationAction={consolidationAction}
              onDraftAction={handleDraftAction}
              onRollbackConsolidation={handleRollbackConsolidation}
              onPendingConsolidationAction={handlePendingConsolidationAction}
            />
          </motion.div>
        </div>
      )}

      {consolidation && (
        <ConsolidationPreview
          proposal={consolidation.proposal}
          targetType={consolidation.targetType}
          targetId={consolidation.targetId}
          isApplying={consolidationAction === "apply"}
          onApply={handleApplyConsolidation}
          onDismiss={() => setConsolidation(null)}
        />
      )}
    </div>
  );
}
function MemoryBoard({
  stats,
  mode,
  items,
  selectedItem,
  selectedId,
  latestTargetIds,
  memory,
  layout,
  actionKey,
  onLayoutChange,
  onResetLayout,
  onModeChange,
  onSelect,
  onDraftAction,
  onConsolidate,
  onRollbackConsolidation,
  onPendingConsolidationAction,
  consolidationTrail,
  consolidationAction,
}: {
  stats: Array<{ label: string; value: number; icon: any; color: string }>;
  mode: MemoryMode;
  items: MemoryItem[];
  selectedItem: MemoryItem | null;
  selectedId: string;
  latestTargetIds: Set<string>;
  memory: MemoryReviewResponse | null;
  layout: BoardLayoutState;
  actionKey: string;
  onLayoutChange: (panel: BoardPanelId, patch: Partial<BoardPanelLayout>) => void;
  onResetLayout: () => void;
  onModeChange: (mode: MemoryMode) => void;
  onSelect: (id: string) => void;
  onDraftAction: (fileName: string, candidateIndex: number, action: "promote" | "dismiss") => void;
  onConsolidate: () => void;
  onRollbackConsolidation: (reviewFileName: string) => void;
  onPendingConsolidationAction: (fileName: string, action: "apply" | "dismiss") => void;
  consolidationTrail: MemoryReviewResponse["consolidationTrail"];
  consolidationAction: string;
}) {
  return (
    <section className="memory-board-shell">
      <div className="memory-board-toolbar">
        <div>
          <div className="memory-board-kicker">
            <Move className="h-3.5 w-3.5" />
            Spatial Memory Board
          </div>
          <p>Drag widget headers to arrange the workspace. Pull the lower-right corner to resize.</p>
        </div>
        <button type="button" onClick={onResetLayout} className="memory-board-reset">
          Reset layout
        </button>
      </div>

      <div className="memory-board-canvas">
        <BoardWidget
          id="metrics"
          title="System Metrics"
          icon={Activity}
          layout={layout.metrics}
          minW={360}
          minH={120}
          onLayoutChange={onLayoutChange}
        >
          <div className="memory-board-metrics">
            {stats.map((stat) => (
              <MetricPill key={stat.label} icon={stat.icon} label={stat.label} value={stat.value} color={stat.color} />
            ))}
          </div>
        </BoardWidget>

        <BoardWidget
          id="index"
          title="Knowledge Base"
          icon={Database}
          layout={layout.index}
          minW={320}
          minH={420}
          onLayoutChange={onLayoutChange}
        >
          <MemoryIndex
            mode={mode}
            items={items}
            latestTargetIds={latestTargetIds}
            selectedId={selectedId}
            onModeChange={onModeChange}
            onSelect={onSelect}
          />
        </BoardWidget>

        <BoardWidget
          id="detail"
          title="Reader Console"
          icon={BrainCircuit}
          layout={layout.detail}
          minW={520}
          minH={460}
          onLayoutChange={onLayoutChange}
        >
          <MemoryDetail
            item={selectedItem}
            mode={mode}
            onConsolidate={onConsolidate}
            isConsolidating={consolidationAction === "propose"}
          />
        </BoardWidget>

        <BoardWidget
          id="drafts"
          title="Draft Candidates"
          icon={Sparkles}
          layout={layout.drafts}
          minW={340}
          minH={260}
          onLayoutChange={onLayoutChange}
        >
          <DraftCandidatesPanel drafts={memory?.drafts || []} actionKey={actionKey} onDraftAction={onDraftAction} />
        </BoardWidget>

        <BoardWidget
          id="review"
          title="Review Trail"
          icon={CheckCircle2}
          layout={layout.review}
          minW={340}
          minH={260}
          onLayoutChange={onLayoutChange}
        >
          <ReviewTrailPanel
            reviewTrail={memory?.reviewTrail || []}
            consolidationTrail={consolidationTrail}
            pendingConsolidations={memory?.pendingConsolidations || []}
            consolidationAction={consolidationAction}
            onRollbackConsolidation={onRollbackConsolidation}
            onPendingConsolidationAction={onPendingConsolidationAction}
          />
        </BoardWidget>

        <BoardWidget
          id="log"
          title="Propagation Log"
          icon={Activity}
          layout={layout.log}
          minW={340}
          minH={320}
          onLayoutChange={onLayoutChange}
        >
          <PropagationLogPanel events={memory?.events || []} drafts={memory?.drafts || []} />
        </BoardWidget>
      </div>
    </section>
  );
}

function BoardWidget({
  id,
  title,
  icon: Icon,
  layout,
  minW,
  minH,
  onLayoutChange,
  children,
}: {
  id: BoardPanelId;
  title: string;
  icon: any;
  layout: BoardPanelLayout;
  minW: number;
  minH: number;
  onLayoutChange: (panel: BoardPanelId, patch: Partial<BoardPanelLayout>) => void;
  children: ReactNode;
}) {
  const beginDrag = (event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    const startX = event.clientX;
    const startY = event.clientY;
    const start = { ...layout };

    const onMove = (moveEvent: globalThis.MouseEvent) => {
      onLayoutChange(id, {
        x: Math.max(0, start.x + moveEvent.clientX - startX),
        y: Math.max(0, start.y + moveEvent.clientY - startY),
      });
    };

    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const beginResize = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startY = event.clientY;
    const start = { ...layout };

    const onMove = (moveEvent: globalThis.MouseEvent) => {
      onLayoutChange(id, {
        w: Math.max(minW, start.w + moveEvent.clientX - startX),
        h: Math.max(minH, start.h + moveEvent.clientY - startY),
      });
    };

    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  return (
    <motion.article
      className="memory-board-widget"
      style={{
        left: layout.x,
        top: layout.y,
        width: layout.w,
        height: layout.h,
      }}
    >
      <div className="memory-board-widget-handle" onMouseDown={beginDrag}>
        <div className="flex items-center gap-2">
          <Icon className="h-3.5 w-3.5 text-black/35" />
          <span>{title}</span>
        </div>
        <Move className="h-4 w-4 text-black/16" />
      </div>
      <div className="memory-board-widget-body custom-scrollbar">{children}</div>
      <button type="button" aria-label={`Resize ${title}`} className="memory-board-resize-handle" onMouseDown={beginResize} />
    </motion.article>
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

function MemoryDetail({
  item,
  mode,
  onConsolidate,
  isConsolidating,
}: {
  item: MemoryItem | null;
  mode: MemoryMode;
  onConsolidate: () => void;
  isConsolidating: boolean;
}) {
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
            <button
              type="button"
              onClick={onConsolidate}
              disabled={isConsolidating}
              className="memory-consolidate-button"
            >
              {isConsolidating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              Consolidate
            </button>
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
  consolidationTrail,
  pendingConsolidations,
  actionKey,
  consolidationAction,
  onDraftAction,
  onRollbackConsolidation,
  onPendingConsolidationAction,
}: {
  events: MemoryEvent[];
  drafts: MemoryDraft[];
  reviewTrail: MemoryDraftReview[];
  consolidationTrail: MemoryReviewResponse["consolidationTrail"];
  pendingConsolidations: MemoryReviewResponse["pendingConsolidations"];
  actionKey: string;
  consolidationAction: string;
  onDraftAction: (fileName: string, candidateIndex: number, action: "promote" | "dismiss") => void;
  onRollbackConsolidation: (reviewFileName: string) => void;
  onPendingConsolidationAction: (fileName: string, action: "apply" | "dismiss") => void;
}) {
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
      <DraftCandidatesPanel drafts={drafts} actionKey={actionKey} onDraftAction={onDraftAction} />
      <ReviewTrailPanel
        reviewTrail={reviewTrail}
        consolidationTrail={consolidationTrail}
        pendingConsolidations={pendingConsolidations}
        consolidationAction={consolidationAction}
        onRollbackConsolidation={onRollbackConsolidation}
        onPendingConsolidationAction={onPendingConsolidationAction}
      />
      <PropagationLogPanel events={events} drafts={drafts} activityItems={activityItems} />
    </div>
  );
}

function DraftCandidatesPanel({
  drafts,
  actionKey,
  onDraftAction,
}: {
  drafts: MemoryDraft[];
  actionKey: string;
  onDraftAction: (fileName: string, candidateIndex: number, action: "promote" | "dismiss") => void;
}) {
  const [openDraft, setOpenDraft] = useState("");
  const draftCandidates = drafts.flatMap((draft) =>
    (draft.newCandidates || []).map((candidate, index) => ({ draft, candidate, index }))
  );
  const candidateCount = draftCandidates.length;

  return (
    <section className="memory-draft-panel">
      <div className="memory-draft-watermark">
        <Sparkles className="h-40 w-40" />
      </div>

      <div className="memory-draft-content">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-white/20 p-2 backdrop-blur-sm">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <h3 className="font-mono text-xs font-bold uppercase tracking-widest text-white">Draft Candidates</h3>
          </div>
          <span className="rounded-full bg-white/20 px-3 py-1 font-mono text-sm font-bold backdrop-blur-sm">{candidateCount}</span>
        </div>

        <div className="memory-draft-list">
          {draftCandidates.map(({ draft, candidate, index }) => {
            const draftKey = `${draft.fileName}-${index}`;
            const isOpen = openDraft === draftKey;
            const evidence = candidate.evidence || [];

            return (
              <motion.div
                key={draftKey}
                initial={{ opacity: 0, x: 14 }}
                animate={{ opacity: 1, x: 0 }}
                role="button"
                tabIndex={0}
                onClick={() => setOpenDraft((current) => current === draftKey ? "" : draftKey)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setOpenDraft((current) => current === draftKey ? "" : draftKey);
                  }
                }}
                className={cn("memory-draft-card group/card", isOpen && "memory-draft-card-open")}
              >
                <div className="memory-draft-card-top">
                  <span>{candidate.targetType} candidate</span>
                  <ChevronRight className={cn("h-3.5 w-3.5 text-amber-600 transition-all", isOpen ? "rotate-90 opacity-100" : "opacity-0 group-hover/card:opacity-100")} />
                </div>
                <div className="memory-draft-title">{candidate.title}</div>
                <p className="memory-draft-reason">&quot;{candidate.reason}&quot;</p>
                {!isOpen && evidence[0] && <p className="memory-draft-preview">{evidence[0]}</p>}
                {isOpen && (
                  <div className="memory-draft-expanded">
                    <div className="memory-draft-meta">
                      {draft.reportType} · {formatInTimeZone(new Date(draft.reportDate), LA_TZ, "MM-dd HH:mm")}
                    </div>
                    {evidence.length > 0 ? (
                      <ul className="memory-draft-evidence">
                        {evidence.map((item, evidenceIndex) => (
                          <li key={`${draftKey}-evidence-${evidenceIndex}`}>{item}</li>
                        ))}
                      </ul>
                    ) : (
                      <div className="memory-draft-empty-evidence">No evidence attached to this draft.</div>
                    )}
                  </div>
                )}
                <div className="memory-draft-actions">
                  <button
                    type="button"
                    className="memory-draft-action memory-draft-action-primary"
                    disabled={Boolean(actionKey)}
                    onClick={(event) => {
                      event.stopPropagation();
                      onDraftAction(draft.fileName, index, "promote");
                    }}
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
                    onClick={(event) => {
                      event.stopPropagation();
                      onDraftAction(draft.fileName, index, "dismiss");
                    }}
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
            );
          })}
          {candidateCount === 0 && (
            <div className="rounded-3xl border border-white/30 bg-white px-6 py-8 text-center font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-amber-700 shadow-sm">
              No draft candidates pending
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function ReviewTrailPanel({
  reviewTrail,
  consolidationTrail,
  pendingConsolidations,
  consolidationAction,
  onRollbackConsolidation,
  onPendingConsolidationAction,
}: {
  reviewTrail: MemoryDraftReview[];
  consolidationTrail: MemoryReviewResponse["consolidationTrail"];
  pendingConsolidations: MemoryReviewResponse["pendingConsolidations"];
  consolidationAction: string;
  onRollbackConsolidation: (reviewFileName: string) => void;
  onPendingConsolidationAction: (fileName: string, action: "apply" | "dismiss") => void;
}) {
  const [openReview, setOpenReview] = useState("");
  const [isCollapsed, setIsCollapsed] = useState(false);
  const pendingItems = pendingConsolidations || [];
  const appliedItems = consolidationTrail || [];
  const reviewItems = reviewTrail || [];

  return (
    <section className={cn("memory-review-panel", isCollapsed && "memory-review-panel-collapsed")}>
      <button
        type="button"
        onClick={() => setIsCollapsed((current) => !current)}
        className="memory-review-header"
        aria-expanded={!isCollapsed}
      >
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-black/[0.03] p-2">
            <CheckCircle2 className="h-4 w-4 text-black/40" />
          </div>
          <div className="text-left">
            <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-black/40">Review Trail</h3>
            {isCollapsed && (
              <p className="mt-1 font-mono text-[9px] font-bold uppercase tracking-widest text-black/25">Tap to expand</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono text-[10px] font-bold text-black/25">
            {pendingItems.length} Pending / {reviewItems.length + appliedItems.length} Decisions
          </span>
          <ChevronRight className={cn("h-4 w-4 text-black/30 transition-transform", !isCollapsed && "rotate-90")} />
        </div>
      </button>

      {isCollapsed ? null : (

      <div className="space-y-3">
        {pendingItems.map((pending) => (
          <button
            key={pending.fileName}
            type="button"
            onClick={() => setOpenReview((current) => current === pending.fileName ? "" : pending.fileName)}
            className="memory-review-card memory-review-card-pending"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="mb-1 flex items-center gap-2">
                  <span className="memory-review-badge memory-review-badge-pending">Pending</span>
                  <span className="font-mono text-[9px] font-bold uppercase tracking-widest text-black/25">{pending.targetType}</span>
                </div>
                <div className="line-clamp-2 font-serif text-base font-bold leading-tight text-black">{pending.targetId}</div>
              </div>
              <span className="shrink-0 font-mono text-[9px] font-bold text-black/25">
                {formatInTimeZone(new Date(pending.proposedAt), LA_TZ, "MM-dd HH:mm")}
              </span>
            </div>
            {openReview === pending.fileName && (
              <div className="mt-3 border-t border-black/5 pt-3 text-left">
                <p className="text-xs leading-relaxed text-black/55">{pending.proposal.currentState}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={Boolean(consolidationAction)}
                    onClick={(event) => {
                      event.stopPropagation();
                      onPendingConsolidationAction(pending.fileName, "apply");
                    }}
                    className="inline-flex items-center gap-2 rounded-full bg-black px-3 py-2 font-mono text-[9px] font-bold uppercase tracking-widest text-white disabled:opacity-50"
                  >
                    {consolidationAction === `pending-${pending.fileName}-apply` ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                    Apply
                  </button>
                  <button
                    type="button"
                    disabled={Boolean(consolidationAction)}
                    onClick={(event) => {
                      event.stopPropagation();
                      onPendingConsolidationAction(pending.fileName, "dismiss");
                    }}
                    className="inline-flex items-center gap-2 rounded-full bg-black/5 px-3 py-2 font-mono text-[9px] font-bold uppercase tracking-widest text-black/45 disabled:opacity-50"
                  >
                    {consolidationAction === `pending-${pending.fileName}-dismiss` ? <Loader2 className="h-3 w-3 animate-spin" /> : <EyeOff className="h-3 w-3" />}
                    Dismiss
                  </button>
                </div>
              </div>
            )}
          </button>
        ))}
        {appliedItems.slice(0, 6).map((review) => (
          <button
            key={review.fileName}
            type="button"
            onClick={() => setOpenReview((current) => current === review.fileName ? "" : review.fileName)}
            className="memory-review-card"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="mb-1 flex items-center gap-2">
                  <span className={cn("memory-review-badge", review.status === "rolled_back" ? "memory-review-badge-dismiss" : "memory-review-badge-promote")}>
                    {review.status === "rolled_back" ? "Rolled Back" : "Consolidated"}
                  </span>
                  <span className="font-mono text-[9px] font-bold uppercase tracking-widest text-black/25">{review.targetType}</span>
                </div>
                <div className="line-clamp-2 font-serif text-base font-bold leading-tight text-black">{review.targetId}</div>
              </div>
              <span className="shrink-0 font-mono text-[9px] font-bold text-black/25">
                {formatInTimeZone(new Date(review.appliedAt), LA_TZ, "MM-dd HH:mm")}
              </span>
            </div>
            {openReview === review.fileName && (
              <div className="mt-3 border-t border-black/5 pt-3 text-left">
                <p className="text-xs leading-relaxed text-black/55">{review.proposal.currentState}</p>
                {review.status === "applied" && (
                  <button
                    type="button"
                    disabled={Boolean(consolidationAction)}
                    onClick={(event) => {
                      event.stopPropagation();
                      onRollbackConsolidation(review.fileName);
                    }}
                    className="mt-3 inline-flex items-center gap-2 rounded-full bg-black px-3 py-2 font-mono text-[9px] font-bold uppercase tracking-widest text-white disabled:opacity-50"
                  >
                    {consolidationAction === `rollback-${review.fileName}` && <Loader2 className="h-3 w-3 animate-spin" />}
                    Rollback
                  </button>
                )}
              </div>
            )}
          </button>
        ))}
        {reviewItems.slice(0, 6).map((review) => (
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
        {pendingItems.length === 0 && reviewItems.length === 0 && appliedItems.length === 0 && <EmptyMini label="No review decisions yet" />}
      </div>
      )}
    </section>
  );
}

type ActivityItem =
  | { kind: "event"; key: string; timestamp: number; event: MemoryEvent }
  | { kind: "draft"; key: string; timestamp: number; draft: MemoryDraft };

function PropagationLogPanel({
  events,
  drafts,
  activityItems,
}: {
  events: MemoryEvent[];
  drafts: MemoryDraft[];
  activityItems?: ActivityItem[];
}) {
  const items = useMemo(() => {
    if (activityItems) return activityItems;
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
    return [...eventItems, ...draftItems].sort((a, b) => b.timestamp - a.timestamp).slice(0, 15);
  }, [activityItems, events, drafts]);

  return (
    <section className="memory-log-panel">
      <div className="mb-6 flex items-center justify-between px-1">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-black/[0.03] p-2">
            <Activity className="h-4 w-4 text-black/40" />
          </div>
          <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-black/40">Propagation Log</h3>
        </div>
        <span className="font-mono text-[10px] font-bold text-black/25">{items.length} Entries</span>
      </div>

      <div className="memory-event-list custom-scrollbar">
        {items.map((item, index) => (
          <motion.div key={item.key} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: Math.min(index * 0.025, 0.18) }}>
            {item.kind === "event" ? <EventCard event={item.event} /> : <DraftLogCard draft={item.draft} />}
          </motion.div>
        ))}
        {items.length === 0 && <EmptyMini label="Log stream empty" />}
      </div>
    </section>
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

function ConsolidationPreview({
  proposal,
  targetType,
  targetId,
  isApplying,
  onApply,
  onDismiss,
}: {
  proposal: MemoryConsolidationProposal;
  targetType: "story" | "narrative";
  targetId: string;
  isApplying: boolean;
  onApply: () => void;
  onDismiss: () => void;
}) {
  const sections = targetType === "story"
    ? [
        ["Current State", proposal.currentState ? [proposal.currentState] : []],
        ["Resolved", proposal.resolved || []],
        ["Open Gaps", proposal.openGaps || []],
      ]
    : [
        ["Current State", proposal.currentState ? [proposal.currentState] : []],
        ["Weak Signals", proposal.weakSignals || []],
        ["Open Questions", proposal.openQuestions || []],
        ["Watchlist", proposal.watchlist || []],
      ];

  return (
    <div className="memory-consolidation-overlay">
      <motion.section
        initial={{ opacity: 0, y: 18, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        className="memory-consolidation-modal"
      >
        <div className="mb-5 flex items-start justify-between gap-5">
          <div>
            <div className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-indigo-500">
              Consolidation Proposal
            </div>
            <h3 className="font-serif text-3xl font-bold leading-tight text-black">{targetId}</h3>
            <p className="mt-2 text-sm font-semibold text-black/40">{targetType} sections only. Timeline and evidence remain untouched.</p>
          </div>
          <button type="button" onClick={onDismiss} className="rounded-full bg-black/5 px-4 py-2 text-xs font-bold text-black/50">
            Dismiss
          </button>
        </div>

        <div className="memory-consolidation-sections custom-scrollbar">
          {sections.map(([heading, values]) => (
            <div key={heading as string} className="memory-consolidation-section">
              <h4>{heading as string}</h4>
              {(values as string[]).length > 0 ? (
                <ul>
                  {(values as string[]).map((value, index) => (
                    <li key={`${heading}-${index}`}>{value}</li>
                  ))}
                </ul>
              ) : (
                <p>No proposed content.</p>
              )}
            </div>
          ))}
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onDismiss} className="memory-consolidation-action memory-consolidation-action-muted">
            Not now
          </button>
          <button type="button" onClick={onApply} disabled={isApplying} className="memory-consolidation-action memory-consolidation-action-primary">
            {isApplying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Apply & Log
          </button>
        </div>
      </motion.section>
    </div>
  );
}
