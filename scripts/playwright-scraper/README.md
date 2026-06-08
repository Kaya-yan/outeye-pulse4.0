# OutEye Playwright B站评论深度采集器

B站评论区使用 closed Shadow DOM，无法通过浏览器 JS 直接提取评论。本脚本通过 **B站 API + Playwright** 绕过限制，实现全量采集。

## 原理

1. Playwright 启动真实 Chrome（携带用户 Cookie）
2. 通过 `page.request` 直接调用 B站 API（`/x/v2/reply/main`）
3. 自动翻页采集全部评论（热门 + 时间排序双模式）
4. 支持子评论采集（热门评论的回复）
5. 去重后写入 Supabase `comments` 表

## 安装

```bash
cd scripts/playwright-scraper
npm install
npx playwright install chromium
```

## 使用

```bash
# 基本用法（有头模式，方便调试）
node scrape-bilibili.mjs --bvid=BV19fGb6BEpz --post-id=<uuid> --project-id=<uuid>

# 无头模式
node scrape-bilibili.mjs --bvid=BV19fGb6BEpz --post-id=<uuid> --project-id=<uuid> --headless

# 自定义滚动上限
node scrape-bilibili.mjs --bvid=BV19fGb6BEpz --post-id=<uuid> --project-id=<uuid> --max-scroll=100
```

## 参数

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `--bvid=<string>` | B站视频BV号 | 必填 |
| `--post-id=<uuid>` | 目标帖子ID | 必填 |
| `--project-id=<uuid>` | 目标项目ID | 必填 |
| `--max-scroll=<n>` | 最大翻页数 | 50 |
| `--max-comments=<n>` | 最大评论数 | 2000 |
| `--headless` | 无头模式 | 有头模式 |

## 环境变量

```bash
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sb_secret_xxx  # 推荐，跳过RLS
SUPABASE_ANON_KEY=sb_publishable_xxx     # 备选
```

## 采集策略

1. **阶段A**：热门模式（mode=3），获取前 20 条热评
2. **阶段B**：时间模式（mode=2），翻页采集全部评论
3. **子评论**：自动获取热门评论的回复（rcount > 0 的评论）
4. **反爬**：每页间隔 2-5 秒随机延迟
5. **限流检测**：遇到 412/429 自动停止

## 与 API 采集的区别

| 特性 | P0 页面 API 采集 | Playwright 脚本 |
|------|-------------------|-----------------|
| 评论数量 | ~20 条（热评第1页） | 全部（可数千条） |
| 子评论 | 不支持 | 支持 |
| Shadow DOM | 受限 | 绕过（API 直连） |
| 限流风险 | 高（浏览器 API） | 低（随机延迟） |
| 运行环境 | 浏览器 | Node.js 命令行 |

## 常见问题

**Q: 为什么不用 DOM 提取？**
A: B站评论区使用 closed Shadow DOM，`document.querySelector` 无法穿透。Playwright 的 locator API 可以穿透 open shadow DOM，但 B站的 closed shadow DOM 仍然阻挡。API 直连是最可靠的方案。

**Q: Cookie 从哪来？**
A: Playwright 启动的 Chrome 使用系统已登录的 Cookie。如果需要未登录状态采集，Cookie 为空也可以（仅影响部分高级功能）。

**Q: 遇到 412 限流怎么办？**
A: 等待 30-60 分钟后重试。脚本会自动检测限流并停止，已采集的数据不会丢失。
