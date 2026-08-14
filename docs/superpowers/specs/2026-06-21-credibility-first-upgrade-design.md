# OutEye Pulse 可信度优先升级设计

- **日期：** 2026-06-21
- **状态：** 已完成设计评审，待用户审阅 spec
- **适用范围：** `collect + p0 + analyze + report + docs`

## 1. 背景

OutEye Pulse 已具备从采集、运行追踪、AI 分析到可视化和报告导出的完整研究型工作台能力，但当前仍存在一组会直接削弱研究结果可信度与日常使用效率的问题：

1. **研究可信度表达不成体系**
   - 统计正确性、结果解释性、来源追溯性分散在不同页面或尚未显式表达。
   - 页面可以“出结果”，但系统不能稳定回答“这份结果为什么可信、哪里不够可信”。

2. **入口职责部分重叠**
   - `/collect` 与 `/p0` 都承担了部分入口语义。
   - 高频操作者知道两者都重要，但角色边界不够清晰，导致认知成本偏高。

3. **结果页与导出层存在口径风险**
   - `report` 当前存在统计口径 bug 风险，尤其是 0 值 / 缺失值 / 过滤值处理不稳定时，会削弱结果可信度。
   - 页面与导出若分别计算，容易出现同一结果多套口径。

4. **页面数据获取依赖偏前序流程**
   - 某些页面更依赖 store 预热，而不是支持直接打开后的冷启动自举。
   - 这会放大“有时能用、有时怪”的感受，也不利于结果可复查。

5. **文档与真实代码状态漂移**
   - 当前存在文档仍写 MiMo、而代码已迁移到 DeepSeek 等认知漂移。
   - 团队协作与产品认知会因此失真。

## 2. 本轮升级的已确认前提

### 2.1 目标用户
本轮升级默认优先服务 **内部高频操作者**，而不是零学习成本的新手自助用户。

这意味着本轮方案优先追求：
- 研究结果更可信
- 运行状态更透明
- 高级控制能力保留
- 页面职责更清晰

而非优先追求：
- 尽可能隐藏系统复杂度
- 将全部工程概念从前台抹平

### 2.2 入口结构
- **`/collect`**：默认主入口，承担“研究任务前台”角色
- **`/p0`**：运行中心 / 恢复后台，承担“运维与恢复控制台”角色

这意味着：
- 日常从 `/collect` 开始
- 出问题、补录、查 run、恢复任务、诊断链路时进入 `/p0`

### 2.3 第一优先目标
本轮升级的第一优先验收目标是 **研究可信度**，并且不是单点修复，而是同时覆盖：

1. **统计正确性**
2. **结果可解释性**
3. **数据来源可追溯性**

### 2.4 第一阶段范围
第一阶段不是只动结果页，而是覆盖：
- `/collect`
- `/p0`
- `/analyze`
- `/report`
- 项目文档

## 3. 设计目标

第一阶段完成后，系统应能够稳定回答以下问题：

1. **这份结果是怎么算出来的？**
2. **这份结果在什么边界内成立？**
3. **这份结果来自哪些采集事实与运行事实？**
4. **当前结果适合直接引用，还是应补录/重试/谨慎引用？**
5. **前台与后台分别应该做什么？**

## 4. 非目标

本轮第一阶段不做以下内容：

1. 不重写整套页面 IA 或做整站大改版
2. 不先建立新的复杂 credibility 持久化表
3. 不把全部系统压缩成文科生零门槛自助工具
4. 不重做采集底层架构或重写 run 生命周期
5. 不做与可信度主线无关的大范围视觉翻新

## 5. 产品结构与页面职责

### 5.1 `/collect`：研究任务前台
`/collect` 是默认入口，负责回答：
- 我现在要研究什么内容
- 我能采到什么
- 这批样本值不值得继续
- 下一步是直接分析，还是先补录/恢复

因此它应承担：
- 链接 / 关键词发起采集
- 候选分、召回来源、研究等级、完整度判断
- 风险提示与补录建议
- 从“发现内容”到“形成研究样本”的主路径决策

它不应承担的重点：
- agent 细节
- heartbeat / stall 细节
- retry / cancel / command 控制
- 原始导入级排障

### 5.2 `/p0`：运行中心 / 恢复后台
`/p0` 负责解释与控制“研究任务已经发起之后发生了什么”。

它应承担：
- run 监控
- retry / cancel / command
- bookmarklet / raw import / agent data 相关恢复
- 环境和链路诊断
- 为什么这次结果不完整 / run 为什么卡住 / 补录是否提升了可信度

### 5.3 `/analyze`：可信解释层
`/analyze` 不只是图表页，而是负责把数据转成可解释研究判断：
- 样本规模
- 有效样本量
- 结论边界
- 偏差与缺口
- 当前结论属于强结论 / 弱结论 / 参考结论

### 5.4 `/report`：正式输出层
`/report` 输出的是“可被正式引用的结果版本”，因此必须满足：
- 统计口径明确
- 样本说明明确
- 来源可追溯
- 风险提示完整
- 页面与导出口径一致

## 6. 可信度系统总设计

### 6.1 核心概念：Credibility Profile
第一阶段引入统一的 **credibility profile** 派生对象，由四类信息构成：

**粒度约定：** 第一阶段 profile 粒度固定为 **项目级**。post 级和维度级 profile 留待后续阶段，本 spec 不涉及。

1. **统计正确性**
   - 样本总量
   - 有效样本量
   - 参与统计样本量
   - 0 值 / 缺失值 / 过滤值 / 重复值处理规则
   - 推断统计是否满足解释前提

2. **结果可解释性**
   - 当前结论强弱
   - 样本边界
   - 平台偏斜、时间窗口、覆盖缺口等限制
   - 研究等级和可信度说明

3. **来源可追溯性**
   - 来自哪些平台
   - 对应哪些 collection run
   - 是否经历过 retry / backfill / bookmarklet 补录
   - 哪些失败或 partial_success run 影响了最终结果

4. **下一步动作建议**
   - 可直接分析
   - 建议补录
   - 建议重试
   - 建议谨慎引用

### 6.2 统一派生，而非先建新存储
第一阶段不引入新的复杂持久化表，而是基于现有：
- `posts`
- `comments`
- `collection_runs`
- `collection_run_events`
- analysis 字段
- 补录/filtered/failed/duplicate 信息

派生出统一 credibility profile，再由各页面消费。

这样做的理由：
- 风险更低
- 与现有 `collection_runs` 体系兼容
- 能更快完成“结果可信度升级”而不是先做存储改造

## 7. 模块设计与文件落点

### 7.1 新增统一层

#### `src/lib/research-credibility.ts`
统一生成 credibility profile，总入口模块。

**职责：**
- 汇总统计结果、trace 结果、质量判断、推荐动作
- 为页面提供稳定、结构化、统一口径的可信度对象

#### 统计输入构造层（薄层，并入 `research-credibility.ts` 或新建 `src/lib/research-statistics-input.ts`）
负责把 `comments` + `analysis` 字段正确转成统计输入数组。

**职责：**
- 严格区分 `null / undefined`（缺失值）、`0`（合法值）、`filtered`（被过滤）
- 不再把缺失值通过 `|| 0` 当作 0 处理
- 不再用 `.filter(v => v !== 0)` 把合法 0 值和缺失值一起丢弃
- 输出给 `src/lib/statistics.ts` 的 `welchTTest` 等函数直接消费

**关键边界：**
- **不重写统计算法**。`src/lib/statistics.ts` 已提供 `welchTTest`、`mannWhitneyU`，继续复用。
- **不新增 `report-statistics.ts`**，避免与现有 `statistics.ts` 职责重叠。
- 真正要修的是 `src/app/report/page.tsx` 第 38-39 行的调用方式：从"自己拼统计输入"改为"调用统一输入构造器"。

#### `src/lib/research-trace.ts`
负责从结果回到采集与运行事实。

**职责：**
- 汇总相关 run
- 标记 failed / partial_success / retry / backfill
- 追踪平台来源、补录来源与 trace completeness

#### `src/lib/research-credibility-copy.ts`
负责可信度说明文案映射。

**职责：**
- 风险提示文案
- 研究等级解释文案
- 引用建议文案
- 补录 / 重试 / 谨慎引用等动作提示文案

### 7.2 复用与边界

#### 复用模块
- `src/lib/statistics.ts`（已提供 `welchTTest`、`mannWhitneyU`，直接复用，不重写）
- `src/lib/collection-quality.ts`
- `src/lib/collection-next-action.ts`
- `src/lib/collection-runs-list.ts`
- `src/lib/collection-run-state.ts`
- `src/types/index.ts`

#### 关键边界
- **run state 层** 负责”发生了什么”
- **credibility layer** 负责”这对研究结果意味着什么”

不应把研究解释逻辑反塞进 run lifecycle helper 中。

#### 依赖方向（单向，避免循环）
credibility profile 是**下游汇总者**，单向消费 `collection-quality` 和 `collection-next-action` 的输出：

```
research-credibility.ts
  → 调用 collection-quality.ts（获取 research grade）
  → 调用 collection-next-action.ts（获取下一步动作）
  → 调用 research-trace.ts（获取溯源摘要）
  → 调用 research-statistics-input（获取统计输入）
  → 调用 statistics.ts（执行推断统计）
```

`collection-quality.ts` 和 `collection-next-action.ts` 的签名**不扩展**，仍只接受采集层字段（`platform / needBackfill / queued / coverageScore / metadataCompleteness`）。credibility 层负责把 profile 中的对应字段映射成它们的入参，再把结果汇进 profile。

## 8. 数据流设计

### 8.1 页面必须支持冷启动自举
第一阶段明确要求关键页面不再依赖"用户先逛过别的页面"才能有数据。

**现状澄清：**
`useAppStore` 的 `partialize` 只持久化 UI 状态（`presentationMode / sidebarCollapsed / terminologyMode / activeAnalysisLogId`）。`posts / comments / projects / currentProject` 本就是纯内存态，刷新即丢——store **现在就不是**唯一真相源。

真正的问题是：`works / report / analyze` 等页面在挂载时**没有主动回拉数据**，它们假设用户先逛过 collect 或 p0、store 里已有数据。

**原则：**
- `useAppStore` 角色不变，继续作为内存缓存
- 第一阶段要做的是：给 `works / report / analyze` 的页面挂载逻辑补上 `fetchProjects / fetchPosts / fetchComments`，在 store 为空时自动从 Supabase 回拉
- 直接打开 `/collect`，能拉到项目上下文
- 直接打开 `/p0`，能拉到 run / event
- 直接打开 `/analyze`，能拉到 posts / comments / analysis
- 直接打开 `/report`，能拉到统计所需上下文

store 不动，改的是页面挂载逻辑。

### 8.2 统一派生流水线
数据流统一为：

1. **原始业务数据层**
   - posts / comments / collection_runs / collection_run_events / analysis 等

2. **派生层**
   - `report-statistics.ts`
   - `research-trace.ts`
   - `collection-quality.ts`
   - `collection-next-action.ts`
   - `research-credibility.ts`

3. **页面消费层**
   - `/collect` 消费可信度预判与下一步建议
   - `/p0` 消费运行事实对可信度的影响
   - `/analyze` 消费结论边界与解释信息
   - `/report` 消费正式引用所需说明

4. **导出层**
   - Word / CSV / Excel 导出与页面共用同一统计与可信度对象

## 9. 异常与不完整状态设计

第一阶段统一处理以下 5 类状态：

### 9.1 无数据
示例：
- 尚未采集
- 当前项目没有 posts / comments

**处理原则：**
- 使用明确空态
- 给出下一步动作
- 不用“系统错误”式表现

### 9.2 数据不完整
示例：
- run partial_success
- analyzed comments 少于 total comments
- 某平台采集缺失
- 补录未完成

**处理原则：**
- 不隐藏已有结果
- 显式标记“部分可用”
- 自动降低引用建议级别

### 9.3 统计前提不成立
示例：
- 样本过小
- 组间极不平衡
- 输入全 null / 全被过滤
- 推断统计不适用

**处理原则：**
- 不输出伪正式推断结论
- 可保留描述性统计
- 明确说明“当前不支持该统计判断”

### 9.4 来源追溯不完整
示例：
- 历史 comments 缺少完整 run 关联
- 旧链路留下追溯灰区

**处理原则：**
- 显示 trace completeness 不足
- 不默认当作完全可信
- 在报告中保留单独说明

### 9.5 运行异常影响结果可信度
示例：
- failed run
- stale heartbeat
- import zero inserted
- analysis trigger failed

**处理原则：**
- `/p0` 解释“这次失败对结果有什么影响”
- `/analyze` 与 `/report` 继承该影响，而不是只看表层 comment 数量

## 10. 阶段化实施路线

### 阶段 1：可信度全链路升级（本 spec 重点）
包含 5 个子块：

1. **统计正确性**
   - 修 report 统计口径问题
   - 统一 0 值 / 缺失值 / 过滤值 / 重复值处理
   - 统一导出与页面口径

2. **结果解释**
   - 在 analyze / report 展示样本规模、边界、风险、偏差、结论强弱

3. **结果溯源**
   - 建立结果回链到 run / source / backfill / completeness 的能力

4. **前后台收口**
   - `/collect` 强化为前台
   - `/p0` 强化为恢复后台
   - 统一可信度叙事

5. **文档同步**
   - README / PROJECT_STATUS / env / DeepSeek / run 体系说明同步

### 阶段 2：高频操作者效率优化
目标是在可信度站稳后，让工作流更顺手：
- 减少 collect 页跳转成本
- 缩短候选 → 采集 → 分析 → 报告路径
- 聚合 p0 常见恢复动作

### 阶段 3：更广角色友好化
目标是在不牺牲专业控制力的前提下，降低非工程研究用户的上手门槛。

## 11. 测试与验收

### 11.1 单元测试
第一阶段至少补以下测试：

1. **`report-statistics`**
   - 0 值不被误丢弃
   - null / undefined / filtered / duplicate 处理一致
   - 样本不足时不给伪显著性

2. **`research-trace`**
   - completed / failed / partial_success / retry / bookmarklet backfill 的追溯摘要正确

3. **`research-credibility`**
   - 同一输入稳定生成一致 credibility profile
   - 风险提示、grade、next action 不冲突

4. **copy 映射层**
   - 各类可信度状态有稳定且不歧义的说明文案

### 11.2 集成验证
第一阶段至少覆盖：

1. collect → analyze
2. run → p0 → report
3. bookmarklet / backfill → credibility upgrade
4. 页面与导出一致

### 11.3 页面 smoke test
必须将“冷启动直达访问”纳入正式验收：
- 新开会话直接进 `/collect`
- 新开会话直接进 `/p0`
- 新开会话直接进 `/analyze`
- 新开会话直接进 `/report`

### 11.4 Done 定义
第一阶段完成必须同时满足：

1. `report` 统计口径 bug 修复（`report/page.tsx:38-39` 不再用 `|| 0` + `.filter(v => v !== 0)` 混淆缺失值与合法 0 值）
2. collect / p0 / analyze / report 显示的样本规模、有效样本量、研究等级、风险提示**口径一致**，且来自同一个 `research-credibility` helper 调用（而非各页自己计算）
3. 结果可追到 run / source / backfill / completeness
4. 页面挂载时若 store 为空，能自动从 Supabase 回拉所需数据（`works / report / analyze` 不再假设用户先逛过别的页面）
5. 导出与页面展示口径一致
6. README / PROJECT_STATUS / DeepSeek / run 体系说明同步更新

## 12. 方案取舍说明

本方案选择 **“可信度主线优先，顺手收口入口”**，而不是：
- 先重做整站信息架构
- 或先只做工程底层、延后前台表达

选择该方案的原因：
1. 与本轮已确认的优先级最一致
2. 能最快提升“这份结果我敢不敢信”
3. 能在不大拆页面结构的前提下显著提升产品专业度
4. 能顺手完成 `/collect` 前台、`/p0` 后台的角色收口

## 13. 风险与后续观察点

### 风险
1. 历史数据的 run 追溯可能不完整
2. 页面冷启动改造可能暴露更多隐含耦合
3. 若页面与导出此前使用不同统计路径，统一后可能暴露旧结果口径变化

### 观察点
1. credibility profile 计算是否出现性能瓶颈
2. 是否需要在后续阶段将部分可信度摘要持久化
3. 是否需要为历史无 run 数据单独建立 trace fallback 策略

## 14. 结论

本 spec 的核心不是给系统再加一层装饰性“可信度标签”，而是把：

- **算得对**
- **说得清**
- **查得到来源**

变成 OutEye Pulse 从采集前台、运行后台、分析解释到正式报告输出的一条统一能力链。

这是最符合当前产品阶段、目标用户和升级优先级的路线。