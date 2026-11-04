#!/usr/bin/env python3
"""ige8（爱歌吧 / ig8）在线曲库探针。

用途：在不安装 ig8.exe 的前提下，直接验证 ige8 曲库的搜索、取址、下载三条链路，
作为 HomeKTV 在线补歌 provider 的参考实现与验收工具。

接口事实（2026-11 实测）：
  * 搜索：POST http://app.ige8.net/cloud.php   body: CMD / PARAMS(JSON)
  * 取址：POST http://app.ige8.net/telnet.php  body: VER / CMD / PARAMS(JSON)
  * 媒体：GET  {FileUrl}                      支持 Range，返回 206

用法：
  python3 scripts/igeba_probe.py search 孤勇者 --size 5
  python3 scripts/igeba_probe.py resolve 20039643
  python3 scripts/igeba_probe.py fetch 20039643 --out runtime/igeba
  python3 scripts/igeba_probe.py selfcheck 孤勇者 --count 3

注意：ige8 的媒体地址带一次性 rid，且存在双节点 token 不一致（约 30% 概率返回
403 Url Expired），必须「重新取址 + 立即探测」直到拿到可用地址；高频请求会触发
短时限流，所有命令默认带 1s 间隔与指数退避，不要改小。
"""

from __future__ import annotations

import argparse
import json
import os
import random
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from typing import Any, Callable

DEFAULT_BASE = "http://app.ige8.net"
CLOUD_PATH = "/cloud.php"
TELNET_PATH = "/telnet.php"
PROTOCOL_VERSION = "1"
COVER_BASE = "http://pub.amanktv.cn/uploads/images"

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0 Safari/537.36"
)

EXPIRED_MARKERS = ("Url Expired", "Anonymous User")


class ProbeError(RuntimeError):
    pass


@dataclass
class Song:
    song_number: str
    name: str
    singer: str
    file_name: str
    duration_seconds: int
    language: str
    mtv_style: str
    music_style: str
    feeling: str
    voice_channel: str
    raw: dict[str, Any] = field(default_factory=dict)

    @property
    def cover_url(self) -> str:
        return f"{COVER_BASE}/{self.song_number}.jpg"

    @classmethod
    def from_payload(cls, item: dict[str, Any]) -> "Song":
        def as_int(value: Any) -> int:
            try:
                return int(str(value).strip() or 0)
            except ValueError:
                return 0

        return cls(
            song_number=str(item.get("SongNumber") or "").strip(),
            name=str(item.get("SongName") or "").strip(),
            singer=str(item.get("SingerName") or "").strip(),
            file_name=str(item.get("FileName") or "").strip(),
            duration_seconds=as_int(item.get("Duration")),
            language=str(item.get("LanguageName") or "").strip(),
            mtv_style=str(item.get("MtvStyle") or "").strip(),
            music_style=str(item.get("MusicStyle") or "").strip(),
            feeling=str(item.get("Feeling") or "").strip(),
            voice_channel=str(item.get("VoiceChannel") or "").strip(),
            raw=item,
        )


class IgebaClient:
    def __init__(self, base: str = DEFAULT_BASE, uid: int = 0, delay_seconds: float = 1.0) -> None:
        self.base = base.rstrip("/")
        self.uid = uid
        self.delay_seconds = delay_seconds

    # ---------------------------------------------------------------- 基础 HTTP

    def _post_form(self, path: str, fields: dict[str, str], timeout: float = 20.0) -> str:
        body = urllib.parse.urlencode(fields).encode("utf-8")
        request = urllib.request.Request(
            f"{self.base}{path}",
            data=body,
            headers={
                "Content-Type": "application/x-www-form-urlencoded",
                "User-Agent": USER_AGENT,
                "Accept": "application/json, text/plain, */*",
            },
            method="POST",
        )
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.read().decode("utf-8", "replace")

    def _post_json(self, path: str, command: str, params: dict[str, Any]) -> Any:
        fields = {
            "CMD": command,
            "PARAMS": json.dumps(params, ensure_ascii=False, separators=(",", ":")),
        }
        if path == TELNET_PATH:
            fields["VER"] = PROTOCOL_VERSION
        text = self._post_form(path, fields)
        try:
            return json.loads(text)
        except json.JSONDecodeError as exc:  # 接口返回异常时保留原文，便于排查
            raise ProbeError(f"{command} 返回非 JSON: {text[:200]!r}") from exc

    # ---------------------------------------------------------------- 搜索

    def search(self, keyword: str, page: int = 1, size: int = 20, pinyin: bool = False) -> tuple[list[Song], dict[str, Any]]:
        """按歌名/歌手/描述搜索；pinyin=True 时按首字母匹配（如 gxz -> 恭喜自己）。"""
        key = "PYCode" if pinyin else "Name"
        payload = self._post_json(
            CLOUD_PATH,
            "GET_SONGS",
            {
                "UserId": self.uid,
                "Filter": {key: keyword},
                "Page": {"PageNo": page, "PageSize": size},
            },
        )

        if isinstance(payload, list):  # 空关键字时接口直接返回 []
            return [], {"PageCount": 0, "RecordCount": 0}
        if "Result" in payload and "List" not in payload:
            raise ProbeError(f"搜索被拒绝: {payload.get('Description') or payload}")

        songs = [Song.from_payload(item) for item in payload.get("List") or []]
        return songs, payload.get("Page") or {}

    def hot_modules(self) -> list[dict[str, Any]]:
        payload = self._post_json(CLOUD_PATH, "GET_HEADS", {"UserId": self.uid})
        return payload.get("List") or [] if isinstance(payload, dict) else []

    # ---------------------------------------------------------------- 取址

    def raw_address(self, song_number: str) -> dict[str, Any]:
        return self._post_json(
            TELNET_PATH,
            "GET_SONGADDR",
            {"SongNumber": song_number, "UserId": self.uid},
        )

    def resolve(self, song_number: str, attempts: int = 30) -> dict[str, Any]:
        """重复取址直到拿到可用的 206 链接。

        ige8 的门户是双节点，约 30% 的 rid 在其文件服务器上判定为 Url Expired，
        必须重新申请；命中限流时同样表现为 Expired，需要退避后重试。
        """
        last_error: Exception | None = None
        for attempt in range(1, attempts + 1):
            address = self.raw_address(song_number)
            file_url = (address.get("FileUrl") or "").strip()
            if not file_url:
                last_error = ProbeError(f"{song_number} 无播放地址（Rights={address.get('Rights')}）")
                time.sleep(self._backoff(attempt))
                continue
            try:
                size = self.probe_url(file_url)
                address["_attempt"] = attempt
                address["_size"] = size
                return address
            except urllib.error.HTTPError as exc:
                last_error = exc
                if not self._is_retryable(exc):
                    raise
            except OSError as exc:  # 连接重置等
                last_error = exc
            time.sleep(self._backoff(attempt))
        raise ProbeError(f"{song_number} 取址失败（{attempts} 次）: {last_error}")

    def probe_url(self, file_url: str, timeout: float = 15.0) -> int:
        """用小 Range 校验链接是否可用，返回文件总长度。

        部分文件节点会拒绝 `bytes=0-0`（返回 403 Invalid Range），退化为 1KB 探测。
        """
        for range_value in ("bytes=0-0", "bytes=0-1023"):
            request = urllib.request.Request(
                file_url,
                headers={"Range": range_value, "User-Agent": USER_AGENT},
            )
            try:
                with urllib.request.urlopen(request, timeout=timeout) as response:
                    response.read()
                    content_range = response.headers.get("content-range") or ""
                    if "/" in content_range:
                        total = content_range.rsplit("/", 1)[1].strip()
                        if total.isdigit():
                            return int(total)
                    length = response.headers.get("content-length")
                    return int(length) if length and length.isdigit() else 0
            except urllib.error.HTTPError as exc:
                if range_value == "bytes=0-0" and "Invalid Range" in str(exc.reason or ""):
                    continue
                raise

    # ---------------------------------------------------------------- 下载

    def download(
        self,
        file_url: str,
        target: str,
        total: int = 0,
        refresh: "Callable[[], tuple[str, int]] | None" = None,
        chunk_size: int = 4 << 20,
        max_refreshes: int = 20,
    ) -> str:
        """分块断点续传下载。

        ige8 的文件节点只接受**闭合区间** Range（`bytes=a-b`）：无 Range 或
        `bytes=a-` 会被判 `403 Invalid Range`。因此按固定窗口顺序取块，.part
        文件可直接续跑；块请求遇到 Expired 时通过 refresh 重新取址。
        """
        os.makedirs(os.path.dirname(os.path.abspath(target)) or ".", exist_ok=True)
        part = f"{target}.part"
        offset = os.path.getsize(part) if os.path.exists(part) else 0
        if total and offset >= total:
            os.replace(part, target)
            return target
        if offset:
            # 续传前截断到最后一块边界，避免半块数据
            offset -= offset % chunk_size

        refreshes = 0
        with open(part, "r+b" if os.path.exists(part) else "wb") as sink:
            sink.truncate(offset)
            sink.seek(offset)
            while not total or offset < total:
                start = offset
                end = start + chunk_size - 1
                if total:
                    end = min(end, total - 1)
                requested = end - start + 1
                request = urllib.request.Request(
                    file_url,
                    headers={"Range": f"bytes={start}-{end}", "User-Agent": USER_AGENT},
                )
                try:
                    with urllib.request.urlopen(request, timeout=90) as response:
                        block = response.read()
                except urllib.error.HTTPError as exc:
                    if refresh and refreshes < max_refreshes and self._is_retryable(exc):
                        refreshes += 1
                        time.sleep(self._backoff(refreshes))
                        file_url, refreshed_total = refresh()
                        if refreshed_total:
                            total = refreshed_total
                        continue
                    raise
                if not block:
                    break
                sink.write(block)
                offset += len(block)
                if len(block) < requested - 1:
                    break  # 该节点的 Range 语义是半开区间（返回 end-start 字节），差 1 属正常

        produced = os.path.getsize(part)
        if total and produced < total - 1:
            raise ProbeError(f"下载不完整: {produced}/{total} 字节，可重跑续传")
        os.replace(part, target)
        return target

    # ---------------------------------------------------------------- 工具

    @staticmethod
    def _is_retryable(exc: urllib.error.HTTPError) -> bool:
        if exc.code in (403, 408, 429, 500, 502, 503, 504):
            reason = str(exc.reason or "")
            if exc.code == 403 and not any(marker in reason for marker in EXPIRED_MARKERS):
                return False
            return True
        return False

    def _backoff(self, attempt: int) -> float:
        """取址重试很快（单次约 50ms），只在判定为限流时才明显退避。"""
        base = min(0.2 * (2 ** min(attempt - 1, 3)), 0.8)
        delay = base + random.uniform(0.0, 0.15)
        if attempt > 20:  # 连续失败，大概率命中限流
            delay += 1.0
        return delay


# -------------------------------------------------------------------- CLI


def print_songs(songs: list[Song]) -> None:
    for song in songs:
        minutes, seconds = divmod(song.duration_seconds, 60)
        print(
            f"{song.song_number:>9}  {song.name} - {song.singer}  "
            f"[{song.language or '-'} | {minutes}:{seconds:02d} | {song.file_name or '-'}]"
        )


def cmd_search(args: argparse.Namespace) -> int:
    client = IgebaClient(uid=args.uid, delay_seconds=args.delay)
    songs, page = client.search(args.keyword, page=args.page, size=args.size, pinyin=args.pinyin)
    print_songs(songs)
    print(f"\n共 {page.get('RecordCount', '?')} 条（上限 1000），本页 {len(songs)} 条。")
    return 0


def cmd_resolve(args: argparse.Namespace) -> int:
    client = IgebaClient(uid=args.uid, delay_seconds=args.delay)
    address = client.resolve(args.song_number, attempts=args.attempts)
    print(json.dumps(
        {
            "songNumber": address.get("SongNumber"),
            "fileName": address.get("FileName"),
            "fileUrl": address.get("FileUrl"),
            "size": address.get("_size"),
            "rights": address.get("Rights"),
            "voiceChannel": address.get("VoiceChannel"),
            "attempts": address.get("_attempt"),
        },
        ensure_ascii=False,
        indent=2,
    ))
    return 0


def cmd_fetch(args: argparse.Namespace) -> int:
    client = IgebaClient(uid=args.uid, delay_seconds=args.delay)

    def resolve_again() -> tuple[str, int]:
        fresh = client.resolve(args.song_number, attempts=args.attempts)
        return fresh["FileUrl"], int(fresh.get("_size") or 0)

    address = client.resolve(args.song_number, attempts=args.attempts)
    file_url = address["FileUrl"]
    total = int(address.get("_size") or 0)
    name = address.get("FileName") or f"{args.song_number}.mkv"
    target = os.path.join(args.out, name)
    print(f"取址 {address.get('_attempt')} 次命中，{total / 1048576:.1f} MB -> {target}")
    if args.dry_run:
        return 0
    client.download(file_url, target, total=total, refresh=resolve_again)
    print(f"完成：{os.path.getsize(target)} 字节")
    return 0


def cmd_selfcheck(args: argparse.Namespace) -> int:
    """按关键词取前 N 首，统计取址成功率与单曲下载可用性（默认只探测头部）。"""
    client = IgebaClient(uid=args.uid, delay_seconds=args.delay)
    songs, _ = client.search(args.keyword, size=args.count)
    if not songs:
        print("没有搜索结果")
        return 1

    ok = 0
    for index, song in enumerate(songs, start=1):
        started = time.time()
        try:
            address = client.resolve(song.song_number, attempts=args.attempts)
            elapsed = time.time() - started
            size_mb = int(address.get("_size") or 0) / 1048576
            print(f"[{index}/{len(songs)}] OK  {song.name} - {song.singer} "
                  f"({size_mb:.1f} MB, 取址 {address.get('_attempt')} 次, {elapsed:.1f}s)")
            ok += 1
        except ProbeError as exc:
            print(f"[{index}/{len(songs)}] FAIL {song.name} - {song.singer}: {exc}")
        if index < len(songs):
            time.sleep(args.delay)

    print(f"\n取址成功率 {ok}/{len(songs)} = {ok / len(songs):.0%}")
    return 0 if ok else 1


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="ige8 在线曲库探针")
    parser.add_argument("--uid", type=int, default=int(os.environ.get("IGEBA_UID", "0")),
                        help="0 = 匿名（免费用户），登录用户填其 UserId")
    parser.add_argument("--delay", type=float, default=1.0, help="请求间隔秒数，默认 1.0")
    sub = parser.add_subparsers(dest="command", required=True)

    search = sub.add_parser("search", help="按关键字搜索曲库")
    search.add_argument("keyword")
    search.add_argument("--page", type=int, default=1)
    search.add_argument("--size", type=int, default=20)
    search.add_argument("--pinyin", action="store_true", help="用首字母搜索（PYCode）")
    search.set_defaults(func=cmd_search)

    resolve = sub.add_parser("resolve", help="取单曲播放地址（自动重试到可用）")
    resolve.add_argument("song_number")
    resolve.add_argument("--attempts", type=int, default=30)
    resolve.set_defaults(func=cmd_resolve)

    fetch = sub.add_parser("fetch", help="取址并下载到本地（断点续传）")
    fetch.add_argument("song_number")
    fetch.add_argument("--out", default=os.path.join("runtime", "igeba"))
    fetch.add_argument("--attempts", type=int, default=30)
    fetch.add_argument("--dry-run", action="store_true")
    fetch.set_defaults(func=cmd_fetch)

    check = sub.add_parser("selfcheck", help="批量验证取址成功率")
    check.add_argument("keyword")
    check.add_argument("--count", type=int, default=3)
    check.add_argument("--attempts", type=int, default=30)
    check.set_defaults(func=cmd_selfcheck)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        return int(args.func(args))
    except ProbeError as exc:
        print(f"错误: {exc}", file=sys.stderr)
        return 2
    except KeyboardInterrupt:
        return 130


if __name__ == "__main__":
    raise SystemExit(main())
