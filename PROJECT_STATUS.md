# OutEye Pulse 项目现状报告

> 更新日期：2026-06-12

---

## 一、项目概述

OutEye Pulse 是一个**文化记忆研究的多平台评论采集与 AI 智能分析系统**，面向学术研究场景，支持从哔哩哔哩（Bilibili）和小红书（XHS）两大平台批量采集评论数据，并通过 AI 模型进行六维度量化编码分析。

### 核心研究框架

| 维度 | 理论基础 | 说明 |
|------|----------|------|
| D1 | 精细加工可能性模型 (ELM) | 认知加工深度 |
| D2 | Russell 情感环状模型 | 情感效价 + 唤醒度 |
| D3 | 阿斯曼文化记忆理论 | 个体→集体记忆认同层级 |
| D4 | 行为意向阶梯 (TPB) | 认知→行动转化 |
| D5 | 叙事传输理论 | 叙事卷入程度 |
| D6 | 媒介伦理框架 | 历史虚无主义/消费主义风险 |

---

## 二、技术栈

| 层级 | 技术 | 版本 |
|------|------|------|
| 框架 | Next.js (App Router) | 16 |
| 语言 | TypeScript | 5 |
| UI | React + Tailwind CSS | 4 |
| 状态管理 | Zustand (persist middleware) | — |
| 数据库 | Supabase (PostgreSQL + PostgREST) | — |
| AI 模型 | MiMo v2.5 Pro (Anthropic 协议) | — |
| 图表 | ECharts | — |
| 部署 | Vercel (推测) | — |

---

## 三、项目结构

```
outeye-pulse/
├── src/
│   ├── app/                    # Next.js App Router 页面
│   │   ├── page.tsx            # 首页/Landing
│   │   ├── layout.tsx          # 全局布局（导航栏 + 侧边栏）
│   │   ├── globals.css         # 全局样式 + CSS 变量
│   │   ├── collect/page.tsx    # 数据采集页（核心）
│   │   ├── analyze/page.tsx    # 数据分析页（核心）
│   │   ├── dashboard/page.tsx  # 数据看板（图表可视化）
│   │   ├── projects/page.tsx   # 项目管理
│   │   ├── settings/page.tsx   # 系统设置
│   │   ├── login/page.tsx      # 登录页
│   │   ├── api/                # API 路由（服务端）
│   │   │   ├── analysis/       # AI 分析接口
│   │   │   ├── collect/        # 数据采集接口
│   │   │   ├── projects/       # 项目 CRUD
│   │   │   ├── comments/       # 评论查询
│   │   │   ├── reports/        # 报告生成
│   │   │   ├── tasks/          # 异步任务管理
│   │   │   └── ...
│   │   └── (dashboard)/        # 嵌套布局组
│   ├── components/
│   │   ├── ui/                 # 通用 UI 组件（Button, Card, Modal 等）
│   │   ├── analysis/           # 分析相关组件（AnalysisProgressBar）
│   │   ├── charts/             # 图表组件
│   │   ├── layout/             # 布局组件（Navbar, Sidebar）
│   │   └── collect/            # 采集相关组件
│   ├── lib/
│   │   ├── supabase.ts         # Supabase 客户端（server + browser）
│   │   ├── analysis-runner.ts  # 客户端分析批处理驱动
│   │   ├── bilibili-wbi.ts     # B站 WBI 签名 + API 封装
│   │   ├── hash.ts             # DJB2 哈希 + 去重 + 采样
│   │   └── utils.ts            # 通用工具函数
│   ├── stores/
│   │   └── useAppStore.ts      # Zustand 全局状态
│   └── types/
│       └── index.ts            # TypeScript 类型定义
├── supabase/
│   ├── schema.sql              # 完整数据库 Schema
│   └── migrations/             # 数据库迁移文件
├── scripts/                    # 工具脚本
├── tools/                      # 辅助工具
├── public/                     # 静态资源
├── CLAUDE.md                   # AI 协作指令
├── AGENTS.md                   # Agent 指引
└── package.json
```

---

## 四、数据库设计

### 核心表

| 表名 | 用途 | 关键字段 |
|------|------|----------|
| `projects` | 研究项目 | id, name, platform, status |
| `posts` | 帖子/视频 | id, project_id, url, title, platform |
| `comments` | 评论数据 | id, post_id, text, likes, analysis (JSONB), analysis_status |
| `analysis_logs` | 分析任务日志 | id, project_id, status, total/processed/failed_comments |
| `reports` | 研究报告 | id, project_id, content |
| `search_tasks` | 搜索任务队列 | id, project_id, status, params |

### 关键设计

- `comments.analysis` 字段为 **JSONB** 类型，存储 AI 六维度编码结果
- `comments.analysis_status` 跟踪分析状态：`pending` → `processing` → `completed` / `failed`
- `comments.content_hash` 用于内容去重（DJB2 哈希）
- 外键均带 `ON DELETE CASCADE`，确保项目删除时级联清理

---

## 五、已实现功能

### 5.1 数据采集

#### Bilibili 采集
- **URL 直接采集**：粘贴视频 URL → 自动抓取热门评论 + 时间序评论
- **关键词搜索**：支持多关键词、自定义时间范围（月份选择器）、结果数量控制
- **WBI 签名**：实现了 B站 WBI 反爬签名算法
- **子评论支持**：自动抓取热门评论的子回复（楼中楼）
- **去重过滤**：基于内容哈希的评论去重
- **广告过滤**：自动识别并过滤广告评论
- **分层采样**：基于点赞数的分层概率采样

#### 小红书采集
- **VPS Playwright 采集**：通过 VPS 远程执行 Playwright 脚本采集
- **任务队列**：异步任务管理，支持状态追踪
- **关键词搜索**：支持自定义时间范围

### 5.2 AI 分析

- **六维度量化编码**：基于学术理论框架的完整编码体系
- **批量处理架构**：客户端驱动的批处理循环（每批 10 条）
  - 避免 Serverless 函数超时
  - 支持进度追踪和断点续传
- **进度可视化**：实时进度条显示（已处理/总数/百分比）
- **错误恢复**：连续 3 次失败自动停止，2 秒重试间隔
- **孤儿状态清理**：分析启动时自动重置卡在 `processing` 状态的评论
- **值域校验**：AI 输出自动钳制到合法范围

### 5.3 数据看板

- **KPI 卡片**：总评论数、平均情感效价、高风险占比等核心指标
- **多维图表**：
  - 情感分布直方图
  - 认知深度分布
  - 叙事类型分布
  - 风险等级分布
  - 维度相关性热力图
- **筛选功能**：按叙事类型、风险等级、时间范围筛选
- **AIGC vs 人类对比**：Welch's t-test 统计检验

### 5.4 项目管理

- 项目 CRUD 操作
- 多平台支持（Bilibili / 小红书）
- 项目状态管理

### 5.5 用户系统

- 登录/登出
- 基础认证（Supabase Auth）

---

## 六、近期修复记录（2026-06-12）

### CRITICAL 修复
1. **分析 API 架构重构**：从同步处理改为客户端驱动的批处理循环，解决 Serverless 超时问题
2. **`logId=running` 500 错误**：移除伪 logId 轮询，简化 AnalysisProgressBar 为纯展示组件
3. **AI 分析未触发**：提取 `triggerAnalysis` 为模块级函数，确保采集后自动启动分析
4. **t-test 过滤逻辑**：修复 `filter(v !== 0)` 误删合法零值的问题

### WARNING 修复
1. **B站搜索恰好 1000 条**：添加 `totalNote` 提示 B站 API 上限
2. **搜索结果不相关**：添加 `filterByRelevance()` 按关键词过滤标题/描述/标签
3. **时间范围不可自定义**：替换预设按钮为月份选择器
4. **Dashboard 筛选未生效**：将 timeRange 筛选应用到 `filteredComments`
5. **Dashboard 硬编码数据**：移除虚假的 KPI 变化百分比
6. **孤儿 processing 状态**：分析启动时自动重置

### 数据库迁移
- 新增迁移文件 `007_fix_missing_columns_indexes_rls.sql`
- 添加 `analysis_status`, `rpid`, `source_tool`, `content_hash`, `source_url` 列
- 补充索引和 RLS 策略

---

## 七、已知问题与待办

### 高优先级
- [ ] **采样配置未生效**：`types/index.ts` 与 `hash.ts` 的 `SamplingConfig` 字段名不一致，且项目级采样配置未实际应用
- [ ] **小红书采集依赖 VPS**：需要手动配置 VPS 地址和凭证
- [ ] **无测试覆盖**：项目没有任何单元测试或集成测试

### 中优先级
- [ ] **报告生成功能**：`reports` 表已建但报告生成逻辑未完善
- [ ] **用户权限管理**：当前无多用户/角色区分
- [ ] **采集任务持久化**：刷新页面后采集状态丢失
- [ ] **错误日志系统**：缺少结构化的错误收集和上报

### 低优先级
- [ ] **导出功能**：支持 CSV/Excel 导出分析结果
- [ ] **批量项目操作**：项目列表的批量删除/归档
- [ ] **暗色主题**：当前仅有亮色主题（CSS 变量已预留）

---

## 八、开发工作计划

### Phase 1：稳定性（当前）
- 修复采样配置不一致问题
- 补充关键路径的错误处理
- 完善数据库迁移的一致性

### Phase 2：功能完善
- 实现报告自动生成
- 添加数据导出功能
- 完善小红书采集流程

### Phase 3：质量保障
- 添加核心模块的单元测试
- API 集成测试
- E2E 测试（Playwright）

### Phase 4：扩展
- 多用户权限管理
- 更多平台支持（抖音、微博等）
- 分析模型优化和自定义

---

## 九、开发环境

```bash
# 安装依赖
npm install

# 开发服务器
npm run dev

# 构建
npm run build

# 环境变量（.env.local）
NEXT_PUBLIC_SUPABASE_URL=xxx
NEXT_PUBLIC_SUPABASE_ANON_KEY=xxx
MIMO_API_KEY=xxx
MIMO_API_URL=https://token-plan-cn.xiaomimimo.com/anthropic/v1/messages
```

### 关键配置
- Supabase 项目需运行 `supabase/schema.sql` 和 `supabase/migrations/` 下的迁移文件
- MiMo API 密钥需单独申请
- B站采集无需登录（WBI 签名在服务端完成）
- 小红书采集需要 VPS 环境部署 Playwright

---

## 十、架构图

```
┌─────────────────────────────────────────────────────┐
│                    Browser (Client)                   │
│  ┌──────────┐  ┌──────────┐  ┌───────────────────┐  │
│  │ Collect   │  │ Analyze  │  │ Dashboard         │  │
│  │ Page      │  │ Page     │  │ Page              │  │
│  └────┬─────┘  └────┬─────┘  └───────────────────┘  │
│       │              │                                │
│       │    ┌─────────┴──────────┐                     │
│       │    │ analysis-runner.ts │                     │
│       │    │ (batch loop driver)│                     │
│       │    └─────────┬──────────┘                     │
│       │              │                                │
│  ┌────┴──────────────┴────────────────────────────┐  │
│  │           Zustand Store (useAppStore)           │  │
│  │    (projects, comments, analysisProgress...)    │  │
│  └────────────────────┬───────────────────────────┘  │
└───────────────────────┼───────────────────────────────┘
                        │ fetch
┌───────────────────────┼───────────────────────────────┐
│              Next.js API Routes (Server)               │
│  ┌────────────┐  ┌────┴───────┐  ┌──────────────┐    │
│  │ /api/       │  │ /api/      │  │ /api/        │    │
│  │ collect/*   │  │ analysis   │  │ projects     │    │
│  └──────┬─────┘  └──────┬─────┘  └──────┬───────┘    │
│         │               │               │             │
│  ┌──────┴───────────────┴───────────────┴──────────┐  │
│  │              Supabase (PostgreSQL)               │  │
│  │  projects | posts | comments | analysis_logs     │  │
│  └─────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────┘
         │                                    │
    ┌────┴────┐                         ┌─────┴─────┐
    │ Bilibili│                         │ MiMo API  │
    │ XHS API │                         │ (AI分析)  │
    └─────────┘                         └───────────┘
```

---

*本报告由 Claude 自动生成，如有疑问请查阅源码或联系项目负责人。*
