#!/usr/bin/env python3
"""
OutEye curl_cffi B站评论采集器

使用 curl_cffi 伪装 Chrome TLS 指纹，直接调用 B站 API 采集评论。
无需浏览器，无需 Playwright，速度更快、资源占用更低。

支持 wbi 签名、Cookie 持久化、二级评论采集、中断安全保存。

Usage:
    python scrape_bilibili.py --bvid=BV19fGb6BEpz
    python scrape_bilibili.py --bvid=BV19fGb6BEpz --max-comments=5000
    python scrape_bilibili.py --login   # 强制登录模式（仍需浏览器）
"""

import argparse
import csv
import hashlib
import json
import os
import random
import re
import signal
import sys
import time
import urllib.parse
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from functools import reduce
from pathlib import Path

from curl_cffi import requests as cffi_requests

SCRIPT_DIR = Path(__file__).resolve().parent
DEFAULT_COOKIES = SCRIPT_DIR / "cookies-bilibili.json"
DEFAULT_OUTPUT = SCRIPT_DIR / "output"

API_BASE = "https://api.bilibili.com"
VIDEO_INFO_API = f"{API_BASE}/x/web-interface/view"
REPLY_MAIN_API = f"{API_BASE}/x/v2/reply/main"
REPLY_SUB_API = f"{API_BASE}/x/v2/reply/reply"
NAV_API = f"{API_BASE}/x/web-interface/nav"

MIXIN_KEY_ENC_TAB = [
    46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35,
    27, 43, 5, 49, 33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13,
    37, 48, 7, 16, 24, 55, 40, 61, 26, 17, 0, 1, 60, 51, 30, 4,
    22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36, 20, 34, 44, 52,
]

FILTER_CHARS = set("!*'();:@&=+$,/?%#[]")
IMPERSONATE = "chrome131"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Referer": "https://www.bilibili.com",
    "Origin": "https://www.bilibili.com",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
}

# Module-level for signal handler access
all_replies_map: dict[int, dict] = {}
current_bvid = ""
current_output_dir: Path = DEFAULT_OUTPUT
interrupt_saved = False


def save_partial_on_interrupt(signum, frame):
    global interrupt_saved
    if interrupt_saved or not all_replies_map:
        return
    interrupt_saved = True
    replies = list(all_replies_map.values())
    print(f"\n\n⚠️  检测到中断，正在保存已采集的 {len(replies)} 条评论...")
    export_csv(replies, current_bvid, current_output_dir, is_partial=True)
    print("部分数据已保存。")
    sys.exit(0)


signal.signal(signal.SIGINT, save_partial_on_interrupt)
signal.signal(signal.SIGTERM, save_partial_on_interrupt)


def get_mixin_key(orig: str) -> str:
    return reduce(lambda s, i: s + orig[i], MIXIN_KEY_ENC_TAB, "")[:32]


def enc_wbi(params: dict, mixin_key: str) -> dict:
    params = {**params}
    params["wts"] = round(time.time())
    params_str = urllib.parse.urlencode(
        sorted(
            (k, "".join(c for c in str(v) if c not in FILTER_CHARS))
            for k, v in params.items()
        )
    )
    params["w_rid"] = hashlib.md5((params_str + mixin_key).encode()).hexdigest()
    return params


def fetch_wbi_keys(session: cffi_requests.Session) -> tuple[str, str]:
    resp = session.get(NAV_API, headers=HEADERS, impersonate=IMPERSONATE)
    data = resp.json()
    if data.get("code") != 0:
        raise RuntimeError(f"nav API error: {data.get('message', 'unknown')}")

    wbi_img = data.get("data", {}).get("wbi_img", {})
    img_url = wbi_img.get("img_url", "")
    sub_url = wbi_img.get("sub_url", "")

    img_key = img_url.rsplit("/", 1)[-1].split(".")[0] if img_url else ""
    sub_key = sub_url.rsplit("/", 1)[-1].split(".")[0] if sub_url else ""

    if not img_key or not sub_key:
        raise RuntimeError("Failed to extract wbi keys from nav response")

    return img_key, sub_key


def load_cookies_playwright(path: Path) -> dict:
    if not path.exists():
        return {}
    try:
        with open(path, "r", encoding="utf-8") as f:
            raw = json.load(f)
    except (json.JSONDecodeError, OSError):
        return {}

    cookies = {}
    for c in raw:
        if "bilibili.com" in c.get("domain", ""):
            cookies[c["name"]] = c["value"]
    return cookies


def has_sessdata(cookies: dict) -> bool:
    val = cookies.get("SESSDATA", "")
    return len(val) > 10


def with_retry(fn, label: str, max_retries: int = 3):
    for attempt in range(1, max_retries + 1):
        try:
            return fn()
        except Exception as err:
            is_rate_limit = "412" in str(err) or "429" in str(err)
            if attempt == max_retries or is_rate_limit:
                raise
            delay = min(2.0 * (2 ** (attempt - 1)), 10.0) + 0.5 * (attempt % 2)
            print(f"  {label} 失败 (第{attempt}次)，{delay:.1f}秒后重试...")
            time.sleep(delay)


def export_csv(replies: list[dict], bvid: str, output_dir: Path, is_partial: bool = False) -> str:
    output_dir.mkdir(parents=True, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    suffix = "_partial" if is_partial else ""
    csv_path = output_dir / f"bilibili_{ts}{suffix}.csv"
    source_url = f"https://www.bilibili.com/video/{bvid}"

    with open(csv_path, "w", encoding="utf-8-sig", newline="") as f:
        writer = csv.writer(f, quoting=csv.QUOTE_MINIMAL)
        writer.writerow(["text", "likes", "create_time", "username", "platform", "source_id", "source_url"])

        for r in replies:
            _write_reply_row(writer, r, source_url)
            for sr in r.get("sub_replies", []):
                _write_reply_row(writer, sr, source_url)

    print(f"\nCSV 已导出: {csv_path} ({len(replies)} 条主评论)")
    return str(csv_path)


def _write_reply_row(writer, reply: dict, source_url: str):
    ctime = reply.get("ctime")
    ctime_str = datetime.fromtimestamp(ctime, tz=timezone.utc).isoformat() if ctime else ""
    writer.writerow([
        reply.get("content", ""),
        reply.get("like", 0),
        ctime_str,
        reply.get("uname", ""),
        "bilibili",
        str(reply.get("rpid", "")),
        source_url,
    ])


def fetch_video_info(session: cffi_requests.Session, bvid: str, mixin_key: str) -> dict:
    def _fetch():
        params = enc_wbi({"bvid": bvid}, mixin_key)
        resp = session.get(
            VIDEO_INFO_API,
            params=params,
            headers={**HEADERS, "Referer": f"https://www.bilibili.com/video/{bvid}"},
            impersonate=IMPERSONATE,
            timeout=15,
        )
        data = resp.json()
        if data.get("code") != 0:
            raise RuntimeError(f"API code {data['code']}: {data.get('message')}")
        d = data["data"]
        return {
            "title": d.get("title", ""),
            "desc": d.get("desc", ""),
            "owner": d.get("owner", {}),
            "stat": d.get("stat", {}),
            "aid": d.get("aid", 0),
            "cid": d.get("cid", 0),
        }
    return with_retry(_fetch, "获取视频信息")


def fetch_replies(
    session: cffi_requests.Session,
    bvid: str,
    oid: int,
    next_offset: int,
    mode: int,
    mixin_key: str,
) -> dict:
    def _fetch():
        params = enc_wbi(
            {"type": 1, "oid": oid, "mode": mode, "next": next_offset},
            mixin_key,
        )
        resp = session.get(
            REPLY_MAIN_API,
            params=params,
            headers={**HEADERS, "Referer": f"https://www.bilibili.com/video/{bvid}"},
            impersonate=IMPERSONATE,
            timeout=15,
        )
        data = resp.json()
        if data.get("code") != 0:
            raise RuntimeError(f"API code {data['code']}: {data.get('message')}")
        return data

    try:
        resp_data = with_retry(_fetch, f"评论页(mode={mode},offset={next_offset})")
    except Exception as e:
        return {"replies": [], "cursor": None, "error": str(e)}

    cursor = resp_data.get("data", {}).get("cursor", {})
    raw_replies = resp_data.get("data", {}).get("replies", []) or []

    replies = []
    for r in raw_replies:
        replies.append({
            "content": r.get("content", {}).get("message", ""),
            "like": r.get("like", 0),
            "rpid": r.get("rpid", 0),
            "uname": r.get("member", {}).get("uname", ""),
            "rcount": r.get("rcount", 0),
            "ctime": r.get("ctime", 0),
            "sub_replies": [],
        })

    return {
        "replies": replies,
        "cursor": {
            "is_end": cursor.get("is_end", False),
            "next": cursor.get("next", next_offset),
            "all_count": cursor.get("all_count", 0),
        },
    }


def fetch_sub_replies(
    session: cffi_requests.Session,
    bvid: str,
    oid: int,
    root_rpid: int,
    mixin_key: str,
) -> list[dict]:
    def _fetch():
        params = enc_wbi(
            {"type": 1, "oid": oid, "root": root_rpid, "ps": 20, "pn": 1},
            mixin_key,
        )
        resp = session.get(
            REPLY_SUB_API,
            params=params,
            headers={**HEADERS, "Referer": f"https://www.bilibili.com/video/{bvid}"},
            impersonate=IMPERSONATE,
            timeout=10,
        )
        data = resp.json()
        if data.get("code") != 0:
            raise RuntimeError(f"Sub API code {data['code']}")
        return data

    try:
        data = with_retry(_fetch, f"子评论(rpid={root_rpid})", max_retries=2)
        raw = data.get("data", {}).get("replies", []) or []
        return [
            {
                "content": sr.get("content", {}).get("message", ""),
                "like": sr.get("like", 0),
                "rpid": sr.get("rpid", 0),
                "uname": sr.get("member", {}).get("uname", ""),
                "ctime": sr.get("ctime", 0),
            }
            for sr in raw
        ]
    except Exception:
        return []


def run_login(cookies_path: Path):
    playwright_script = SCRIPT_DIR.parent / "playwright-scraper" / "scrape-bilibili.mjs"
    if not playwright_script.exists():
        print(f"❌ Playwright 登录脚本不存在: {playwright_script}")
        print("   请手动创建 cookies-bilibili.json 或先运行 Playwright 版本登录")
        sys.exit(1)

    print("调用 Playwright 登录流程...")
    os.system(f'node "{playwright_script}" --login')


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="OutEye curl_cffi B站评论采集器")
    parser.add_argument("--bvid", type=str, help="B站视频BV号")
    parser.add_argument("--max-scroll", type=int, default=50, help="最大分页数")
    parser.add_argument("--max-comments", type=int, default=2000, help="最大评论数")
    parser.add_argument("--cookies", type=str, default=str(DEFAULT_COOKIES), help="Cookie 文件路径")
    parser.add_argument("--output", type=str, default=str(DEFAULT_OUTPUT), help="输出目录")
    parser.add_argument("--login", action="store_true", help="登录模式")

    args, remaining = parser.parse_known_args()
    if remaining:
        for arg in remaining:
            if arg.startswith("BV"):
                args.bvid = arg
            elif arg.startswith("--bvid="):
                args.bvid = arg.split("=", 1)[1]

    if not args.bvid:
        for arg in sys.argv[1:]:
            m = re.search(r"(BV\w{10})", arg)
            if m:
                args.bvid = m.group(1)
                break

    return args


def main():
    global all_replies_map, current_bvid, current_output_dir

    args = parse_args()
    cookies_path = Path(args.cookies)
    output_dir = Path(args.output)
    current_output_dir = output_dir

    if args.login:
        run_login(cookies_path)
        return

    if not args.bvid:
        print("Usage: python scrape_bilibili.py --bvid=BVxxx", file=sys.stderr)
        sys.exit(1)

    current_bvid = args.bvid

    print("\n=== OutEye curl_cffi B站采集器 ===")
    print("输出模式: CSV（由 P0 页面导入 Supabase）\n")

    cookies = load_cookies_playwright(cookies_path)
    if not cookies:
        print(f"⚠️  未找到 Cookie 文件或文件为空: {cookies_path}", file=sys.stderr)
        print("   运行 --login 模式获取 Cookie，或手动创建 cookies-bilibili.json", file=sys.stderr)
        sys.exit(1)

    if not has_sessdata(cookies):
        print("⚠️  Cookie 中未找到有效 SESSDATA，采集数量可能受限")
        print("   运行 --login 模式重新登录\n")

    session = cffi_requests.Session(impersonate=IMPERSONATE)
    session.cookies.update(cookies)

    print("[1/4] 获取 wbi 签名密钥...")
    try:
        img_key, sub_key = fetch_wbi_keys(session)
        mixin_key = get_mixin_key(img_key + sub_key)
        print(f"  img_key: {img_key[:12]}...")
        print(f"  sub_key: {sub_key[:12]}...")
    except Exception as e:
        print(f"❌ 获取 wbi 密钥失败: {e}", file=sys.stderr)
        sys.exit(1)

    print("\n[2/4] 获取视频信息...")
    video_info = fetch_video_info(session, args.bvid, mixin_key)
    print(f"  标题: {video_info['title']}")
    print(f"  评论数: {video_info['stat'].get('reply', '未知')}")
    oid = video_info["aid"]

    print("\n[3/4] 采集评论...")
    all_replies_map.clear()

    print("  阶段A: 热门评论 (mode=3)...")
    hot_result = fetch_replies(session, args.bvid, oid, 0, 3, mixin_key)
    for r in hot_result["replies"]:
        all_replies_map[r["rpid"]] = r
    print(f"  热评: {len(hot_result['replies'])} 条, 累计 {len(all_replies_map)} 条")
    if hot_result.get("cursor", {}).get("all_count"):
        print(f"  API 报告总评论数: {hot_result['cursor']['all_count']}")
    time.sleep(0.5)

    print("  阶段B: 全量采集 (mode=2)...")
    next_offset = 0
    scroll_count = 0
    no_new_count = 0

    while scroll_count < args.max_scroll and len(all_replies_map) < args.max_comments:
        scroll_count += 1
        prev_size = len(all_replies_map)

        result = fetch_replies(session, args.bvid, oid, next_offset, 2, mixin_key)

        if result.get("error"):
            err_msg = result["error"]
            if "412" in err_msg or "429" in err_msg:
                print(f"  ⚠️ B站限流 (HTTP 412/429)，已采集 {len(all_replies_map)} 条")
                break
            print(f"  API 错误: {err_msg}")
            break

        for r in result["replies"]:
            all_replies_map[r["rpid"]] = r

        added = len(all_replies_map) - prev_size
        if scroll_count % 5 == 0 or added > 0:
            print(f"  第 {scroll_count} 页: +{added}, 累计 {len(all_replies_map)} 条")

        cursor = result.get("cursor", {})
        if cursor.get("is_end"):
            print("  ✅ 已到达评论末尾 (cursor.is_end=True)")
            break
        if not result["replies"]:
            print("  ✅ 本页无评论，停止")
            break

        if added == 0:
            no_new_count += 1
            if no_new_count >= 3:
                print("  ⚠️ 连续3次无新评论，停止")
                print("  （如果评论数远少于预期，请检查是否已登录）")
                break
        else:
            no_new_count = 0

        next_offset = cursor.get("next", 0) or 0
        delay = random.uniform(2.0, 5.0)
        time.sleep(delay)

    all_replies = list(all_replies_map.values())
    print(f"\n采集完成: {len(all_replies)} 条主评论")

    if not all_replies:
        print("\n未采集到评论。可能原因：")
        print("  1. Cookie 已过期，请运行 --login 重新登录")
        print("  2. 视频已删除或限制访问")
        print("  3. B站 API 结构变化")
        return

    print("\n  采集子评论...")
    replies_with_subs = [r for r in all_replies if r["rcount"] > 0]
    sub_count = 0

    if replies_with_subs:
        with ThreadPoolExecutor(max_workers=3) as executor:
            futures = {
                executor.submit(fetch_sub_replies, session, args.bvid, oid, r["rpid"], mixin_key): r
                for r in replies_with_subs
            }
            for future in as_completed(futures):
                reply = futures[future]
                try:
                    subs = future.result()
                    reply["sub_replies"] = subs
                    sub_count += len(subs)
                except Exception:
                    pass

    if sub_count > 0:
        print(f"  子评论: {sub_count} 条")

    print("\n[4/4] 导出 CSV...")
    csv_path = export_csv(all_replies, args.bvid, output_dir)

    total_with_sub = sum(1 + len(r.get("sub_replies", [])) for r in all_replies)
    print(f"\n{'=' * 50}")
    print("采集汇总")
    print(f"{'=' * 50}")
    print(f"视频: {video_info['title']}")
    print(f"主评论: {len(all_replies)} 条")
    print(f"含子评论: {total_with_sub} 条")
    print(f"CSV: {csv_path}")
    print(f"\n下一步：回到 P0 页面 → 数据文件 → 扫描文件 → 预览 → 导入")


if __name__ == "__main__":
    main()
