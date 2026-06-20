# OutEye Pulse 项目全面技术分析报告

## 一、项目概述

**项目名称**: OutEye 4.0 · Pulse 记忆工坊
**技术栈**: Next.js 16 (App Router) + React + TypeScript + Supabase + Zustand + ECharts + Tailwind CSS
**核心功能**: 多平台社交媒体评论采集与AI六维度分析的文化记忆研究系统
**研究主题**: 郭永怀数字记忆传播监测

---

## 二、页面功能清单

### 1. `/p0` — 本地数据采集与导入中心 (p0/page.tsx, 1416行)
**功能**: 系统的"入口控制台"，集成了环境检测、数据采集、导入、分析等核心操作
**实现细节**:
- **环境检测**: 检测Python、Playwright、MediaCrawler是否就绪
- **采集运行管理**: 显示所有collection_runs，支持取消、重试、复制运行命令
- **Agent任务管理**: 通过task_queue表创建和管理采集任务
- **CSV文件导入**: 扫描本地文件，预览并导入评论数据
- **书签脚本(Bookmarklet)**: 生成Console脚本供浏览器端采集B站/小红书评论
- **AI分析触发**: 支持项目级或单作品级分析，轮询进度
- **演示数据加载**: 可一键生成"郭永怀"主题的模拟数据

### 2. `/dashboard` — 数据驾驶舱 (dashboard/page.tsx, 855行)
**功能**: 宏观数据可视化看板，一屏掌握传播态势
**可视化图表**:
- **KPI卡片**: 总笔记数、总评论数、高危风险、AIGC占比、采样评论、叙事类型数
- **Russell情感环状散点图**: X轴=情感效价(-1~1)，Y轴=情感唤醒(0~1)，颜色=风险等级
- **六维态度雷达图**: 分AIGC组和人工组对比（ELM+阿斯曼+叙事传输）
- **叙事类型旭日图**: 基于Labov叙事结构理论，支持点击筛选
- **伦理风险热力图**: 叙事类型×风险等级交叉矩阵
- **作品概览卡片**: 每个作品的评论数、平均情感效价、播放量
- **作品对比分组柱状图**: 多作品的六维度均值对比
- **图表联动**: 旭日图和热力图点击可联动筛选其他图表
- **筛选条件**: 平台、时间范围(7d/30d/90d)、内容类型(AIGC/人工)、风险等级、叙事类型
- **CSV导出**: 导出筛选后的评论数据

### 3. `/collect` — 数据采集工作台 (collect/page.tsx, 1344行)
**功能**: 核心数据采集入口，支持精准采集和关键词检索两种模式
**精准采集模式**:
- 输入B站视频链接，自动提取BV号
- 调用`collectBilibiliComments()`进行完整采集
- 采集完成后自动触发AI分析
**关键词检索模式**:
- 支持B站搜索(通过WBI签名API)和小红书搜索(通过MCP服务或VPS)
- 搜索结果展示播放量、评论数、点赞数等统计
- 支持单个采集和批量采集
- 搜索结果自动保存到search_tasks和search_results表
- 创建collection_runs记录

### 4. `/works` — 作品管理 (works/page.tsx)
**功能**: 管理所有采集的作品，支持筛选和排序

### 5. `/analyze` — 评论分析 (analyze/page.tsx)
**功能**: 逐作品的评论分析视图

### 6. `/research` — 研究主页 (research/page.tsx, 839行)
**功能**: 研究分析的主入口，展示核心发现和洞察
**可视化**:
- 叙事类型饼图
- Russell情感散点图（按叙事类型着色）
- 六维雷达图（整体平均）
- 平台对比分组柱状图（B站 vs 小红书）
- 风险等级环形图
- 点赞数直方图
- **快速采集栏**: 可直接在页面内输入B站链接采集
- **智能洞察卡片**: 自动识别主导叙事、平台差异、风险预警、AIGC对比等

### 7. `/anatomy` — 单条内容解剖室 (anatomy/page.tsx, 470行)
**功能**: 微观级内容深度分析，逐条笔记的可视化体检报告
**实现**:
- 左侧：作品卡片 + 评论列表（支持情感/风险/叙事筛选、搜索、排序）
- 右侧：选中评论的AI分析面板
  - 六维雷达图
  - 叙事类型 + Labov权重柱状图
  - 伦理风险进度条
  - AI分析依据（evidence_keywords）
  - 证据词高亮的原文
  - 人工修正滑块（d1/d3/d5维度）

### 8. `/ethics` — 伦理哨兵中心 (ethics/page.tsx, 261行)
**功能**: 风险监测、高危内容标记、伦理审查
**实现**:
- 风险等级分布饼图
- 高危评论列表（支持确认/忽略/降级操作）
- AI判定依据展示（evidence_keywords）
- 批量操作支持
- 伦理审查报告生成

### 9. `/genealogy` — 叙事谱系图谱 (genealogy/page.tsx, 218行)
**功能**: 中观层面的叙事类型分布与演化分析
**可视化**:
- 叙事类型旭日图（内环=平台，外环=叙事类型）
- 平台-叙事交叉矩阵热力图
- 叙事类型分布柱状图

### 10. `/identity-lab` — 认同效果实验室 (identity-lab/page.tsx, 360行)
**功能**: AIGC vs 人工内容的认同效果对比实验，含统计显著性检验
**实现**:
- 分组信息（AIGC组 n=? / 人工组 n=?）
- 六维雷达图对比（标注显著性标记 */**/***)
- 统计检验面板（每个维度的t值、p值、Cohen's d）
- 核心假设检验（H1/H2/H3）
- 认同层级漏斗图（无认同→个体钦佩→职业认同→地域认同→民族认同→国家使命认同）
- 检验报告导出

### 11. `/brief` — 智能简报工坊 (brief/page.tsx, 230行)
**功能**: 一键生成结构化研究报告，直接服务论文写作
**实现**:
- 报告类型选择：论文数据包/周报/月报/事件响应
- 分析维度选择：D1~D6 + 叙事类型 + 伦理风险
- 生成Markdown格式报告（含六维态度分析、叙事类型分布、伦理风险分析、统计检验结果）
- 导出选项：Markdown/PDF/Word/统计检验原始数据

### 12. `/report` — 报告生成 (report/page.tsx)
**功能**: 生成和预览分析报告

### 13. `/settings` — 系统设置 (settings/page.tsx)
**功能**: 系统配置管理

---

## 三、API接口详解

### 1. `POST /api/analysis` — AI分析接口
**请求格式**:
- Start模式: `{ projectId?, postId?, commentIds? }`
- Batch模式: `{ logId, projectId }`

**响应格式**:
- Start: `{ success, logId, total }`
- Batch: `{ success, done, batchProcessed, batchFailed, processed, failed, total, progress, tokens }`

**核心逻辑**:
1. 清理上次中断的processing状态
2. 查询待分析评论（按likes降序排列）
3. 创建analysis_logs记录
4. 批量调用MiMo API进行分析
5. 支持去重（相同文本只分析一次）
6. 支持视频字幕上下文增强分析

### 2. `POST /api/collect/bilibili` — B站视频初始化
**请求**: `{ bvid?, url?, project_id? }`
**响应**: `{ success, postId, aid, bvid, sourceUrl, project_id, video_title, video_stats, has_subtitle }`

### 3. `GET /api/bilibili/replies` — B站评论分页
**参数**: `aid, mode, pn` (pn-based分页)

### 4. `POST /api/collect/bilibili/import` — B站评论批量导入
**请求**: `{ postId, projectId, sourceUrl, comments: [{text, likes, username, createTime, rpid}] }`

### 5. `POST /api/collect/bilibili-search` — B站关键词搜索
**请求**: `{ keyword, page, pageSize, pubtimeBegin?, pubtimeEnd? }`

### 6. `POST /api/collect/xhs-mcp` — 小红书MCP搜索
**请求**: `{ action: 'search'|'detail', keyword?, feed_id?, xsec_token? }`
**依赖**: xiaohongshu-mcp服务 (http://localhost:18060/mcp)

### 7. `POST /api/collect/xhs-search` — 小红书搜索
**请求**: `{ keyword, page, pageSize, timeRange, dateFrom?, dateTo? }`

---

## 四、AI分析实现详解

### System Prompt (六维度编码框架)
```
你是一位文化记忆研究领域的量化分析专家。请严格遵循以下学术框架对评论进行编码分析。

【理论框架与维度定义】
1. 精细加工可能性模型(ELM)：评估受众对郭永怀信息的认知加工深度(D1)
2. Russell情感环状模型：测量情感效价(D2_valence)与唤醒度(D2_arousal)
3. 阿斯曼文化记忆理论：评估从个体记忆到集体记忆的认同层级(D3)
4. 行为意向阶梯：测量从认知到行动的转化(D4)
5. 叙事传输理论：评估受众被叙事卷入的程度(D5)
6. 媒介伦理框架：识别历史虚无主义与消费主义风险(D6)
```

### 评分标准
| 维度 | 量表 | 范围 | 理论依据 |
|------|------|------|----------|
| D1 认知加工深度 | 连续 | 1-10 | ELM精细加工可能性模型 |
| D2_valence 情感效价 | 连续 | -1~1 | Russell情感环状模型 |
| D2_arousal 情感唤醒 | 连续 | 0-1 | Russell情感环状模型 |
| D3 认同层级 | 离散 | 1-6 | 阿斯曼文化记忆理论 |
| D4 行为意向 | 离散 | 1-5 | 行为意向阶梯 |
| D5 叙事卷入 | 连续 | 1-10 | 叙事传输理论 |
| D6 伦理风险 | 连续 | 0-1 | 媒介伦理框架 |

### D3认同层级详细定义
1 = 无认同
2 = 个体钦佩
3 = 职业认同
4 = 地域认同
5 = 民族认同
6 = 国家使命认同

### 输出格式
```json
[{
  "d1": 8.5,
  "d2_valence": 0.8,
  "d2_arousal": 0.7,
  "d3": 5,
  "d4": 3,
  "d5": 7.2,
  "d6": 0,
  "narrative_type": "T2",
  "labov_weights": [0.1, 0.2, 0.3, 0.2, 0.1, 0.1],
  "risk_level": "safe",
  "evidence_keywords": [{"word": "民族脊梁", "weight": 0.25, "dimension": "d3"}]
}]
```

### 叙事类型 (Labov叙事结构理论)
- T1: 简报叙事
- T2: 传记叙事
- T3: 道德叙事
- T4: 情感叙事
- T5: 行动叙事
- T6: 反思叙事

### 风险等级
- safe: 安全
- low: 低危
- medium: 中危
- high: 高危

### 验证规则 (validateAnalysis)
- d1: clamp(1, 10, fallback=5)
- d2_valence: clamp(-1, 1, fallback=0)
- d2_arousal: clamp(0, 1, fallback=0.5)
- d3: clamp(1, 6, fallback=3)
- d4: clamp(1, 5, fallback=3)
- d5: clamp(1, 10, fallback=5)
- d6: clamp(0, 1, fallback=0)

### AI模型配置
- 模型: mimo-v2.5-pro
- API: Anthropic兼容格式
- 批次大小: 10条/批
- 去重策略: 相同文本只分析一次，结果应用到所有相同文本的评论
- 视频上下文增强: 获取视频标题和字幕内容作为分析背景

---

## 五、B站采集技术细节

### WBI签名算法 (bilibili-wbi.ts)
1. **获取WBI密钥**: 调用`https://api.bilibili.com/x/web-interface/nav`获取img_url和sub_url
2. **MIXIN_KEY_ENC_TAB**: 64位置换表，用于混淆密钥
3. **签名流程**:
   - 合并imgKey+subKey，按MIXIN_KEY_ENC_TAB置换，取前32位作为salt
   - 参数按key排序，过滤特殊字符
   - 生成wts(当前时间戳)
   - 计算w_rid = MD5(queryString + salt)

### 评论采集流程 (collect-bilibili.ts)
1. **Phase 1 - Init**: 调用`/api/collect/bilibili`获取视频信息、创建post记录、提取字幕
2. **Phase 2a - 热门评论**: mode=3，仅第一页
3. **Phase 2b - 时间排序评论**: mode=2，pn-based分页，每页20条，最多300页
   - 随机延迟600-1400ms防风控
   - 连续2页空数据则结束
   - 单个请求失败最多重试3次
4. **Phase 3 - 子评论**: 对点赞最高的30条热门评论获取回复，并发限制5
5. **Phase 4 - 导入**: 分批500条导入数据库

### API端点
- 视频信息: `https://api.bilibili.com/x/web-interface/view?bvid=xxx`
- 评论列表: `https://api.bilibili.com/x/v2/reply/main?type=1&oid={aid}&mode={mode}&pagination_str={ps}`
- 子评论: `https://api.bilibili.com/x/v2/reply/reply?type=1&oid={aid}&root={rpid}&ps=20&pn=1`
- 字幕列表: `https://api.bilibili.com/x/player/v2?bvid={bvid}&cid={cid}`
- 搜索API: `https://api.bilibili.com/x/web-interface/wbi/search/type`

---

## 六、小红书采集技术细节

### 采集方式
1. **MCP服务**: 通过xiaohongshu-mcp服务（http://localhost:18060/mcp）
   - 支持search_feeds和get_feed_detail两个tool
   - 标准MCP协议: `{ method: 'tools/call', params: { name, arguments } }`
2. **VPS采集器**: scripts/vps-collector/xhs-collector.js
   - 使用Playwright浏览器自动化
   - Cookie管理器处理登录状态
   - API拦截方式获取数据（不依赖DOM选择器）
   - 降级到DOM提取作为备用方案

### 采集流程
1. 通过API搜索获取笔记列表
2. 创建agent task（task_queue表）
3. VPS端Playwright脚本领取任务
4. 浏览器自动化打开笔记页面
5. 拦截API响应获取评论数据
6. 数据通过API回传到系统

---

## 七、数据库Schema

### 核心表
1. **projects**: 项目表（id, name, keyword, description, status, sampling_config）
2. **posts**: 作品表（id, project_id, platform, title, content, url, is_aigc, aigc_type, view_count, likes, comments_count）
3. **comments**: 评论表（id, post_id, project_id, text, likes, sampling_tier, is_sampled, analysis, analysis_status, rpid）
4. **analysis_logs**: 分析日志表（id, project_id, status, total_comments, processed_comments, failed_comments, progress_percent, token_consumed）
5. **raw_comments**: 原始评论表（bookletlet采集的临时存储）
6. **collection_runs**: 采集运行记录表（id, project_id, platform, source, mode, status, current_stage, received_count, imported_count）
7. **collection_run_events**: 采集运行事件表
8. **search_tasks**: 搜索任务表
9. **search_results**: 搜索结果表
10. **task_queue**: Agent任务队列表
11. **local_logs**: 本地日志表

### Comments表关键字段
- `analysis`: JSONB类型，存储六维分析结果
- `analysis_status`: pending/processing/completed/failed
- `sampling_tier`: high/mid/low（基于点赞数分层）
- `is_sampled`: 是否被采样
- `human_corrected`: 人工修正标记
- `content_hash`: 内容去重哈希

---

## 八、状态管理

### useAppStore (Zustand)
```typescript
interface AppState {
  currentProject: Project | null;
  projects: Project[];
  posts: Post[];
  comments: Comment[];
  filters: {
    platform: 'all' | 'xhs' | 'bilibili';
    timeRange: '7d' | '30d' | '90d' | 'all';
    contentType: 'all' | 'aigc' | 'human';
    sentiment: 'all' | 'positive' | 'negative' | 'neutral';
    narrativeTypes: string[];
    riskLevel: string;
  };
  selectedPostId: string | null;
  selectedCommentId: string | null;
  analysisProgress: { processed: number; total: number; status: string } | null;
}
```

### useChartStore (Zustand)
```typescript
interface ChartState {
  hoveredCommentId: string | null;
  selectedNarrativeType: string | null;
  selectedRiskLevel: string | null;
  selectedPlatform: string | null;
}
```

---

## 九、统计检验实现

### Welch's t-test (statistics.ts)
- **适用场景**: AIGC组 vs 人工组的独立样本比较
- **实现**: 纯JavaScript实现，不依赖统计库
- **关键算法**:
  - Welch-Satterthwaite自由度校正
  - 正则化不完全Beta函数近似p值
  - Cohen's d效应量计算
- **显著性标准**: *** (p<0.001), ** (p<0.01), * (p<0.05), ? (p<0.10), ns (不显著)

### Mann-Whitney U检验
- **适用场景**: 非参数检验，不假设正态分布
- **实现**: 秩和检验 + 正态近似p值

### 预设假设
- H1: AIGC内容在D3(认同层级)上显著低于人工内容
- H2: AIGC内容在D2_arousal(情感唤醒)上显著高于人工内容
- H3: AIGC内容在D5(叙事卷入)上显著低于人工内容

---

## 十、演示数据

### 生成逻辑 (demo-data.ts)
- **主题**: 郭永怀数字记忆监测
- **规模**: 20个作品（15小红书 + 5 B站），每作品80-200条评论
- **AIGC标记**: 约60%为AIGC内容
- **分析数据**: 预生成六维分析结果，AIGC组在D3和D5上低于人工组
- **评论模板**: 30条预设的郭永怀相关评论

---

## 十一、导出功能 (export.ts)

支持的导出格式：
1. **CSV**: 评论原文、六维评分、叙事类型、风险等级
2. **JSON**: 完整数据结构
3. **Word**: 结构化报告
4. **Excel**: 分表统计数据

---

## 十二、关键技术特性

1. **去重策略**: content_hash + rpid双重去重
2. **采样策略**: 按点赞数分层采样（high≥100, mid≥10, low<10）
3. **错误恢复**: analysis_status状态机(pending→processing→completed/failed)
4. **轮询更新**: 3秒间隔轮询分析进度
5. **图表联动**: 旭日图/热力图点击联动筛选
6. **暗色主题**: 统一的暗色UI设计系统
7. **响应式布局**: 适配不同屏幕尺寸
8. **SSR安全**: ECharts动态导入避免SSR问题

---

## 十三、文件统计

- TypeScript文件: ~50个
- TSX组件文件: ~33个
- SQL迁移文件: ~14个
- 核心页面: 13个
- API路由: ~10个
- 库模块: ~15个
