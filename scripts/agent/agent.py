#!/usr/bin/env python3
"""
OutEye Local Agent — Cloud Orchestration + Local Execution

Polls Supabase task queue for pending collection tasks, dispatches to
platform-specific scrapers (B站 curl_cffi, 小红书 Playwright), and posts
results back to cloud for import.

Usage:
    python agent.py                      # Start polling loop
    python agent.py --once               # Process one task then exit
    python agent.py --poll-interval=30   # Custom poll interval (seconds)

Environment:
    NEXT_PUBLIC_SUPABASE_URL       — Supabase project URL
    SUPABASE_SERVICE_ROLE_KEY      — Supabase service role key (preferred)
    NEXT_PUBLIC_SUPABASE_ANON_KEY  — Fallback if service key not set
    OUTEYE_API_URL                 — API base URL (default: http://localhost:3000)
"""

import argparse
import csv
import json
import os
import re
import signal
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

try:
    from supabase import create_client, Client
except ImportError:
    print("❌ 缺少 supabase 依赖，请运行: pip install -r requirements.txt")
    sys.exit(1)

try:
    from curl_cffi import requests as cffi_requests
except ImportError:
    cffi_requests = None

SCRIPT_DIR = Path(__file__).resolve().parent
BILIBILI_SCRAPER = SCRIPT_DIR / "scrape_bilibili.py"
XHS_SCRAPER = SCRIPT_DIR.parent / "playwright-scraper" / "scrape-xhs.mjs"
OUTPUT_DIR = SCRIPT_DIR / "output"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

AGENT_ID = f"local-agent-{os.getpid()}"

running = True


def handle_signal(signum, frame):
    global running
    print(f"\n⚠️  收到信号 {signum}，正在停止...")
    running = False


signal.signal(signal.SIGINT, handle_signal)
signal.signal(signal.SIGTERM, handle_signal)


def get_supabase() -> Client:
    url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY", "")
    if not url or not key:
        print("❌ 缺少 Supabase 环境变量")
        print("   需要: NEXT_PUBLIC_SUPABASE_URL 和 SUPABASE_SERVICE_ROLE_KEY")
        sys.exit(1)
    return create_client(url, key)


def get_api_url() -> str:
    return os.environ.get("OUTEYE_API_URL", "http://localhost:3000")


def claim_next_task(supabase: Client) -> dict | None:
    try:
        result = supabase.rpc("claim_next_task", {"agent_id": AGENT_ID}).execute()
        if result.data:
            task = result.data[0] if isinstance(result.data, list) else result.data
            if task and task.get("id"):
                return task
    except Exception as e:
        print(f"  ⚠️ 轮询失败: {e}")
    return None


def update_task_status(supabase: Client, task_id: str, status: str, error: str = ""):
    try:
        if status == "completed":
            supabase.rpc("complete_task", {"task_uuid": task_id}).execute()
        elif status == "failed":
            supabase.rpc("fail_task", {"task_uuid": task_id, "error_msg": error or "unknown"}).execute()
        elif status == "running":
            supabase.table("task_queue").update({
                "status": "running",
                "started_at": datetime.now(timezone.utc).isoformat(),
            }).eq("id", task_id).execute()
        else:
            print(f"  ⚠️ 未知状态: {status}")
    except Exception as e:
        print(f"  ⚠️ 更新任务状态失败: {e}")


def post_data_to_api(task_id: str, platform: str, raw_data: list[dict], source_file: str = "") -> bool:
    """POST collected data to the cloud API endpoint for auto-import."""
    api_url = get_api_url()
    url = f"{api_url}/api/agent/data"

    if cffi_requests:
        try:
            resp = cffi_requests.post(
                url,
                json={
                    "task_id": task_id,
                    "platform": platform,
                    "raw_data": raw_data,
                    "source_file": source_file or None,
                },
                impersonate="chrome131",
                timeout=30,
            )
            result = resp.json()
            if result.get("success"):
                print(f"  ✅ API 导入: {result.get('imported', 0)} 条, 重复 {result.get('duplicates', 0)} 条")
                return True
            else:
                print(f"  ⚠️ API 返回错误: {result.get('error', 'unknown')}")
                return False
        except Exception as e:
            print(f"  ⚠️ API 调用失败: {e}")
            return False
    else:
        # Fallback: use urllib
        import urllib.request
        try:
            req = urllib.request.Request(
                url,
                data=json.dumps({
                    "task_id": task_id,
                    "platform": platform,
                    "raw_data": raw_data,
                    "source_file": source_file or None,
                }).encode(),
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=30) as resp:
                result = json.loads(resp.read())
                if result.get("success"):
                    print(f"  ✅ API 导入: {result.get('imported', 0)} 条, 重复 {result.get('duplicates', 0)} 条")
                    return True
                else:
                    print(f"  ⚠️ API 返回错误: {result.get('error', 'unknown')}")
                    return False
        except Exception as e:
            print(f"  ⚠️ API 调用失败: {e}")
            return False


def extract_bvid(url: str) -> str | None:
    m = re.search(r"(BV\w{10})", url)
    return m.group(1) if m else None


def extract_xhs_id(url: str) -> str | None:
    m = re.search(r"/explore/(\w+)", url) or re.search(r"/discovery/item/(\w+)", url)
    return m.group(1) if m else None


PLATFORM_CONFIG = {
    "bilibili": {
        "extract_id": extract_bvid,
        "scraper": BILIBILI_SCRAPER,
        "cmd_prefix": [sys.executable],
        "glob_pattern": "bilibili_*.csv",
        "id_flag": "--bvid",
    },
    "xhs": {
        "extract_id": extract_xhs_id,
        "scraper": XHS_SCRAPER,
        "cmd_prefix": ["node"],
        "glob_pattern": "xhs_*.csv",
        "id_flag": "--url",
    },
}


def run_scraper(task: dict) -> tuple[list[dict], str]:
    """Run platform-specific scraper, return (comments, csv_path)."""
    platform = task["platform"]
    config = PLATFORM_CONFIG.get(platform)
    if not config:
        raise ValueError(f"不支持的平台: {platform}")

    target_url = task["target_url"]
    note_id = config["extract_id"](target_url)
    if not note_id:
        raise ValueError(f"无法从 URL 提取 ID: {target_url}")

    max_comments = task.get("max_comments", 2000)

    if platform == "bilibili":
        cmd = [*config["cmd_prefix"], str(config["scraper"]), f"{config['id_flag']}={note_id}", f"--max-comments={max_comments}", f"--output={OUTPUT_DIR}"]
    elif platform == "xhs":
        if not XHS_SCRAPER.exists():
            raise RuntimeError("未安装 Node.js 或小红书采集器不存在")
        cmd = [*config["cmd_prefix"], str(config["scraper"]), f"{config['id_flag']}={target_url}", f"--max-comments={max_comments}", f"--output={OUTPUT_DIR}"]
    else:
        raise ValueError(f"不支持的平台: {platform}")

    print(f"  启动 {platform} 采集器: id={note_id}, max={max_comments}")
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=600)

    if result.returncode != 0:
        raise RuntimeError(f"{platform} 采集器退出码 {result.returncode}: {result.stderr[:500]}")

    csv_files = sorted(OUTPUT_DIR.glob(config["glob_pattern"]), key=lambda f: f.stat().st_mtime, reverse=True)
    if not csv_files:
        raise RuntimeError("采集器未生成 CSV 文件")

    csv_path = csv_files[0]
    comments = parse_csv(str(csv_path))
    return comments, str(csv_path)


def parse_csv(csv_path: str) -> list[dict]:
    rows = []
    with open(csv_path, "r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            text = row.get("text", "").strip()
            if text and len(text) >= 2:
                rows.append({
                    "text": text,
                    "likes": int(row.get("likes", 0) or 0),
                    "create_time": row.get("create_time", ""),
                    "username": row.get("username", ""),
                    "platform": row.get("platform", ""),
                    "source_id": row.get("source_id", ""),
                    "source_url": row.get("source_url", ""),
                })
    return rows


def process_task(supabase: Client, task: dict) -> bool:
    task_id = task["id"]
    platform = task["platform"]
    target_url = task["target_url"]

    print(f"\n{'=' * 50}")
    print(f"处理任务: {task_id[:8]}...")
    print(f"  平台: {platform}")
    print(f"  目标: {target_url}")
    print(f"  类型: {task.get('task_type', 'comments')}")

    update_task_status(supabase, task_id, "running")

    try:
        comments, csv_path = run_scraper(task)

        if not comments:
            print(f"  ⚠️ 未采集到数据")
            update_task_status(supabase, task_id, "completed")
            return True

        print(f"  ✅ 采集到 {len(comments)} 条数据")

        # POST to cloud API for auto-import
        print(f"  提交到云端...")
        posted = post_data_to_api(task_id, platform, comments, csv_path)

        if not posted:
            # Fallback: store directly in agent_data for later import
            print(f"  回退: 直接写入 agent_data 表...")
            supabase.table("agent_data").insert({
                "task_id": task_id,
                "platform": platform,
                "data_type": "comments",
                "raw_data": comments,
                "count": len(comments),
                "source_file": csv_path or None,
                "status": "pending",
            }).execute()

        update_task_status(supabase, task_id, "completed")
        print(f"  ✅ 任务完成")
        return True

    except Exception as e:
        error_msg = str(e)[:500]
        print(f"  ❌ 任务失败: {error_msg}")
        update_task_status(supabase, task_id, "failed", error_msg)
        return False


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="OutEye Local Agent")
    parser.add_argument("--once", action="store_true", help="处理一个任务后退出")
    parser.add_argument("--poll-interval", type=int, default=30, help="轮询间隔（秒）")
    parser.add_argument("--max-idle", type=int, default=300, help="无任务时最大空闲轮询次数（之后退出）")
    return parser.parse_args()


def main():
    args = parse_args()

    print("\n=== OutEye Local Agent ===")
    print(f"Agent ID: {AGENT_ID}")
    print(f"轮询间隔: {args.poll_interval}秒")
    print(f"模式: {'单次' if args.once else '持续轮询'}\n")

    supabase = get_supabase()
    idle_count = 0

    while running:
        task = claim_next_task(supabase)

        if task:
            idle_count = 0
            process_task(supabase, task)

            if args.once:
                print("\n单次模式，退出。")
                break
        else:
            idle_count += 1
            if args.once:
                print("无待处理任务，退出。")
                break

            if idle_count >= args.max_idle:
                print(f"\n连续 {args.max_idle} 次无任务，退出。")
                break

            if idle_count <= 3 or idle_count % 10 == 0:
                print(f"  [{datetime.now().strftime('%H:%M:%S')}] 等待任务... (空闲 {idle_count})")

        for _ in range(args.poll_interval):
            if not running:
                break
            time.sleep(1)

    print("\nAgent 已停止。")


if __name__ == "__main__":
    main()
