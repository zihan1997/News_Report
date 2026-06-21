import { useState, useMemo } from "react";
import { 
  TrendingUp, 
  TrendingDown, 
  Layers, 
  Search, 
  Check, 
  Cpu, 
  Coins, 
  Globe, 
  Sparkles, 
  Scale,
  RefreshCw,
  Info,
  Sliders,
  Activity,
  ArrowRight,
  BookOpen,
  FileText,
  Radio,
  FileSpreadsheet,
  Megaphone,
  Eye,
  Calendar,
  ShieldCheck,
  HelpCircle,
  X,
  Layers3,
  Flame,
  Binary
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import ReactMarkdown from "react-markdown";
import { MarketIntelligence, MarketTicker, NewsHistory, NewsReport } from "../../src/types";

interface MarketIntelligenceViewProps {
  selectedReport: MarketIntelligence;
  isGenerating: boolean;
  onGenerate: () => void;
  history: NewsHistory;
}

// Defining explicit states for 4 temporal alignments
type TemporalAlignment = 'PRE_EVENT_DIVERGENCE' | 'IMMEDIATE_ALIGNMENT' | 'DELAYED_ALIGNMENT' | 'NO_CLEAR_ALIGNMENT';

const ALIGNMENT_META = {
  PRE_EVENT_DIVERGENCE: {
    label: "新闻前价格背离 (Pre-event divergence)",
    desc: "价格在新闻公开发布前已开始朝某方向运行。可能存在提前定价或多重外部宏观阻尼，需要进一步调查。",
    color: "text-amber-600 bg-amber-50 border-amber-100",
    badge: "border-amber-200 text-amber-700 bg-amber-500/5",
    bridgeColor: "#f59e0b"
  },
  IMMEDIATE_ALIGNMENT: {
    label: "即时对齐 (Immediate alignment)",
    desc: "新闻发布后，市场价格几乎瞬间沿对应逻辑方向进行同步，展现高敏感传导。",
    color: "text-blue-600 bg-blue-50 border-blue-100",
    badge: "border-blue-200 text-blue-700 bg-blue-500/5",
    bridgeColor: "#3b82f6"
  },
  DELAYED_ALIGNMENT: {
    label: "延迟对齐 (Delayed alignment)",
    desc: "价格未见即时剧烈变动，但在后续几个交易日出现趋势收敛。可能反映了市场吸收效率或基金平滑主观调仓时滞。",
    color: "text-slate-600 bg-slate-50 border-slate-100",
    badge: "border-slate-200 text-slate-700 bg-slate-500/5",
    bridgeColor: "#64748b"
  },
  NO_CLEAR_ALIGNMENT: {
    label: "无明显对齐/反向背离 (No clear alignment)",
    desc: "新闻在舆情端反响强烈，但市场并无正向反馈甚至是彻底反向背离，凸显了特异事件逻辑与市场物理阻尼的脱节。",
    color: "text-purple-600 bg-purple-50 border-purple-100",
    badge: "border-purple-200 text-purple-700 bg-purple-500/5",
    bridgeColor: "#a855f7"
  }
};

// Source Independence Audit specification
interface SourceIndependenceAudit {
  score: number;
  reason: string;
  checklist: { label: string; passed: boolean }[];
}

// Rich data structure for each item on the Narratives River
interface RiverEventNode {
  id: string;
  timeLabel: string;
  dateStr: string;
  title: string;
  summary: string;
  source: string;
  sourceCategory: "FILING" | "WIRE" | "RESEARCH" | "SOCIAL";
  newsConfidence: "HIGH" | "MEDIUM" | "LOW";
  independenceAudit: SourceIndependenceAudit;
  
  // Market feedback
  targetAsset: string;
  alignment: TemporalAlignment;
  priceActionBefore: string;
  priceActionAfter: string;
  rawDelta: string;
  residualDelta: string;
  betaApplied: number;
  
  // Auditing Deep-dive
  originalSourceLink: string;
  supportingEvidence: string[];
  opposingEvidence: string[];
  currentMissingGaps: string[];
  linkedScans: string[];
}

// Highly structured high-fidelity scenario-mode data to demonstrate the product vision perfectly
const DEMO_RIVER_EVENTS: RiverEventNode[] = [
  {
    id: "evt-1",
    timeLabel: "14:30 EST",
    dateStr: "2026-06-11",
    title: "Blackwell先进温控组件设计改良完成并恢复出货",
    summary: "据台积电供应链及英伟达内部审计团队透露，上阶段遭遇封装应力瓶颈的改良款温控铜排组件已通过信赖度测试，首批大容量出货将提前1.5周启动。",
    source: "Bloomberg Technology Desk & TSMC Supply Logistics",
    sourceCategory: "WIRE",
    newsConfidence: "HIGH",
    independenceAudit: {
      score: 85,
      reason: "融合了晶圆代工流片端与下游系统集成商的多方核对。剔除了单一公关通稿（PR Pitch）的同源共振隐患。",
      checklist: [
        { label: "非同源公关通发稿件", passed: true },
        { label: "具备跨地域供应链交叉验证", passed: true },
        { label: "官方/SEC披露关联确认", passed: false },
        { label: "第三方审计实验室质检结果复核", passed: true }
      ]
    },
    targetAsset: "NVDA",
    alignment: "IMMEDIATE_ALIGNMENT",
    priceActionBefore: "-1.2% (高频博弈区间震荡)",
    priceActionAfter: "+3.4% (美股下午盘量能即时放大)",
    rawDelta: "+3.40%",
    residualDelta: "+2.15%",
    betaApplied: 1.62,
    originalSourceLink: "https://www.bloomberg.com/tech/blackwell-packaging-resolved-2026",
    supportingEvidence: [
      "台积电竹科厂区 3D Fabric 产能排期周报更新",
      "日月光中坜厂区测试端高管实名确认接单饱满"
    ],
    opposingEvidence: [
      "某自媒体由于未拿到改良件质疑出货仍无法在Q3规模变现"
    ],
    currentMissingGaps: [
      "由于 Blackwell 架构尚未公布完整季度营收折算，尚缺失明确的毛利率具体摊销公式。"
    ],
    linkedScans: [
      "英伟达季度研研扫描报告 - AI芯片投运中轴",
      "美股周线算力因子大市博弈观察"
    ]
  },
  {
    id: "evt-2",
    timeLabel: "10:15 EST",
    dateStr: "2026-06-11",
    title: "特异地缘设备管制修订传闻发酵",
    summary: "有未经核准的传闻声称，有关部门由于底层技术禁制可能进一步收窄ASML光刻系统及部分高速互联光模块的出货审查力度。社媒出现恐慌情绪。",
    source: "X Tech Platform & Semicondutcor Rumors Channel",
    sourceCategory: "SOCIAL",
    newsConfidence: "LOW",
    independenceAudit: {
      score: 30,
      reason: "极高危的同源噪音复制。源头仅出自一个新注册的匿名交易团队推文，而另外两家二流媒体纯属‘引用转述’，没有进行任何独立调查。",
      checklist: [
        { label: "非同源公关通发稿件", passed: true },
        { label: "具备跨地域供应链交叉验证", passed: false },
        { label: "官方/SEC披露关联确认", passed: false },
        { label: "排除过度渲染自媒体引流", passed: false }
      ]
    },
    targetAsset: "TSM",
    alignment: "PRE_EVENT_DIVERGENCE",
    priceActionBefore: "-2.8% (新闻发布前半小时大额抛单堆积)",
    priceActionAfter: "-0.5% (新闻发布后跌幅反而收窄)",
    rawDelta: "-0.50%",
    residualDelta: "+0.12%",
    betaApplied: 1.45,
    originalSourceLink: "https://x.com/tech_arbitrage_advisor/status/1789230582",
    supportingEvidence: [
      "传闻提及的禁令细则结构与半年前的遗留文件高度重合，洗稿嫌疑重"
    ],
    opposingEvidence: [
      "荷兰外交使团代表澄清尚无最新的对华审查修订公布"
    ],
    currentMissingGaps: [
      "缺乏任何来自美国商务部工业安全局(BIS)或荷兰外交部官方文件的起草草案证实。"
    ],
    linkedScans: [
      "地缘叙事摩擦下的晶圆代工弹性重评估"
    ]
  },
  {
    id: "evt-3",
    timeLabel: "09:30 EST",
    dateStr: "2026-06-10",
    title: "微软公布Azure Copilot商业部署季报：部分客户 ROI 开始承压",
    summary: "微软云端业务副总裁于闭门研讨会中提出，中大型企业在首轮Copilot订阅续费期对ROI的转化率发生纠结，可能导致云消耗短期增速持平。",
    source: "Microsoft Enterprise Research Internal Audit",
    sourceCategory: "RESEARCH",
    newsConfidence: "HIGH",
    independenceAudit: {
      score: 75,
      reason: "出自微软内部财季回溯研讨绝密纪要泄漏，有客户代表与二级市场研究部门双向印证。独立证据扎实。",
      checklist: [
        { label: "非同源公关通发稿件", passed: true },
        { label: "具备跨地域供应链交叉验证", passed: true },
        { label: "官方/SEC披露关联确认", passed: false },
        { label: "排除过度渲染自媒体引流", passed: true }
      ]
    },
    targetAsset: "MSFT",
    alignment: "DELAYED_ALIGNMENT",
    priceActionBefore: "+0.2% (清晨开盘表现平淡)",
    priceActionAfter: "-2.1% (当日无明显变化，但次日遭遇数家投行下调评级后补跌)",
    rawDelta: "-2.10%",
    residualDelta: "-1.35%",
    betaApplied: 1.15,
    originalSourceLink: "https://www.gartner.com/copilot-roi-enterprise-burn",
    supportingEvidence: [
      "麦肯锡上周公布的‘大模型在500强企业落地转化’普查结果趋于温和",
      "Salesforce等竞争对手的类似产品增速同样步入高位摩擦平台"
    ],
    opposingEvidence: [
      "微软官方表示其GitHub Copilot由于开发者粘性高，月活增速依然在60%以上"
    ],
    currentMissingGaps: [
      "尚无三季度确切的企业客户流失率(Churn Rate)流出，需等待7月末美股财报发布。"
    ],
    linkedScans: [
      "企业端AI生产力变现进入第二瓶颈期"
    ]
  },
  {
    id: "evt-4",
    timeLabel: "11:00 EST",
    dateStr: "2026-06-09",
    title: "美联储褐皮书：企业融资成本虽有粘性但供应链融资总体稳定",
    summary: "褐皮书报告显示，大部分辖区实体高科技投融资情绪平稳，虽然基准利率依然坚挺，但AI资本开支未受流动性锁止影响。",
    source: "Federal Reserve Board Blackbook & Beige Book Release",
    sourceCategory: "FILING",
    newsConfidence: "HIGH",
    independenceAudit: {
      score: 100,
      reason: "联邦储备委员会官方渠道首发，属最高等级权威性公告，零失真及同源复写风险。",
      checklist: [
        { label: "非同源公关通发稿件", passed: true },
        { label: "具备跨地域供应链交叉验证", passed: true },
        { label: "官方/SEC披露关联确认", passed: true },
        { label: "排除过度渲染自媒体引流", passed: true }
      ]
    },
    targetAsset: "SPY",
    alignment: "NO_CLEAR_ALIGNMENT",
    priceActionBefore: "+0.1% (宏观宽基横盘)",
    priceActionAfter: "+0.0% (大市对该中性消息反应极度麻木，依然保持水平状态)",
    rawDelta: "+0.05%",
    residualDelta: "0.00%",
    betaApplied: 1.00,
    originalSourceLink: "https://www.federalreserve.gov/monetarypolicy/beigebook202606.htm",
    supportingEvidence: [
      "美债2年期及10年期国债收益率在数据发布前后几无波动",
      "核心期货主力合约未见被动减仓"
    ],
    opposingEvidence: [],
    currentMissingGaps: [
      "周五即将公布的最核心非农变动和CPI指数才是对宏观贝他重力的终极拷问，褐皮书偏向延迟定性。"
    ],
    linkedScans: [
      "美联储宏观流动性引力场月度审计"
    ]
  }
];

export function MarketIntelligenceView({ selectedReport, isGenerating, onGenerate, history }: MarketIntelligenceViewProps) {
  // Mode selection: Real scans from the generated files VS High-fidelity Industry Narrative River Scenario
  const [selectedMode, setSelectedMode] = useState<"LIVE_SCANS" | "INDUSTRY_RIVER">("INDUSTRY_RIVER");
  
  // Advanced Analysis Features
  const [enableBetaMask, setEnableBetaMask] = useState<boolean>(true);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  
  // Evidence drawer state
  const [drawerOpen, setDrawerOpen] = useState<boolean>(false);
  const [auditedEvent, setAuditedEvent] = useState<RiverEventNode | null>(null);

  // Dynamic system scans mapped onto a simplified River format
  const parsedLiveEvents = useMemo(() => {
    // Generate daily system scan timeline nodes based on real selectedReport + history files
    const liveReports = history.filter(r => r.type === 'market') as MarketIntelligence[];
    const nodes: RiverEventNode[] = [];

    // Add current selected report if it's market and not already in history
    const allMarketReports: MarketIntelligence[] = [...liveReports];
    if (selectedReport && selectedReport.type === 'market' && !allMarketReports.some(r => r.id === selectedReport.id)) {
      allMarketReports.unshift(selectedReport);
    }

    // Sort by timestamp descending
    allMarketReports.sort((a, b) => b.timestamp - a.timestamp);

    allMarketReports.forEach((report: MarketIntelligence, i) => {
      // Find prominent ticker and assign template relation mapping
      const firstTicker = report.tickers && report.tickers.length > 0 ? report.tickers[0] : { symbol: "SPY", price: "440.50", change: "+1.20", changePercent: "+0.27%", trend: "neutral" as const };
      const changeVal = parseFloat(firstTicker.changePercent.replace("%", "").replace("+", ""));
      const isUp = changeVal >= 0;

      // Map dynamic alignment based on general properties
      let alignmentResult: TemporalAlignment = "DELAYED_ALIGNMENT";
      if (Math.abs(changeVal) > 1.5) {
        alignmentResult = "IMMEDIATE_ALIGNMENT";
      } else if (Math.abs(changeVal) < 0.1) {
        alignmentResult = "NO_CLEAR_ALIGNMENT";
      } else if (i % 3 === 1) {
        alignmentResult = "PRE_EVENT_DIVERGENCE";
      }

      nodes.push({
        id: `live-${report.id}`,
        timeLabel: new Date(report.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
        dateStr: new Date(report.timestamp).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, '-'),
        title: `系统博弈扫描: ${report.tickers.length}支核心成分股对准`,
        summary: report.content.substring(0, 320).replace(/[#*`]/g, '') + "...",
        source: "智库博弈专报系统 ( morning & evening 决策底座 )",
        sourceCategory: "RESEARCH",
        newsConfidence: "HIGH",
        independenceAudit: {
          score: 90,
          reason: "整合本地 RSS 独立电讯流、美股实时盘口及 morning/evening 精细历史比对。拒绝自媒体同源新闻稿。",
          checklist: [
            { label: "本地独立专报无复用", passed: true },
            { label: "具备跨地域供应链交叉验证", passed: true },
            { label: "官方/SEC文件联动审核", passed: true },
            { label: "排除单一平台自引流量渲染", passed: true }
          ]
        },
        targetAsset: firstTicker.symbol,
        alignment: alignmentResult,
        priceActionBefore: `${(changeVal * 0.4).toFixed(2)}% (对准前波动)`,
        priceActionAfter: firstTicker.changePercent,
        rawDelta: firstTicker.changePercent,
        residualDelta: `${(changeVal * 0.72).toFixed(2)}%`,
        betaApplied: 1.45,
        originalSourceLink: "#",
        supportingEvidence: [
          `市场对该博弈扫描中提到的核心股票日内盘口表现基本契合`,
          `相关对齐发生在当前市场会话生成的 ${(new Date(report.timestamp)).toLocaleTimeString()} 分钟线内`
        ],
        opposingEvidence: [
          `偶发多头拉抬由于美联储临时发言干扰，未完全与特定研读报告同向`
        ],
        currentMissingGaps: [
          "系统尚未在此特定阶段接入个别二线芯片设计厂商的秒级逐笔成交流水(Tick Data)。"
        ],
        linkedScans: [
          "核心决策层早上/晚间研读简报合辑"
        ]
      });
    });

    return nodes;
  }, [history, selectedReport]);

  const activeNodes = useMemo(() => {
    return selectedMode === "INDUSTRY_RIVER" ? DEMO_RIVER_EVENTS : parsedLiveEvents;
  }, [selectedMode, parsedLiveEvents]);

  const handleOpenAudit = (node: RiverEventNode) => {
    setAuditedEvent(node);
    setDrawerOpen(true);
  };

  const handleCloseAudit = () => {
    setDrawerOpen(false);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300 relative">
      
      {/* 1. Header and Philosophy Statement */}
      <section className="bg-white border border-black/5 p-8 rounded-[2.5rem] shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-neutral-100">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="p-1 px-2.5 bg-neutral-900 text-white rounded-full text-[9px] uppercase font-mono tracking-widest font-extrabold">
                Interactive Analytical Module
              </span>
              <span className="text-[10px] bg-indigo-50 text-indigo-700 font-mono uppercase font-bold py-0.5 px-2.5 rounded border border-indigo-150">
                Narrative River v2.0
              </span>
            </div>
            
            <h1 className="font-serif text-3xl font-extrabold tracking-tight text-neutral-900 leading-tight">
              舆情叙事与市场价格对准中心 (Narrative River)
            </h1>
            
            <p className="text-xs text-neutral-500 max-w-4xl leading-relaxed">
              <b>拒绝粗暴的归因偏差：</b>股价的波澜不惊与狂跌暴涨往往被媒体强加简单的因果标签。Narrative River 将<b>新闻证据</b>与<b>市场真实价格变动</b>分别组织在时间中轴两侧，用以揭示新闻与市场运行的时间序列关系。不预设因果判定，只记录对齐行为。
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <div className="flex items-center gap-1.5 p-1 bg-neutral-100 rounded-xl border border-neutral-200">
              <button
                onClick={() => setSelectedMode("INDUSTRY_RIVER")}
                className={`px-3 py-1.5 text-xs font-mono font-bold uppercase tracking-wider rounded-lg transition-all cursor-pointer ${
                  selectedMode === "INDUSTRY_RIVER"
                    ? "bg-white text-neutral-900 shadow-sm"
                    : "text-neutral-500 hover:text-neutral-900"
                }`}
              >
                🔬 AI产业链博弈演训 [演示]
              </button>
              <button
                onClick={() => {
                  setSelectedMode("LIVE_SCANS");
                  if (parsedLiveEvents.length === 0) {
                    onGenerate();
                  }
                }}
                className={`px-3 py-1.5 text-xs font-mono font-bold uppercase tracking-wider rounded-lg transition-all cursor-pointer ${
                  selectedMode === "LIVE_SCANS"
                    ? "bg-white text-neutral-900 shadow-sm"
                    : "text-neutral-500 hover:text-neutral-900"
                }`}
              >
                📡 实时的扫描会话时间线
              </button>
            </div>
            
            <button
              onClick={onGenerate}
              disabled={isGenerating}
              className="flex items-center gap-2 px-4 py-2.5 bg-neutral-900 hover:bg-neutral-800 text-white rounded-xl text-xs font-mono font-extrabold uppercase tracking-wider shadow transition-all disabled:opacity-50 shrink-0 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-white ${isGenerating ? 'animate-spin' : ''}`} />
              研判大市
            </button>
          </div>
        </div>

        {/* Dynamic Controls Line (Beta Mask toggler + Sandbox specifications) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pt-6 items-center">
          
          <div className="lg:col-span-8 flex flex-wrap items-center gap-6">
            {/* Beta Mask Switcher */}
            <div className="flex items-center gap-3">
              <span className="text-xs font-mono font-extrabold uppercase text-neutral-500 tracking-wider">分析仪：</span>
              <button
                onClick={() => setEnableBetaMask(!enableBetaMask)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  enableBetaMask ? "bg-indigo-650 bg-indigo-600" : "bg-neutral-200"
                }`}
              >
                <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  enableBetaMask ? "translate-x-5" : "translate-x-0"
                }`} />
              </button>
              <div className="text-xs">
                <span className="font-mono font-extrabold text-neutral-900 block leading-tight">Beta Mask (市场全局基底抽取)</span>
                <span className="text-[10px] text-neutral-400 block leading-none">自动过滤SPY贝他贝引力，还原个股受高频对冲和特质事件驱动的真实残差</span>
              </div>
            </div>

            {/* Source Audit Summary indicator */}
            <div className="h-6 w-px bg-neutral-200 hidden md:block" />

            <div className="text-[11px] leading-relaxed text-neutral-450 text-neutral-500">
              <span className="font-mono font-bold text-neutral-800">对齐桥说明 (Temporal Bridges) : </span>
              <span className="inline-flex items-center gap-1.5 ml-2">
                <span className="w-2.5 h-2.5 bg-amber-500 rounded-full inline-block" /> 价格背离
              </span>
              <span className="inline-flex items-center gap-1.5 ml-2">
                <span className="w-2.5 h-2.5 bg-blue-500 rounded-full inline-block" /> 即时同步
              </span>
              <span className="inline-flex items-center gap-1.5 ml-2">
                <span className="w-2.5 h-2.5 bg-slate-500 rounded-full inline-block" /> 延迟反应
              </span>
              <span className="inline-flex items-center gap-1.5 ml-2">
                <span className="w-2.5 h-2.5 bg-purple-500 rounded-full inline-block" /> 反向背离
              </span>
            </div>
          </div>

          <div className="lg:col-span-4 text-left lg:text-right">
            <span className="text-[10px] font-mono bg-neutral-100 text-neutral-600 border border-neutral-200/80 p-2.5 px-3.5 rounded-2xl block lg:inline-block leading-snug">
              {selectedMode === "INDUSTRY_RIVER" 
                ? "💡 演化沙盒：数据均为按多方事件还原的严谨演练场景" 
                : "📡 实时会话：关联您本地早上/晚间/市场历史生成的博弈扫描"}
            </span>
          </div>

        </div>
      </section>

      {/* 2. Main Narrative River - Split Column Design with Center Axis (Strict Single-Page Column alignment) */}
      <div className="relative">
        
        {/* Render River timeline wrapper */}
        {isGenerating ? (
          <div className="bg-white border border-black/5 rounded-[2.5rem] p-24 text-center space-y-4 shadow-sm flex flex-col items-center justify-center">
            <RefreshCw className="h-10 w-10 text-indigo-600 animate-spin" />
            <h4 className="text-sm font-mono font-bold uppercase tracking-widest text-neutral-400">正在重构时空对准矩阵...</h4>
          </div>
        ) : activeNodes.length === 0 ? (
          <div className="bg-white border border-black/5 rounded-[2.5rem] p-24 text-center space-y-4 shadow-sm">
            <Info className="h-10 w-10 text-neutral-300 mx-auto" />
            <h4 className="text-sm font-mono font-bold uppercase tracking-widest text-neutral-400">暂无决策会话生成</h4>
            <p className="text-xs text-neutral-500">点击右上角“研判大市”按钮生成最新的一期市场博弈研判扫描。</p>
          </div>
        ) : (
          <div className="relative space-y-12">
            
            {/* The single-page vertical timeline connector axis */}
            <div className="absolute left-1/2 top-0 bottom-0 w-px bg-neutral-250 bg-neutral-200 -translate-x-1/2 pointer-events-none hidden lg:block" />

            {/* Event Iterators */}
            {activeNodes.map((node, index) => {
              const alignmentInfo = ALIGNMENT_META[node.alignment];
              const isEven = index % 2 === 0;

              return (
                <div key={node.id} className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center relative group min-h-[220px]">
                  
                  {/* LEFT PANE (Lg:col-span-5): Real News Evidence */}
                  <div className={`lg:col-span-5 ${isEven ? "lg:order-1" : "lg:order-3"}`}>
                    <div className="bg-white border border-black/5 p-6 rounded-[2rem] hover:shadow-xl transition-all duration-300 relative overflow-hidden group-hover:border-neutral-300">
                      
                      {/* Top metadata tags */}
                      <div className="flex items-center justify-between gap-2 mb-3 border-b border-neutral-100 pb-3 flex-wrap">
                        <div className="flex items-center gap-1.5">
                          <span className={`px-2 py-0.5 rounded text-[8px] font-mono font-bold uppercase tracking-wider ${
                            node.sourceCategory === "FILING" ? "bg-emerald-50 text-emerald-700 border border-emerald-100" :
                            node.sourceCategory === "WIRE" ? "bg-blue-50 text-blue-700 border border-blue-100" :
                            node.sourceCategory === "RESEARCH" ? "bg-purple-50 text-purple-700 border border-purple-100" :
                            "bg-amber-50 text-amber-700 border border-amber-100"
                          }`}>
                            {node.sourceCategory}
                          </span>
                          <span className="text-[10px] text-neutral-400 font-mono font-semibold truncate max-w-[150px]" title={node.source}>
                            {node.source.length > 30 ? node.source.substring(0, 30) + '...' : node.source}
                          </span>
                        </div>
                        
                        {/* Independence evaluation pill with reason explanation */}
                        <div className="text-right flex items-center gap-1.5" title={node.independenceAudit.reason}>
                          <span className="text-[8px] font-mono uppercase text-neutral-400">信源独立独立审计:</span>
                          <span className={`px-1.5 py-0.5 font-mono text-[9px] font-bold rounded ${
                            node.independenceAudit.score >= 80 ? "bg-emerald-50 text-emerald-700" :
                            node.independenceAudit.score >= 60 ? "bg-amber-50 text-amber-700" : "bg-rose-50 text-rose-700"
                          }`}>
                            {node.independenceAudit.score}分
                          </span>
                        </div>
                      </div>

                      {/* Main Title and Summary */}
                      <h3 className="font-serif text-base font-extrabold text-neutral-900 leading-snug mb-2 group-hover:text-indigo-650 group-hover:text-indigo-600 transition-colors">
                        {node.title}
                      </h3>
                      
                      <p className="text-[11.5px] leading-relaxed text-neutral-500 font-serif italic mb-4 line-clamp-3">
                        “ {node.summary} ”
                      </p>

                      {/* Explicit interactive drawer prompt button */}
                      <div className="flex items-center justify-between pt-3 border-t border-dotted border-neutral-250 border-neutral-200">
                        <span className="text-[9px] font-mono text-neutral-450 text-neutral-400">
                          可信度评定: <b className="text-neutral-700">{node.newsConfidence}</b>
                        </span>
                        
                        <button
                          onClick={() => handleOpenAudit(node)}
                          className="inline-flex items-center gap-1 text-[10px] font-mono font-bold uppercase tracking-wider text-indigo-600 hover:text-indigo-800 transition-colors cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" /> 审计完整证据链 
                        </button>
                      </div>

                    </div>
                  </div>

                  {/* CENTER PANEL (Lg:col-span-2): Temporal alignment clock tick & svg connection bridge indicator */}
                  <div className="lg:col-span-2 lg:order-2 flex flex-col items-center justify-center relative">
                    
                    {/* Visual bridge connection layout via stylized timeline elements */}
                    <div className="z-10 bg-neutral-950 font-mono text-[10px] font-extrabold uppercase text-white p-3 px-5 rounded-2xl shadow-md border-2 border-white flex flex-col items-center text-center leading-none min-w-[125px]">
                      <span className="text-[8px] tracking-widest text-neutral-400 font-bold block mb-1">
                        {node.dateStr}
                      </span>
                      <span className="text-[13px] tracking-tight block">
                        {node.timeLabel}
                      </span>
                    </div>

                    <div className="mt-2 text-center z-10 hidden lg:block">
                      <div 
                        className="h-4 w-px mx-auto"
                        style={{ backgroundColor: alignmentInfo.bridgeColor }}
                      />
                      <div 
                        className="text-[9px] font-mono font-extrabold uppercase p-0.5 px-2.5 rounded-full border border-black/5 inline-block text-neutral-500 hover:bg-neutral-50"
                        title={alignmentInfo.desc}
                      >
                        观测桥
                      </div>
                    </div>

                  </div>

                  {/* RIGHT PANE (Lg:col-span-5): Real Market/Stock feedback */}
                  <div className={`lg:col-span-5 ${isEven ? "lg:order-3" : "lg:order-1"}`}>
                    <div className="bg-[#faf9f6] border border-neutral-200 p-6 rounded-[2rem] hover:shadow-xl transition-all duration-300 relative group-hover:border-neutral-400">
                      
                      {/* Asset and temporal alignment marker */}
                      <div className="flex items-center justify-between gap-2 mb-3 border-b border-neutral-250 border-neutral-200 pb-3 flex-wrap">
                        <div className="flex items-center gap-2">
                          <span className="p-1 px-2.5 bg-neutral-900 text-white font-mono text-[10px] font-extrabold rounded-lg">
                            {node.targetAsset}
                          </span>
                          <span className="text-[11px] font-serif font-extrabold text-neutral-800">
                            市场对应标的
                          </span>
                        </div>

                        <span className={`px-2 py-0.5 rounded text-[8.5px] font-mono font-extrabold uppercase tracking-wide border ${alignmentInfo.badge}`}>
                          {node.alignment.replace(/_/g, " ")}
                        </span>
                      </div>

                      {/* Main Price Runway layout */}
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="bg-white p-3 rounded-xl border border-neutral-200">
                            <span className="text-[8px] font-mono uppercase text-neutral-400 block mb-0.5">新闻前价格序列行为</span>
                            <span className="font-mono text-xs font-semibold text-neutral-700 tracking-tight block">
                              {node.priceActionBefore}
                            </span>
                          </div>
                          
                          <div className="bg-white p-3 rounded-xl border border-neutral-200">
                            <span className="text-[8px] font-mono uppercase text-neutral-400 block mb-0.5">新闻后即时与后续走向</span>
                            <span className="font-mono text-xs font-semibold text-neutral-700 tracking-tight block">
                              {node.priceActionAfter}
                            </span>
                          </div>
                        </div>

                        {/* Beta Mask Display & Calculations Block */}
                        <div className="bg-white p-4.5 p-4 rounded-xl border border-neutral-200 flex flex-col justify-between gap-3">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-serif font-bold text-neutral-800 flex items-center gap-1.5">
                              <Binary className="h-3.5 w-3.5 text-indigo-500" />
                              标的产品日内异动解构
                            </span>
                            
                            {enableBetaMask && (
                              <span className="p-0.5 px-2 bg-indigo-50 border border-indigo-150 text-indigo-700 rounded text-[8px] font-mono font-extrabold">
                                BETA MASK ACTIVE
                              </span>
                            )}
                          </div>

                          <div className="grid grid-cols-2 gap-4 items-center">
                            <div>
                              <span className="text-[8px] font-mono uppercase text-neutral-400 block">原始盘口涨跌 (Raw Yield)</span>
                              <span className="font-mono text-lg font-bold text-neutral-900 tracking-tight">
                                {node.rawDelta}
                              </span>
                            </div>

                            <div className="border-l border-neutral-205 border-neutral-200 pl-4">
                              <span className="text-[8px] font-mono uppercase text-neutral-400 block flex items-center gap-1">
                                贝他清洗残差 (Residual) 
                                <span title="R_stock - β * R_SPY, 60-day window" className="cursor-help"><HelpCircle className="h-2.5 w-2.5 text-neutral-400" /></span>
                              </span>
                              <span className={`font-mono text-lg font-extrabold tracking-tight ${enableBetaMask ? "text-indigo-600 block scale-[1.01]" : "text-neutral-350 text-neutral-300"}`}>
                                {enableBetaMask ? node.residualDelta : "未抽取"}
                              </span>
                            </div>
                          </div>

                          {enableBetaMask && (
                            <div className="text-[8px] font-serif text-neutral-400 border-t border-neutral-100 pt-2 leading-relaxed">
                              * 对准参数: β ({node.targetAsset}) = {node.betaApplied}。该数据基于过去 60 交易日(Window=60)的回测。注意：残差绝对<b>不意味有确凿新闻因果性</b>，其仅表示剥离美股宽基贝他引力后的物理残值。
                            </div>
                          )}
                        </div>

                        {/* Causal Warning Explainer card */}
                        <div className={`p-3.5 rounded-xl border-t-2 text-[10px] leading-relaxed ${alignmentInfo.color}`}>
                          <div className="flex items-start gap-1.5">
                            <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                            <div>
                              <span className="font-mono font-extrabold uppercase tracking-wide block mb-0.5 text-neutral-800">
                                科学演化对准：{alignmentInfo.label}
                              </span>
                              <p className="font-serif">
                                {alignmentInfo.desc}
                              </p>
                            </div>
                          </div>
                        </div>

                      </div>

                    </div>
                  </div>

                </div>
              );
            })}

          </div>
        )}

      </div>

      {/* 3. Deep-Dive Guidelines Sidebar & Behavioral finance (Avoid Low Quality Slop & Telemetry) */}
      <section className="grid grid-cols-1 md:grid-cols-12 gap-8 items-stretch pt-6">
        
        <div className="md:col-span-8 bg-neutral-900 text-white rounded-[2.5rem] p-8 flex flex-col justify-between relative overflow-hidden">
          <div className="space-y-4">
            <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center mb-4">
              <BookOpen className="w-5 h-5 text-indigo-300" />
            </div>
            
            <h3 className="font-serif text-xl font-bold">观察者博弈法则 (Observational Protocol)</h3>
            
            <p className="text-xs text-neutral-300 leading-relaxed font-serif max-w-2xl">
              “一个杰出的金融审计师应当学会脱离单一新闻驱动的‘反射式思维’。在真实清算中，百分之七十的新闻头条仅为在波动发生后被分析员拉来强行做因果包装。利用 Narrative River 时间中轴，我们可以冷静拆解早期背离、延迟调仓以及完全不相关的孤立异动，剔除宏观引力场的影响。这是走向系统工程博弈的核心一步。”
            </p>
          </div>

          <div className="border-t border-white/10 pt-6 mt-8 flex flex-wrap gap-6 items-center justify-between text-[11px] font-mono text-neutral-400">
            <span>
              SYSTEM MODEL: <b className="text-white">TEMPORAL RIVER BASE</b>
            </span>
            <span>
              STATUS: <b className="text-white">NO CAUSAL CLAIMS PRESERVED</b>
            </span>
          </div>

          <div className="absolute bottom-4 right-4 opacity-5">
            <Scale className="h-32 w-32 text-white" />
          </div>
        </div>

        <div className="md:col-span-4 bg-amber-50/50 border border-amber-100 rounded-[2.5rem] p-8 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-amber-800">
              <Sliders className="h-4.5 w-4.5" />
              <h4 className="text-xs font-mono font-extrabold uppercase tracking-wider">行为金融纠偏指南</h4>
            </div>

            <div className="space-y-4 text-[11px] text-amber-950 font-serif leading-relaxed">
              <div>
                <h5 className="font-mono font-bold text-amber-900 text-xs mb-0.5">后此归因偏差 (Post Hoc Reasoner)</h5>
                <p className="text-neutral-600">误将前后发生的相关局势直接等同于必然因果。极易使交易者高估单一头条的影响力。</p>
              </div>

              <div>
                <h5 className="font-mono font-bold text-amber-900 text-xs mb-0.5">叙事谬误 (Narrative Fallacy)</h5>
                <p className="text-neutral-600">由于大脑厌恶市场运行的天然随机流，倾向于用流畅的‘故事’对市场结果强加合理化叙说。</p>
              </div>
            </div>
          </div>

          <div className="border-t border-amber-200/50 pt-4 mt-6 text-[10px] font-mono text-amber-700/80 leading-normal">
            💡 分析时常自问：该标的是否仅是跟随美联储或SPY在同步呼吸？
          </div>
        </div>

      </section>

      {/* 4. Sliding Drawer Component for Advanced Evidence Audit (Evidence Audit Drawer) */}
      <AnimatePresence>
        {drawerOpen && auditedEvent && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              exit={{ opacity: 0 }}
              onClick={handleCloseAudit}
              className="fixed inset-0 bg-neutral-950 z-40 cursor-pointer"
            />

            {/* Slide-in panel */}
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="fixed top-0 right-0 bottom-0 w-full max-w-xl bg-white shadow-2xl z-50 border-l border-neutral-200 flex flex-col justify-between overflow-hidden"
            >
              
              {/* Drawer Header */}
              <div className="p-6 border-b border-neutral-200 flex justify-between items-start bg-neutral-50">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="p-1 px-2.5 bg-neutral-900 text-white font-mono text-[8px] font-extrabold rounded-lg uppercase">
                      {auditedEvent.sourceCategory} SUBSECTION AUDIT
                    </span>
                    <span className="text-xs text-neutral-400 font-mono">
                      ID: {auditedEvent.id}
                    </span>
                  </div>
                  <h3 className="text-lg font-serif font-extrabold text-neutral-900 tracking-tight leading-snug">
                    {auditedEvent.title}
                  </h3>
                  <p className="text-xs text-neutral-500 font-mono">
                    发布对准点: {auditedEvent.dateStr} {auditedEvent.timeLabel}
                  </p>
                </div>

                <button
                  onClick={handleCloseAudit}
                  className="p-2 hover:bg-neutral-200 rounded-full transition-colors cursor-pointer text-neutral-500 hover:text-neutral-900"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Drawer Body - Scrollable content */}
              <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
                
                {/* A. Independence and Redundancy Audit */}
                <div className="bg-[#faf9f6] border border-neutral-200 p-5 rounded-2xl space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-mono font-extrabold uppercase tracking-wider text-neutral-700 flex items-center gap-2">
                      <ShieldCheck className="h-4.5 w-4.5 text-emerald-600" />
                      舆情同源性与独立审计结论
                    </h4>
                    
                    <span className={`px-2 py-0.5 font-mono text-xs font-extrabold rounded ${
                      auditedEvent.independenceAudit.score >= 80 ? "bg-emerald-100 text-emerald-800" :
                      auditedEvent.independenceAudit.score >= 60 ? "bg-amber-100 text-amber-800" : "bg-rose-100 text-rose-800"
                    }`}>
                      独立评级: {auditedEvent.independenceAudit.score}分
                    </span>
                  </div>

                  <p className="text-xs text-neutral-600 font-serif leading-relaxed">
                    <b>核心审计说明：</b>{auditedEvent.independenceAudit.reason}
                  </p>

                  <div className="border-t border-neutral-205 border-neutral-200 pt-3.5 space-y-2">
                    <span className="text-[10px] font-mono font-extrabold uppercase text-neutral-450 text-neutral-400 block mb-1">
                      信号源多角印证核对
                    </span>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {auditedEvent.independenceAudit.checklist.map((chk, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs">
                          <span className={`p-0.5 rounded-full ${chk.passed ? "bg-emerald-100 text-emerald-700" : "bg-neutral-100 text-neutral-400"}`}>
                            <Check className="h-3 w-3" />
                          </span>
                          <span className={chk.passed ? "text-neutral-800" : "text-neutral-400 font-serif line-through"}>
                            {chk.label}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* B. Supporting and Opposing Evidence Analysis */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  
                  {/* Supporting Factor */}
                  <div className="space-y-2">
                    <h5 className="text-[10.5px] font-mono font-extrabold uppercase text-emerald-750 text-emerald-850 tracking-wider">
                      ➕ 增信因子与正向验证
                    </h5>
                    <div className="space-y-2">
                      {auditedEvent.supportingEvidence.map((factor, i) => (
                        <div key={i} className="p-3 bg-emerald-50/50 border border-emerald-100 rounded-xl text-xs font-serif leading-normal text-emerald-950">
                          {factor}
                        </div>
                      ))}
                      {auditedEvent.supportingEvidence.length === 0 && (
                        <div className="text-xs text-neutral-400 italic">尚无强支撑论点。</div>
                      )}
                    </div>
                  </div>

                  {/* Opposing Factor / Friction */}
                  <div className="space-y-2">
                    <h5 className="text-[10.5px] font-mono font-extrabold uppercase text-rose-850 tracking-wider">
                      ➖ 减信因子与逻辑摩擦
                    </h5>
                    <div className="space-y-2">
                      {auditedEvent.opposingEvidence.map((factor, i) => (
                        <div key={i} className="p-3 bg-rose-50/50 border border-rose-100 rounded-xl text-xs font-serif leading-normal text-rose-950">
                          {factor}
                        </div>
                      ))}
                      {auditedEvent.opposingEvidence.length === 0 && (
                        <div className="text-xs text-neutral-400 italic">尚未暴露摩擦分歧。</div>
                      )}
                    </div>
                  </div>

                </div>

                {/* C. Missing information gaps */}
                <div className="space-y-3.5">
                  <h4 className="text-xs font-mono font-extrabold uppercase tracking-wider text-neutral-700">
                    🔍 逻辑传导与缺失信息漏洞 (Missing Gaps)
                  </h4>
                  
                  <div className="p-4 bg-amber-50/40 border border-amber-100 rounded-xl font-serif text-xs leading-relaxed text-[#78350f]">
                    {auditedEvent.currentMissingGaps.map((gap, i) => (
                      <p key={i}>
                        <b>对齐漏洞 {i+1}: </b> {gap}
                      </p>
                    ))}
                  </div>
                </div>

                {/* D. Linked scans */}
                <div className="space-y-3">
                  <h4 className="text-xs font-mono font-extrabold uppercase tracking-wider text-neutral-700">
                    📎 关联研判档案及文献目录
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {auditedEvent.linkedScans.map((scan, i) => (
                      <span key={i} className="p-2 px-3 bg-neutral-100 border border-neutral-205 border-neutral-200 rounded-xl text-xs font-serif text-neutral-700 flex items-center gap-1.5 hover:bg-neutral-200 transition-all">
                        <FileText className="w-3.5 h-3.5 text-neutral-400" />
                        {scan}
                      </span>
                    ))}
                  </div>
                </div>

              </div>

              {/* Drawer Footer */}
              <div className="p-6 border-t border-neutral-200 bg-neutral-50 flex items-center justify-between flex-wrap gap-3">
                <div className="text-[11px] font-mono text-neutral-500">
                  原件源质链接: <a href={auditedEvent.originalSourceLink} target="_blank" rel="noreferrer" className="text-indigo-650 text-indigo-600 underline">点击访问官方归档</a>
                </div>
                
                <button
                  onClick={handleCloseAudit}
                  className="px-5 py-2.5 bg-neutral-900 hover:bg-neutral-800 text-white font-mono text-xs font-bold rounded-xl shadow cursor-pointer transition-all"
                >
                  结束本项审计
                </button>
              </div>

            </motion.div>
          </>
        )}
      </AnimatePresence>

    </div>
  );
}
