# 发现与决策

## 需求
- 围绕 `collection-ops-unification` 进入实施规划阶段。
- 当前只做规划，不直接实现。
- 目标是统一采集运维状态，而不是重写采集逻辑。
- 需要兼容现有 flows，并优先低风险高收益切片。
- 双入口模型已确认：网页负责引导/诊断/状态可视化，终端/worker 负责执行与深度排障。

## 研究发现
- 当前采集运维至少有四套并行状态源：
  - `src/lib/supabase-service.ts` 中的 `raw_comments` 相关逻辑
  - `src/app/api/agent/tasks/route.ts` 中的 `task_queue`
  - `src/app/api/agent/data/route.ts` 中的 `agent_data` + comments 导入
  - `src/lib/supabase-service.ts` 中的 `search_tasks` / `search_results`
- `src/app/p0/page.tsx` 直接读取 `task_queue`，说明当前 UI 还没有统一运行模型。
- `agent task` 与 `agent callback import` 已经形成了可接入 run lifecycle 的主链，是 phase 1 的最佳切入点。
- Bookmarklet intake 当前写入 `raw_comments`，后续 linking/import 与 intake 是割裂的，run identity 会显著改善其可观测性。
- 关键词搜索链路存在，但更偏候选发现，可排在前两条链路后。
- 当前项目没有现成测试框架或 `test` script，但环境中的 Node.js 版本为 `v24.15.0`，并已验证可通过 `node --experimental-strip-types` 直接导入 `.ts` 模块。
- `src/types/index.ts` 是补充 collection run 相关类型的自然入口之一，但纯逻辑状态推进更适合先放在新的 `src/lib` 模块中做 TDD。
- 已新增 `src/lib/collection-run-state.ts` 与 `src/lib/collection-run-state.test.ts`，并通过 TDD 先落地了导入收尾状态矩阵：`failed`（0 imported）、`partial_success`（有 imported 且有 failed）、`completed`（有 imported 且 failed=0）。
- Node 原生测试可跑通，但会对当前 `package.json` 发出 `MODULE_TYPELESS_PACKAGE_JSON` 警告；现阶段先接受警告，不为此调整模块制式。
- 下一条最小 service 切片应围绕 `failure code -> hint` 与 `run event` 结构化构造展开，这样后续 route 接入时可以直接复用同一套诊断语义。
- 已在 `src/lib/collection-run-state.ts` 中补上 `getFailureHint` 与 `createRunEvent`，并由测试锁定 `IMPORT_ZERO_INSERTED` 的稳定提示与 error event 结构。
- 现在可以进入 schema 迁移：新增 `collection_runs` / `collection_run_events`，并对 `raw_comments`、`task_queue`、`agent_data`、`search_tasks` 增加 `collection_run_id`。
- 本地 `tsc` 检查显示：生产 `.ts` 模块内部导入要保持 extensionless，而 Node 原生测试更适合改成 `.mjs` 并显式导入 `.ts` 模块，这样可以同时兼容 `tsc` 与 `node --experimental-strip-types`。
- `/api/agent/data` 现已能从 `task_queue` 解析 `collection_run_id`，给 `agent_data` 尝试挂 run，并在导入后把 `RAW_RECEIVED` / `IMPORT_STARTED` / `IMPORT_COMPLETED` 以及 `received/imported/duplicate/filtered/failed` 汇总写回 `collection_runs`。
- `importComments` 的返回值已扩展为 `filtered` 与 `failed`，避免 route 层猜测统计含义。
- `ANALYSIS_TRIGGERED` / `ANALYSIS_TRIGGER_FAILED` 已通过 `createAnalysisTriggerEvent` 接入 `/api/agent/data`，分析触发结果现在也会写回 `collection_run_events`。
- 现已新增 `GET /api/collection/runs` 读口，并用 `mergeRunsWithLatestEvents` 把 run 与最新事件拼成 P0 可直接消费的列表。
- P0 已新增“采集运行中心”面板，并且实测位于“云端采集任务”之前；空态、刷新按钮和 run 列表渲染均正常。
- 本机 Python 环境未安装 Playwright，因此本轮 UI 验证改用仓库自带的 Node Playwright 完成；页面无 page error，控制台只见 HMR/React DevTools 常规日志。
- 结合 Supabase/Postgres 最佳实践与现有迁移风格，phase 2 迁移应采用：
  - `TEXT + CHECK` 而不是 Postgres enum，降低后续状态扩展成本
  - `JSONB` 事件明细字段，便于存结构化诊断上下文
  - 对活跃状态使用 partial index（例如 `queued/running/importing/awaiting_input`）
  - 使用 `DO $$` 包裹外键约束与 policy 创建，保证幂等性
  - 保持与现有项目一致的宽松 RLS/policy，避免 phase 2 意外改变安全模型

## 技术决策
| 决策 | 理由 |
|------|------|
| 新增 `collection_runs` + `collection_run_events` | 为多入口采集提供统一的用户可见真相源 |
| 旧表只做挂接，不做 destructive replacement | 降低迁移风险，满足软兼容要求 |
| 为 `raw_comments` / `task_queue` / `agent_data` / `search_tasks` 增加 `collection_run_id` | 用最小结构调整串联现有链路 |
| P0 新增 run panel 作为主状态面板 | 先收状态透明，不先做大规模 UI 改造 |
| failure code + hint 采用稳定机器码 | 让页面与终端共享诊断语义和恢复动作 |

## 遇到的问题
| 问题 | 解决方案 |
|------|---------|
| 设计完成后环境中没有 `writing-plans` 技能名 | 使用可用的 `planning-with-files-zh` 进入实施规划流程 |
| 项目根目录没有现成规划文件 | 依据技能模板初始化规划文件 |
| `docs/` 目录原先不存在 | 已为 spec 创建 `docs/superpowers/specs/` |

## 资源
- 已批准 spec：`docs/superpowers/specs/2026-06-17-collection-ops-unification-design.md`
- 关键实现文件：
  - `src/app/api/agent/tasks/route.ts`
  - `src/app/api/agent/data/route.ts`
  - `src/lib/supabase-service.ts`
  - `src/app/p0/page.tsx`
  - `src/lib/bookmarklet-code.ts`
  - `public/bookmarklet.js`
  - `supabase/migrations/005_create_task_queue.sql`
  - `supabase/migrations/006_create_search_tasks.sql`
  - `supabase/migrations/008_combined_fix.sql`

## 视觉/浏览器发现
- 本轮规划无需浏览器辅助；设计与计划均可通过文本完成。

---
*每执行2次查看/浏览器/搜索操作后更新此文件*
*防止视觉信息丢失*
