# 任务计划：可信度优先升级实施

## 目标
按 `docs/superpowers/specs/2026-06-21-credibility-first-upgrade-design.md` 完成第一阶段（可信度全链路升级），并在每阶段自检通过后自主进入下一阶段，全部完成后向用户汇报。

## 当前阶段
阶段 1 子块 1.1：统计输入构造层 + report 统计 bug 修复

## 各阶段

### 阶段 1.1：统计输入构造层 + report bug 修复
- [ ] 新增 `src/lib/research-statistics-input.ts`，区分 null/0/filtered
- [ ] 新增 `src/lib/research-statistics-input.test.mjs`
- [ ] 修复 `src/app/report/page.tsx:38-39` 调用方式
- [ ] 自检：tsc + 测试通过
- **状态：** in_progress

### 阶段 1.2：research-trace 溯源层
- [ ] 新增 `src/lib/research-trace.ts`
- [ ] 新增 `src/lib/research-trace.test.mjs`
- [ ] 自检：tsc + 测试通过
- **状态：** pending

### 阶段 1.3：research-credibility 汇总层 + copy 文案
- [ ] 新增 `src/lib/research-credibility-copy.ts`
- [ ] 新增 `src/lib/research-credibility.ts`（消费 quality / next-action / trace / statistics-input）
- [ ] 新增对应 `.test.mjs`
- [ ] 自检：tsc + 测试通过
- **状态：** pending

### 阶段 1.4：四个页面接入 credibility
- [ ] collect 消费可信度预判
- [ ] p0 消费运行对可信度的影响
- [ ] analyze 消费结论边界
- [ ] report 消费正式引用说明
- [ ] 自检：tsc + 测试 + 页面 smoke
- **状态：** pending

### 阶段 1.5：页面挂载冷启动回拉
- [ ] works/report/analyze 挂载时 store 空则回拉
- [ ] 自检：tsc + 冷启动 smoke
- **状态：** pending

### 阶段 1.6：文档同步
- [ ] README
- [ ] PROJECT_STATUS（MiMo → DeepSeek、测试现状、run 体系）
- [ ] env 说明
- [ ] 自检：文档与代码一致
- **状态：** pending

## 关键问题
1. credibility profile 粒度 = 项目级（spec 6.1 已定）
2. 依赖方向单向：credibility → quality / next-action / trace / statistics-input → statistics.ts
3. store 不动，改页面挂载

## 备注
- 自主推进模式：每阶段自检通过后直接进入下一阶段，不逐阶段问用户
- 全部完成后向用户汇报
