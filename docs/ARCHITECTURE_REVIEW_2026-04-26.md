# News_Report 架构评审（2026-04-26）

> 目标：把当前项目从“聪明 demo”升级成“可信、可持续的个人情报系统”。

## 0. 执行摘要

当前方向正确：你在做的是“个人决策情报系统”，不是大众新闻产品。

但核心短板在于：
1. **可信度工程化不足**（多源确认、去重、置信度仍偏启发式）
2. **运行边界混杂**（前端/后端/模型调用职责不够清晰）
3. **可维护性风险上升**（App.tsx 承载过多业务逻辑）

---

## 1. 亮点（应该保留）

1. **新闻与市场分离**：避免把叙事和价格反应混为一谈。
2. **明确的流水线**：RSS 采集 → 时间过滤 → 去重 → 排序。
3. **晨报/晚报机制**：体现“情报校准”而非一次性摘要。
4. **市场分析定位清晰**：强调“信息解读”而非交易信号。

---

## 2. 高优先级问题（P0/P1）

### P0-1：健康检查与 Provider 选择不一致

- 前端可选 provider（gemini/ollama），默认 `gemini`。
- 但 `/api/health` 只检查 Ollama OpenAI client 通道。
- 结果：UI 在线状态可能与实际调用 provider 脱节。

**建议**
- 新增 `GET /api/health?provider=gemini|ollama`。
- 前端随 provider 切换触发对应健康检查。

### P0-2：密钥与调用边界存在安全/部署风险

- `src/lib/gemini.ts` 在前端侧引用 `process.env.GEMINI_API_KEY`。
- 浏览器环境通常不具备 Node `process.env`，且密钥不应暴露到客户端。

**建议**
- 把 Gemini 调用完全移到服务端（统一经 `/api/generate-news` 风格接口）。
- 前端仅传结构化参数，不直接接触模型密钥。

### P1-1：多源确认与去重算法误判概率高

- “多源确认”依赖标题归一化 + 前 50 字符，易出现碰撞。
- `includes` 子串去重会误伤（同词不同事件 / 同事件不同措辞）。

**建议**
- 升级为“事件指纹”：
  - title embedding + named entities + published window + source domain
- 采用相似度阈值聚类（如 0.82）替代纯字符串包含。

### P1-2：排序规则可解释但不稳定

- 关键词累加 + 类别加权 + recency 容易叠加过度。
- 缺少“负向信号”与“不确定惩罚”（单一低可信来源）。

**建议**
- 改为可配置评分卡：
  - `score = source_tier + freshness + topic_fit + corroboration - uncertainty_penalty`
- 对每条新闻输出可解释 breakdown，便于手工调参。

### P1-3：市场状态判定过于简化

- 仅按美东时间和周末判断开闭市，未考虑节假日、半日市、盘前盘后。

**建议**
- 增加交易日历（至少节假日 + 半日市规则）。
- UI 显示“Regular / Pre / Post / Closed”。

---

## 3. 产品策略评审（直白版）

## 真正有价值的

1. **Morning/Evening 校准链路**（这是核心差异化）
2. **News + Market 双镜头**（情报解释层）
3. **个人优先主题权重**（个体决策效率放大器）

## 当前可删减或后置的

1. 过长风格型 prompt（可迁移为模板 + schema）
2. 太多“文案型段落”先于“结构化事实层”
3. 把 localStorage 历史当长期记忆系统（实际上只是本地缓存）

---

## 4. AI 质量改进路线（建议按阶段）

## Phase A（1-2 周）：保真与抗幻觉

1. 两阶段生成：
   - 阶段1：结构化事实抽取（JSON）
   - 阶段2：从 JSON 渲染 Markdown
2. 每条结论必须绑定来源 URL（无引用则降级）
3. 增加“不确定性标记”字段：`unknown_fields[]`
4. 失败降级：LLM 失败时仍输出“事实清单”

## Phase B（2-4 周）：排序与质量可观测

1. 建立离线评估集（50-100 条样本）
2. 指标化：
   - 重复率
   - 错误归因率
   - 无来源结论率
   - 用户可用性评分
3. 把评分参数抽到配置，支持 A/B 对比

## Phase C（4+ 周）：进阶智能

1. 事件图谱（同事件多日报道合并）
2. 主题 drift 检测（过去 7 天叙事迁移）
3. 市场-新闻对齐（时间窗内相关性提示）

---

## 5. UX 改造建议

1. 首页改为 **Today Control Panel**：
   - Morning 状态
   - Evening 状态
   - 数据新鲜度
   - RSS 失败源列表
2. Markets 首屏只保留 3 个结论：
   - Priced-in
   - Ignored
   - Watchlist (T+1)
3. LLM 状态拆分为 provider 级别（Gemini/Ollama 独立）

---

## 6. 可维护性改造建议（代码结构）

建议将当前逻辑拆分：

- `src/features/news/*`
  - `pipeline.ts`（采集、去重、排序）
  - `prompt.ts`
  - `service.ts`
- `src/features/market/*`
  - `snapshot.ts`
  - `analysis.ts`
- `src/features/reports/*`
  - `storage.ts`
  - `history.ts`
- `src/ui/*`
  - `ReaderView.tsx`
  - `MarketsView.tsx`
  - `HistoryView.tsx`

同时引入：
- 统一错误模型（`AppError`）
- 日志 trace id（串联单次生成流程）

---

## 7. 产品化与商业化（可选）

如果未来产品化，优先客户群：
1. 研究员/咨询/小基金团队
2. 创业者与管理层助手
3. 行业销售与投研支持角色

建议从“个人专业版”开始，再扩展到小团队协作版。

---

## 8. 30 天执行清单（可直接照做）

### Week 1
- [ ] provider 级健康检查
- [ ] Gemini 调用后端化（前端移除密钥依赖）
- [ ] 失败降级输出

### Week 2
- [ ] 去重从子串匹配升级为相似度阈值
- [ ] 排序输出 score breakdown
- [ ] 增加 source failure dashboard

### Week 3
- [ ] 结构化事实层（JSON schema）
- [ ] 引用强制绑定
- [ ] unknown 字段落地

### Week 4
- [ ] 离线评估集 + 指标看板
- [ ] 调参/A-B 实验
- [ ] 首版“周度策略复盘”

---

## 9. 最后一条直话

你不是在做“新闻摘要工具”，你在做“个人决策情报系统”。

真正的分水岭不在 UI 多漂亮，而在 **可信度是否可验证、质量是否可观测、流程是否可持续**。
