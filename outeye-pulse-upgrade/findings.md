# 发现与决策

## 升级背景
- 基于 `docs/superpowers/specs/2026-06-21-credibility-first-upgrade-design.md` 进入实施。
- 已确认 5 处 spec 修正全部写回：复用 statistics.ts、store 不动改挂载、单向依赖、项目级粒度、可验证 Done。

## 代码现状核对（2026-07-18 复核）
- `src/lib/statistics.ts` 已存在，导出 `welchTTest` 和 `mannWhitneyU`，`report/page.tsx:8` 已在用。
- `report/page.tsx:38-39` 确认存在统计口径 bug：`|| 0` + `.filter(v => v !== 0)` 混淆缺失值与合法 0 值。
- `useAppStore.ts:161-166` 的 `partialize` 只持久化 UI 字段，posts/comments/projects 本就是内存态，store 不是真相源。
- `works / report / analyze` 页面挂载时未见主动 fetchProjects/fetchPosts/fetchComments。
- `collection-quality.ts` 入参：coverageScore / metadataCompleteness / needBackfill。
- `collection-next-action.ts` 入参：platform / needBackfill / queued / coverageScore / metadataCompleteness。
- 已有 53 项 TDD 测试通过（见 progress.md），Node 原生测试 + `.mjs` + `--experimental-strip-types` 工作流可用。
- `.mjs` 测试导入生产 `.ts` 时需显式带 `.ts` 扩展名，生产 `.ts` 之间保持 extensionless。

## 阶段 1 子块拆解
1.1 统计输入构造层 + report 统计 bug 修复
1.2 research-trace 溯源层
1.3 research-credibility 汇总层 + copy 文案层
1.4 collect/p0/analyze/report 接入 credibility
1.5 页面挂载冷启动回拉
1.6 文档同步

---
*每完成一个子块后更新此文件*
