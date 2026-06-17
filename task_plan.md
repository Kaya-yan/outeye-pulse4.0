# 任务计划：collection-ops-unification 实施规划

## 目标
在不推翻现有采集链路的前提下，为 OutEye 建立统一的采集运行中枢（collection runs），让网页与终端围绕同一条运行状态流协作，实现状态透明、可诊断、可恢复的采集运维体验。

## 当前阶段
全部阶段已完成

## 各阶段

### 阶段 1：实施规划与切片
- [x] 确认已批准的设计文档
- [x] 提炼 phase 1 的实施顺序与边界
- [x] 记录关键文件、迁移约束与验证策略到 findings.md
- [x] 初始化 task_plan.md / findings.md / progress.md
- **状态：** complete

### 阶段 2：Schema 与 operational service layer
- [x] 新增 `collection_runs` / `collection_run_events` 迁移
- [x] 为 `raw_comments` / `task_queue` / `agent_data` / `search_tasks` 增加 `collection_run_id`
- [x] 建立 `finalizeImportRun` 的第一组 TDD 测试（failed / partial_success / completed）
- [x] 建立最小 failure hint 映射与 run event 构造逻辑
- [x] 建立 queued run 与 running/claim 状态推进逻辑
- [x] 为 phase 2 编写 schema 迁移（新表 + `collection_run_id` 挂接）
- [x] 继续收束统一的 run/event service（创建 run、追加 event、推进状态、汇总计数、heartbeat）
- **状态：** complete

### 阶段 3：接入 agent task path
- [x] 改造 `src/app/api/agent/tasks/route.ts`，创建任务时关联 run
- [x] 将 task status 更新映射为 run status / stage / event / heartbeat
- [x] 处理旧调用方未传 run 的兼容路径
- **状态：** complete

### 阶段 4：接入 agent callback import path
- [x] 改造 `src/app/api/agent/data/route.ts`，回传时解析 run
- [x] 导入前后写入 `RAW_RECEIVED` / `IMPORT_STARTED` / `IMPORT_COMPLETED` 等事件
- [x] 统一汇总 imported / duplicate / filtered / failed 计数
- [x] 接上 `ANALYSIS_TRIGGERED` / `ANALYSIS_TRIGGER_FAILED`
- **状态：** complete

### 阶段 5：新增 P0 run panel
- [x] 为 P0 增加 run-centric 状态面板
- [x] 用 run 列表替代直接暴露底层 `task_queue` 状态作为主视图
- [x] 展示 current stage、latest event、failure code、hint、heartbeat
- **状态：** complete

### 阶段 6：接入 Bookmarklet intake / linking
- [x] 为 bookmarklet intake 增加 `collection_run_id` 归属能力
- [x] 改造 raw intake → link/import，使其贯通为单一 run
- [x] 保留旧 intake 流程的软兼容入口
- **状态：** complete

### 阶段 7：接入 keyword search path
- [x] 为 `search_tasks` 挂接 `collection_run_id`
- [x] 让 keyword search 产出 run timeline
- [x] 明确搜索 run 与后续采集 run 的关联策略
- **状态：** complete

### 阶段 8：恢复动作与统一命令输出
- [x] 新增 retry / cancel / command regeneration 相关接口
- [x] 为不同 failure code 提供默认恢复动作
- [x] 明确 CLI/worker 需要遵守的 run reporting contract
- **状态：** complete

### 阶段 9：测试与验证
- [x] 为状态推进、failure hint、heartbeat stall detection 增加单测
- [x] 为 agent task / agent data / bookmarklet 路径增加集成验证
- [x] 记录 smoke test 与 UI 验证结果到 progress.md
- **状态：** complete

## 关键问题
1. `collection_run_id` 应如何在旧调用方未显式传入时被安全推导与补写。
2. run 状态推进逻辑应集中在 service 层，避免散落在 route 与页面中。
3. P0 新面板应在不大幅重构原页面的情况下落地。

## 已做决策
| 决策 | 理由 |
|------|------|
| 采用新增统一层而不是替换旧表 | 用户要求软兼容，并优先要状态透明而非重写架构 |
| Phase 1 优先接入 agent task path 和 agent callback import | 这条链路最接近标准运维生命周期，收益最高 |
| P0 先新增 run panel，不立即重写全部信息架构 | 降低 UI 改造风险，保留现有可用入口 |
| run 作为用户可见真相源，旧表状态仅作底层实现细节 | 解决“多表多状态”带来的认知分裂 |

## 遇到的错误
| 错误 | 尝试次数 | 解决方案 |
|------|---------|---------|
| 规划文件不存在 | 1 | 初始化 `task_plan.md`、`findings.md`、`progress.md` |
| session-catchup 无输出 | 1 | 视为无未同步上下文，继续初始化新的规划文件 |
| 首条 TDD 测试因 `collection-run-state.ts` 缺失而报 `ERR_MODULE_NOT_FOUND` | 1 | 先创建最小 stub 导出，让失败从“模块缺失”收敛到“行为断言失败” |
| 第二轮 service 测试因缺少 `createRunEvent` / `getFailureHint` 导出而报 ESM import error | 1 | 先补最小导出 stub，让测试继续红到具体行为断言 |
| 第三轮 service 测试因缺少 `createQueuedRun` 导出而报 ESM import error | 1 | 先补最小导出 stub，让测试收敛到 queued run 结构断言 |
| 第四轮 service 测试因缺少 `markRunRunning` 导出而报 ESM import error | 1 | 先补最小导出 stub，让测试收敛到 running 状态断言 |
| Agent task helper 测试因缺少 `agent-task-run.ts` 模块而报 `ERR_MODULE_NOT_FOUND` | 1 | 先创建最小 stub 模块，让测试收敛到 artifacts 结构断言 |
| Agent data helper 测试因缺少 `agent-data-run.ts` 模块而报 `ERR_MODULE_NOT_FOUND` | 1 | 先创建最小 stub 模块，让测试收敛到 import lifecycle artifacts 结构断言 |
| 分析触发事件测试因缺少 `createAnalysisTriggerEvent` 导出而报 ESM import error | 1 | 先补最小导出 stub，让测试收敛到 analysis event 结构断言 |
| collection runs 列表 helper 测试因缺少 `collection-runs-list.ts` 模块而报 `ERR_MODULE_NOT_FOUND` | 1 | 先创建最小 stub 模块，让测试收敛到 latest event 拼装断言 |
| bookmarklet run helper 测试因缺少 `bookmarklet-run.ts` 模块而报 `ERR_MODULE_NOT_FOUND` | 1 | 先创建最小 stub 模块，让测试收敛到 run/event 结构断言 |
| keyword search helper 测试因缺少 `search-run.ts` 模块而报 `ERR_MODULE_NOT_FOUND` | 1 | 先创建最小 stub 模块，让测试收敛到 search run 结构断言 |
| retry helper 测试因缺少 `collection-run-retry.ts` 模块而报 `ERR_MODULE_NOT_FOUND` | 1 | 先创建最小 stub 模块，让测试收敛到 retry artifacts 结构断言 |
| command helper 测试因缺少 `collection-run-command.ts` 模块而报 `ERR_MODULE_NOT_FOUND` | 1 | 先创建最小 stub 模块，让测试收敛到命令类型和内容断言 |
| bookmarklet row attachment 测试因缺少 `attachCollectionRunIdToRawRows` 导出而报 ESM import error | 1 | 先补最小导出 stub，让测试收敛到 raw row 结构断言 |
| bookmarklet linking 测试因缺少 `buildBookmarkletLinkLifecycleArtifacts` 导出而报 ESM import error | 1 | 先补最小导出 stub，让测试收敛到 linking lifecycle 断言 |

## 备注
- 当前已批准的 spec 文件：`docs/superpowers/specs/2026-06-17-collection-ops-unification-design.md`
- 当前处于“先规划，不直接实现”的阶段
- 实施前需要把每个阶段的关键文件和验证方式再细化一层
