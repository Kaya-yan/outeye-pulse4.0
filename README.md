# OutEye Pulse

文化记忆研究的多平台评论采集与 AI 智能分析系统。支持从哔哩哔哩（Bilibili）和小红书（XHS）批量采集评论，通过 DeepSeek AI 进行六维度量化编码分析，生成可正式引用的研究报告。

## 核心能力

- **采集**：B站直采、XHS 深采、书签补录、关键词搜索四条入口，统一纳入 `collection_runs` 运行追踪
- **运行中心**：P0 页面提供 run 监控、取消、重试、命令生成、stall 检测
- **AI 分析**：DeepSeek（deepseek-chat，OpenAI 兼容协议）六维编码（ELM / Russell / 阿斯曼 / TPB / 叙事传输 / 媒介伦理）
- **研究可信度**：跨链路 credibility profile，统一"算得对 + 说得清 + 查得到来源"
- **报告导出**：Word / Excel / CSV，与页面展示口径一致

## 快速开始

```bash
npm install
npm run dev
```

打开 [http://localhost:3000](http://localhost:3000)

## 环境变量（`.env.local`）

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
DEEPSEEK_API_KEY=your-deepseek-api-key
# 可选
DEEPSEEK_API_URL=https://api.deepseek.com/v1/chat/completions
XHS_MCP_URL=http://localhost:18060/mcp
VPS_COLLECTOR_URL=your-vps-collector-url
```

## 项目结构

- `src/app/collect` — 采集台（研究任务前台）
- `src/app/p0` — 运行中心（恢复后台）
- `src/app/analyze` — 分析台（可信解释层）
- `src/app/report` — 报告（正式输出层）
- `src/lib/research-*.ts` — 研究可信度体系
- `src/lib/collection-*.ts` — 采集运行体系
- `supabase/migrations/` — 数据库迁移

## 测试

```bash
node --experimental-strip-types --test src/lib/*.test.mjs
```

当前 74 项 TDD 测试全部通过。

## 文档

- [项目现状报告](PROJECT_STATUS.md)
- [可信度优先升级设计](docs/superpowers/specs/2026-06-21-credibility-first-upgrade-design.md)
- [采集运维统一设计](docs/superpowers/specs/2026-06-17-collection-ops-unification-design.md)
- [采集能力增强设计](docs/superpowers/specs/2026-06-17-collection-capability-enhancement-design.md)
