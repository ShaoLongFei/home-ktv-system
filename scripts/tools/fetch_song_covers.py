#!/usr/bin/env python3
from __future__ import annotations

import argparse
import html
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import FIRST_COMPLETED, ThreadPoolExecutor, wait
from datetime import datetime, timezone
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parents[2]
SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from music_metadata_sidecar_client import create_metadata_sidecar_client, default_metadata_sidecar_command


DEFAULT_NETEASE_BASE_URL = "http://127.0.0.1:4300"
DEFAULT_PROVIDERS = ["netease", "cloud", "tencent", "kugou", "kuwo", "spotify"]
DEFAULT_METADATA_SIDECAR_PROVIDERS = ["netease", "tencent", "kugou", "kuwo"]
DEFAULT_IMAGE_SIZE = 300
MAX_IMAGE_BYTES = 5 * 1024 * 1024
SAFE_SONG_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$")
SPOTIFY_PATHFINDER_URL = "https://api-partner.spotify.com/pathfinder/v1/query"
SPOTIFY_SEARCH_OPERATION = "searchSuggestions"
SPOTIFY_SEARCH_HASH = "556f5a15b2fdd3a7113ffd377ad9805e38a3a27b8bb1ca7d6d76bad54aa8ee12"
SPOTIFY_TOKEN_TRACK_ID = "4iV5W9uYEdYUVa79Axb7Rh"
SPOTIFY_ACCESS_TOKEN_CACHE = {"token": "", "expiresAt": 0}


class SongActionDecision:
    def __init__(self, action, public_url=None, external_url=None, reason=""):
        self.action = action
        self.public_url = public_url
        self.external_url = external_url
        self.reason = reason


def main(argv=None):
    args = parse_args(sys.argv[1:] if argv is None else argv)
    load_env_file(args.env_file)

    if args.command == "fetch":
        fetch_covers(args)
    elif args.command == "coverage":
        run_coverage(args)
    elif args.command == "probe":
        probe_single_cover(args)
    elif args.command == "status":
        print_status(args)
    else:
        raise SystemExit(f"Unknown command: {args.command}")


def parse_args(argv):
    argv = [arg for arg in argv if arg != "--"]
    parser = argparse.ArgumentParser(description="Fetch and locally cache HomeKTV song covers.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    for command in ("fetch", "coverage", "probe", "status"):
        sub = subparsers.add_parser(command)
        add_common_args(sub)
        if command in ("fetch", "coverage", "probe"):
            if command == "probe":
                sub.add_argument("title")
                sub.add_argument("artist", nargs="?", default="")
            limit_default = 0 if command == "fetch" else 100
            sub.add_argument("--limit", type=non_negative_int, default=limit_default, help="0 means all selected songs.")
            sub.add_argument("--providers", default=",".join(DEFAULT_PROVIDERS))
            sub.add_argument(
                "--netease-base-url",
                default=os.environ.get("NETEASE_CLOUD_MUSIC_API_BASE_URL", DEFAULT_NETEASE_BASE_URL),
            )
            sub.add_argument("--search-limit", type=positive_int, default=8)
            sub.add_argument("--request-timeout-ms", type=positive_int, default=8000)
            sub.add_argument("--delay-ms", type=non_negative_int, default=600)
            sub.add_argument("--concurrency", type=positive_int, default=10)
            sub.add_argument("--progress-every", type=positive_int, default=20)
            sub.add_argument(
                "--metadata-sidecar-command",
                default=os.environ.get("KTV_METADATA_SIDECAR_COMMAND", default_metadata_sidecar_command()),
            )
            sub.add_argument(
                "--metadata-sidecar-providers",
                default=os.environ.get(
                    "KTV_METADATA_SIDECAR_PROVIDERS",
                    ",".join(DEFAULT_METADATA_SIDECAR_PROVIDERS),
                ),
            )
            sub.add_argument("--disable-metadata-sidecar", action="store_true")
            if command == "probe":
                sub.add_argument("--download", default="")
        if command == "fetch":
            sub.add_argument("--retry-failed", action="store_true")
            sub.add_argument("--retry-not-found", action="store_true")
            sub.add_argument("--force", action="store_true")
            sub.add_argument(
                "--full-scan",
                action="store_true",
                help="Scan all active songs instead of only songs still missing a normalized local cover URL.",
            )

    return parser.parse_args(argv)


def add_common_args(parser):
    parser.add_argument("--env-file", default=os.environ.get("KTV_ENV_FILE", "deploy/source/.env"))
    parser.add_argument("--database-url", default="")
    parser.add_argument("--postgres-container", default=os.environ.get("KTV_POSTGRES_CONTAINER", ""))
    parser.add_argument("--db-user", default=os.environ.get("PGUSER", "ktv"))
    parser.add_argument("--db-name", default=os.environ.get("PGDATABASE", "home_ktv"))
    parser.add_argument("--media-root", default="")
    parser.add_argument("--cover-root", default="")
    parser.add_argument("--public-base-url", default="")
    parser.add_argument("--output", default="")
    parser.add_argument("--state", default="")


def fetch_covers(args):
    media_root = resolve_media_root(args)
    cover_root = resolve_cover_root(args, media_root)
    output = resolve_output_path(args, media_root)
    state_path = resolve_state_path(args, output)
    public_base_url = resolve_public_base_url(args)
    ensure_parent(output)
    ensure_parent(state_path)

    songs = select_candidate_songs(args, random_order=False, public_base_url=public_base_url)
    history = read_history(output)
    stats = {
        "selected": len(songs),
        "found": 0,
        "repaired": 0,
        "skipped": 0,
        "notFound": 0,
        "failed": 0,
    }
    write_state(state_path, {**stats, "status": "running", "updatedAt": now_iso(), "output": str(output)})
    print(f"selected={len(songs)} concurrency={args.concurrency} coverRoot={cover_root} output={output}", flush=True)

    providers = read_provider_list(args.providers)
    sidecar_providers = read_metadata_sidecar_provider_set(args.metadata_sidecar_providers)
    sidecar_client = try_create_metadata_sidecar_client(args, default_timeout_seconds=max(10, args.request_timeout_ms // 1000 + 2))
    try:
        worker = lambda song: process_fetch_song(
            args,
            song,
            history,
            cover_root,
            public_base_url,
            providers,
            sidecar_client=sidecar_client,
            sidecar_providers=sidecar_providers,
        )
        for index, result in enumerate(iter_song_task_results(songs, worker, args.concurrency, args.delay_ms), start=1):
            stat_key = fetch_status_stat_key(result.get("status"))
            if stat_key:
                stats[stat_key] += 1
            append_jsonl(output, result)

            if index % args.progress_every == 0 or index == len(songs):
                remaining = len(songs) - index
                print(
                    f"processed={index}/{len(songs)} remaining={remaining} "
                    f"found={stats['found']} repaired={stats['repaired']} "
                    f"notFound={stats['notFound']} failed={stats['failed']} skipped={stats['skipped']}",
                    flush=True,
                )
                write_state(
                    state_path,
                    {
                        **stats,
                        "status": "running" if remaining else "completed",
                        "processed": index,
                        "pending": remaining,
                        "updatedAt": now_iso(),
                        "output": str(output),
                    },
                )
    finally:
        close_metadata_sidecar_client(sidecar_client)


def process_fetch_song(args, song, history, cover_root, public_base_url, providers, sidecar_client=None, sidecar_providers=None):
    decision = decide_song_action(
        song,
        history,
        cover_root,
        public_base_url,
        args.retry_failed,
        args.retry_not_found,
        args.force,
    )
    row = {
        "songId": song["id"],
        "title": song["title"],
        "artistName": song["artistName"],
        "createdAt": now_iso(),
    }
    try:
        if decision.action == "skip":
            return {**row, "status": "skipped", "reason": decision.reason}
        if decision.action == "repair":
            update_cover_url(args, song["id"], decision.public_url)
            return {**row, "status": "repaired", "publicUrl": decision.public_url}

        cover = None
        if decision.external_url:
            cover = {
                "provider": "existing",
                "providerSongId": "",
                "imageUrl": decision.external_url,
                "confidence": 100,
            }
        if not cover:
            cover = find_cover(
                song,
                providers,
                args.search_limit,
                args.request_timeout_ms,
                DEFAULT_IMAGE_SIZE,
                args.netease_base_url,
                sidecar_client=sidecar_client,
                sidecar_providers=sidecar_providers,
            )
        if not cover:
            touch_cover_processed(args, song["id"])
            return {**row, "status": "not_found"}

        public_url = public_cover_url(public_base_url, song["id"])
        destination = cover_file_path(cover_root, song["id"])
        download_image(cover["imageUrl"], destination, args.request_timeout_ms)
        update_cover_url(args, song["id"], public_url)
        return {
            **row,
            "status": "found",
            "provider": cover["provider"],
            "providerSongId": cover.get("providerSongId") or "",
            "confidence": cover.get("confidence"),
            "externalImageUrl": cover["imageUrl"],
            "publicUrl": public_url,
            "coverPath": str(destination),
        }
    except Exception as error:
        try:
            touch_cover_processed(args, song["id"])
        except Exception as touch_error:
            detail = f"{str(error)[:350]}; touch failed: {str(touch_error)[:120]}"
            return {**row, "status": "failed", "error": detail}
        return {**row, "status": "failed", "error": str(error)[:500]}


def fetch_status_stat_key(status):
    return {
        "found": "found",
        "repaired": "repaired",
        "skipped": "skipped",
        "not_found": "notFound",
        "failed": "failed",
    }.get(clean(status))


def run_coverage(args):
    songs = select_candidate_songs(args, random_order=True)
    providers = read_provider_list(args.providers)
    sidecar_providers = read_metadata_sidecar_provider_set(args.metadata_sidecar_providers)
    stats = {"sample": len(songs), "found": 0, "notFound": 0, "failed": 0, "providerHits": {}}
    print(f"sample={len(songs)} concurrency={args.concurrency} providers={','.join(providers)}", flush=True)

    sidecar_client = try_create_metadata_sidecar_client(args, default_timeout_seconds=max(10, args.request_timeout_ms // 1000 + 2))
    try:
        worker = lambda song: process_coverage_song(
            song,
            providers,
            args.search_limit,
            args.request_timeout_ms,
            args.netease_base_url,
            sidecar_client=sidecar_client,
            sidecar_providers=sidecar_providers,
        )
        for index, result in enumerate(iter_song_task_results(songs, worker, args.concurrency, args.delay_ms), start=1):
            if result["status"] == "found":
                stats["found"] += 1
                provider = result["provider"]
                stats["providerHits"][provider] = stats["providerHits"].get(provider, 0) + 1
            elif result["status"] == "not_found":
                stats["notFound"] += 1
            else:
                stats["failed"] += 1

            if index % args.progress_every == 0 or index == len(songs):
                print(json.dumps(stats, ensure_ascii=False, sort_keys=True), flush=True)
    finally:
        close_metadata_sidecar_client(sidecar_client)

    hit_rate = 0 if stats["sample"] == 0 else round(stats["found"] / stats["sample"] * 100, 1)
    print(json.dumps({**stats, "hitRate": hit_rate}, ensure_ascii=False, sort_keys=True), flush=True)


def probe_single_cover(args):
    providers = read_provider_list(args.providers)
    sidecar_providers = read_metadata_sidecar_provider_set(args.metadata_sidecar_providers)
    sidecar_client = try_create_metadata_sidecar_client(args, default_timeout_seconds=max(10, args.request_timeout_ms // 1000 + 2))
    try:
        result = probe_cover(
            title=args.title,
            artist=args.artist,
            providers=providers,
            search_limit=args.search_limit,
            timeout_ms=args.request_timeout_ms,
            image_size=DEFAULT_IMAGE_SIZE,
            netease_base_url=args.netease_base_url,
            sidecar_client=sidecar_client,
            sidecar_providers=sidecar_providers,
        )
    finally:
        close_metadata_sidecar_client(sidecar_client)
    if args.download and result.get("best", {}).get("imageUrl"):
        download_image(result["best"]["imageUrl"], resolve_path(args.download), args.request_timeout_ms)
        result["downloadedTo"] = str(resolve_path(args.download))
    print(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True))
    if not result.get("best"):
        raise SystemExit(2)


def process_coverage_song(
    song,
    providers,
    search_limit,
    request_timeout_ms,
    netease_base_url=DEFAULT_NETEASE_BASE_URL,
    sidecar_client=None,
    sidecar_providers=None,
):
    try:
        cover = find_cover(
            song,
            providers,
            search_limit,
            request_timeout_ms,
            DEFAULT_IMAGE_SIZE,
            netease_base_url,
            sidecar_client=sidecar_client,
            sidecar_providers=sidecar_providers,
        )
        if cover:
            return {"status": "found", "provider": cover["provider"]}
        return {"status": "not_found"}
    except Exception as error:
        return {"status": "failed", "error": str(error)[:500]}


def iter_song_task_results(songs, worker, concurrency=1, delay_ms=0):
    concurrency = max(1, int(concurrency))
    delay_seconds = max(0, int(delay_ms)) / 1000
    if concurrency == 1:
        for index, song in enumerate(songs):
            yield worker(song)
            if delay_seconds and index < len(songs) - 1:
                time.sleep(delay_seconds)
        return

    song_iter = iter(songs)
    in_flight = set()
    submitted = 0

    def submit_next(executor):
        nonlocal submitted
        try:
            song = next(song_iter)
        except StopIteration:
            return False
        if delay_seconds and submitted > 0:
            time.sleep(delay_seconds)
        in_flight.add(executor.submit(worker, song))
        submitted += 1
        return True

    with ThreadPoolExecutor(max_workers=concurrency) as executor:
        while len(in_flight) < concurrency and submit_next(executor):
            pass
        while in_flight:
            done, in_flight = wait(in_flight, return_when=FIRST_COMPLETED)
            for future in done:
                yield future.result()
                submit_next(executor)


def run_song_tasks(songs, worker, concurrency=1, delay_ms=0):
    return list(iter_song_task_results(songs, worker, concurrency, delay_ms))


def print_status(args):
    media_root = resolve_media_root(args)
    output = resolve_output_path(args, media_root)
    state_path = resolve_state_path(args, output)
    history = read_history(output)
    summary = summarize_history(history)
    db_summary = query_cover_summary(args)
    print(json.dumps({"database": db_summary, "history": summary, "output": str(output)}, ensure_ascii=False, sort_keys=True))
    if state_path.exists():
        print(state_path.read_text(encoding="utf-8").strip())


def decide_song_action(
    song,
    history,
    cover_root,
    public_base_url,
    retry_failed=False,
    retry_not_found=False,
    force=False,
):
    song_id = song["id"]
    desired_url = public_cover_url(public_base_url, song_id)
    existing_url = clean(song.get("coverImageUrl"))
    local_path = cover_file_path(cover_root, song_id)

    if local_path.exists() and not force:
        if existing_url == desired_url:
            return SongActionDecision("skip", public_url=desired_url, reason="local-cover-ready")
        return SongActionDecision("repair", public_url=desired_url, reason="local-cover-db-url-mismatch")

    latest = history.get(song_id) or {}
    latest_status = latest.get("status")
    if not force:
        if latest_status == "failed" and not retry_failed:
            return SongActionDecision("skip", reason="previously-failed")
        if latest_status == "not_found" and not retry_not_found:
            return SongActionDecision("skip", reason="previously-not-found")

    external_url = existing_url if looks_like_external_image_url(existing_url, desired_url) else None
    return SongActionDecision("fetch", public_url=desired_url, external_url=external_url)


def cover_file_path(cover_root, song_id):
    safe_song_id = safe_file_song_id(song_id)
    return Path(cover_root) / "nas" / f"{safe_song_id}.jpg"


def public_cover_url(public_base_url, song_id):
    safe_song_id = safe_file_song_id(song_id)
    prefix = clean(public_base_url).rstrip("/")
    if not prefix:
        raise ValueError("PUBLIC_BASE_URL or --public-base-url is required for local cover URLs")
    return f"{prefix}/media/covers/nas/{urllib.parse.quote(safe_song_id)}.jpg"


def safe_file_song_id(song_id):
    value = clean(song_id)
    if not SAFE_SONG_ID.match(value):
        raise ValueError(f"Unsafe song id for cover path: {song_id}")
    return value


def looks_like_external_image_url(url, desired_url):
    return (url.startswith("http://") or url.startswith("https://")) and url != desired_url


def invoke_search_provider(
    provider,
    song,
    search_limit,
    timeout_ms,
    netease_base_url,
    sidecar_client=None,
    sidecar_providers=None,
):
    if sidecar_client is None and sidecar_providers is None:
        return search_provider(provider, song, search_limit, timeout_ms, netease_base_url)
    try:
        return search_provider(
            provider,
            song,
            search_limit,
            timeout_ms,
            netease_base_url,
            sidecar_client=sidecar_client,
            sidecar_providers=sidecar_providers,
        )
    except TypeError as error:
        if "unexpected keyword argument" not in str(error):
            raise
        return search_provider(provider, song, search_limit, timeout_ms, netease_base_url)


def find_cover(
    song,
    providers,
    search_limit,
    timeout_ms,
    image_size,
    netease_base_url=DEFAULT_NETEASE_BASE_URL,
    sidecar_client=None,
    sidecar_providers=None,
):
    last_error = None
    completed_provider_count = 0
    searched = []
    for provider in providers:
        try:
            candidates = invoke_search_provider(
                provider,
                song,
                search_limit,
                timeout_ms,
                netease_base_url,
                sidecar_client,
                sidecar_providers,
            )
            completed_provider_count += 1
            searched.append({"provider": provider, "candidates": candidates})
            cover = resolve_best_cover_for_modes(song, provider, candidates, ("title_artist",), image_size, timeout_ms)
            if cover:
                return cover
        except Exception as error:
            last_error = error
            continue
    if last_error and completed_provider_count == 0:
        raise last_error

    for result in searched:
        cover = resolve_best_cover_for_modes(
            song,
            result["provider"],
            result["candidates"],
            ("title",),
            image_size,
            timeout_ms,
        )
        if cover:
            return cover
    return None


def probe_cover(
    title,
    artist,
    providers,
    search_limit,
    timeout_ms,
    image_size,
    netease_base_url=DEFAULT_NETEASE_BASE_URL,
    sidecar_client=None,
    sidecar_providers=None,
):
    song = {"title": title, "artistName": artist}
    candidates_by_provider = []
    provider_errors = {}
    for provider in providers:
        try:
            candidates = invoke_search_provider(
                provider,
                song,
                search_limit,
                timeout_ms,
                netease_base_url,
                sidecar_client,
                sidecar_providers,
            )
            candidates_by_provider.append({"provider": provider, "candidates": candidates})
            cover = resolve_best_cover_for_modes(song, provider, candidates, ("title_artist",), image_size, timeout_ms)
            if cover:
                return {
                    "query": {"title": clean(title), "artist": clean(artist), "providers": providers},
                    "best": cover,
                    "providers": candidates_by_provider,
                    "providerErrors": provider_errors,
                }
        except Exception as error:
            provider_errors[provider] = str(error)[:300]
            continue

    for result in candidates_by_provider:
        cover = resolve_best_cover_for_modes(
            song,
            result["provider"],
            result["candidates"],
            ("title",),
            image_size,
            timeout_ms,
        )
        if cover:
            return {
                "query": {"title": clean(title), "artist": clean(artist), "providers": providers},
                "best": cover,
                "providers": candidates_by_provider,
                "providerErrors": provider_errors,
            }

    return {
        "query": {"title": clean(title), "artist": clean(artist), "providers": providers},
        "best": None,
        "providers": candidates_by_provider,
        "providerErrors": provider_errors,
    }


def search_provider(
    provider,
    song,
    search_limit,
    timeout_ms,
    netease_base_url=DEFAULT_NETEASE_BASE_URL,
    sidecar_client=None,
    sidecar_providers=None,
):
    if sidecar_client and provider in (sidecar_providers or set()):
        try:
            result = sidecar_client.request(
                "searchCandidates",
                {
                    "provider": provider,
                    "title": song.get("title") or "",
                    "artist": song.get("artistName") or "",
                    "limit": search_limit,
                },
            )
            candidates = result.get("candidates") or []
            if isinstance(candidates, list):
                return candidates
        except Exception:
            pass
    if provider == "netease":
        return search_netease(song, search_limit, timeout_ms, netease_base_url)
    if provider == "cloud":
        return search_cloud(song, search_limit, timeout_ms)
    if provider == "tencent":
        return search_tencent(song, search_limit, timeout_ms)
    if provider == "kugou":
        return search_kugou(song, search_limit, timeout_ms)
    if provider == "kuwo":
        return search_kuwo(song, search_limit, timeout_ms)
    if provider == "spotify":
        return search_spotify(song, search_limit, timeout_ms)
    raise ValueError(f"Unsupported provider: {provider}")


def search_netease(song, search_limit, timeout_ms, base_url=DEFAULT_NETEASE_BASE_URL):
    payload = fetch_json(
        f"{clean(base_url).rstrip('/')}/cloudsearch",
        {
            "keywords": f"{song['artistName']} {song['title']}",
            "type": 1,
            "limit": search_limit,
        },
        timeout_ms=timeout_ms,
    )
    rows = ((payload or {}).get("result") or {}).get("songs") or []
    candidates = []
    for row in rows:
        candidate = parse_netease_candidate(row)
        if candidate["providerSongId"] and not candidate["imageUrl"]:
            detail = fetch_netease_detail(base_url, candidate["providerSongId"], timeout_ms)
            if detail.get("imageUrl"):
                candidate = {**candidate, **detail}
        candidates.append(candidate)
    return candidates


def fetch_netease_detail(base_url, song_id, timeout_ms):
    payload = fetch_json(
        f"{clean(base_url).rstrip('/')}/song/detail",
        {"ids": song_id},
        timeout_ms=timeout_ms,
    )
    songs = (payload or {}).get("songs") or []
    return parse_netease_candidate(songs[0]) if songs else {}


def parse_netease_candidate(row):
    album = row.get("al") or {}
    singers = row.get("ar") or []
    song_id = clean(row.get("id"))
    return {
        "provider": "netease",
        "providerSongId": song_id,
        "title": strip_html(clean(row.get("name"))),
        "artistNames": [clean(item.get("name")) for item in singers if clean(item.get("name"))],
        "albumName": strip_html(clean(album.get("name"))),
        "picId": song_id,
        "imageUrl": clean(album.get("picUrl")),
    }


def search_cloud(song, search_limit, timeout_ms):
    payload = fetch_json(
        "https://music.163.com/api/search/get/web",
        {
            "s": sanitize_keyword(f"{song['artistName']} {song['title']}"),
            "type": 1,
            "offset": 0,
            "total": "true",
            "limit": search_limit,
        },
        timeout_ms=timeout_ms,
        method="POST",
    )
    rows = ((payload or {}).get("result") or {}).get("songs") or []
    candidates = []
    for row in rows:
        song_id = clean(row.get("id"))
        detail = fetch_cloud_detail(song_id, timeout_ms) if song_id else {}
        album = detail.get("album") if isinstance(detail.get("album"), dict) else row.get("album") or {}
        singers = detail.get("artists") if isinstance(detail.get("artists"), list) else row.get("artists") or []
        candidates.append(
            {
                "provider": "cloud",
                "providerSongId": song_id,
                "title": strip_html(clean(detail.get("name") or row.get("name"))),
                "artistNames": [clean(item.get("name")) for item in singers if clean(item.get("name"))],
                "albumName": strip_html(clean(album.get("name"))),
                "imageUrl": clean(album.get("picUrl")),
            }
        )
    return candidates


def fetch_cloud_detail(song_id, timeout_ms):
    payload = fetch_json(
        "http://music.163.com/api/song/detail/",
        {
            "id": song_id,
            "ids": f"[{song_id}]",
        },
        timeout_ms=timeout_ms,
        method="POST",
    )
    songs = (payload or {}).get("songs") or []
    return songs[0] if songs else {}


def search_tencent(song, search_limit, timeout_ms):
    payload = fetch_json(
        "https://c.y.qq.com/soso/fcgi-bin/client_search_cp",
        {
            "format": "json",
            "p": 1,
            "n": search_limit,
            "w": f"{song['artistName']} {song['title']}",
            "aggr": 1,
            "lossless": 1,
            "cr": 1,
            "new_json": 1,
        },
        headers={"Referer": "http://y.qq.com"},
        timeout_ms=timeout_ms,
    )
    rows = (((payload or {}).get("data") or {}).get("song") or {}).get("list") or []
    candidates = []
    for row in rows:
        album = row.get("album") or {}
        singers = row.get("singer") or []
        candidates.append(
            {
                "provider": "tencent",
                "providerSongId": clean(row.get("mid")),
                "title": strip_html(clean(row.get("name"))),
                "artistNames": [clean(item.get("name")) for item in singers if clean(item.get("name"))],
                "albumName": strip_html(clean(album.get("title"))),
                "picId": clean(album.get("mid")),
            }
        )
    return candidates


def search_kugou(song, search_limit, timeout_ms):
    payload = fetch_json(
        "http://mobilecdn.kugou.com/api/v3/search/song",
        {
            "api_ver": 1,
            "area_code": 1,
            "correct": 1,
            "pagesize": search_limit,
            "plat": 2,
            "tag": 1,
            "sver": 5,
            "showtype": 10,
            "page": 1,
            "keyword": f"{song['artistName']} {song['title']}",
            "version": 8990,
        },
        headers={"User-Agent": "IPhone-8990-searchSong"},
        timeout_ms=timeout_ms,
    )
    rows = ((payload or {}).get("data") or {}).get("info") or []
    candidates = []
    for row in rows:
        file_name = clean(row.get("filename") or row.get("fileName"))
        title = clean(row.get("songName")) or parse_kugou_title(file_name)
        artists = []
        if isinstance(row.get("authors"), list):
            artists = [clean(item.get("author_name")) for item in row["authors"] if clean(item.get("author_name"))]
        if not artists:
            artists = parse_kugou_artists(file_name)
        candidates.append(
            {
                "provider": "kugou",
                "providerSongId": clean(row.get("hash")),
                "title": strip_html(title),
                "artistNames": artists,
                "albumName": strip_html(clean(row.get("album_name"))),
                "picId": clean(row.get("hash")),
            }
        )
    return candidates


def search_kuwo(song, search_limit, timeout_ms):
    payload = fetch_json(
        "http://www.kuwo.cn/api/www/search/searchMusicBykeyWord",
        {
            "key": f"{song['artistName']} {song['title']}",
            "pn": 1,
            "rn": search_limit,
            "httpsStatus": 1,
        },
        headers=kuwo_headers(),
        timeout_ms=timeout_ms,
    )
    rows = ((payload or {}).get("data") or {}).get("list") or []
    candidates = []
    for row in rows:
        rid = clean(row.get("rid"))
        candidates.append(
            {
                "provider": "kuwo",
                "providerSongId": rid,
                "title": strip_html(clean(row.get("name"))),
                "artistNames": [strip_html(name) for name in clean(row.get("artist")).split("&") if clean(name)],
                "albumName": strip_html(clean(row.get("album"))),
                "picId": rid,
            }
        )
    return candidates


def search_spotify(song, search_limit, timeout_ms):
    candidates = fetch_spotify_search_tracks(song, search_limit, timeout_ms)
    if not candidates:
        return []

    try:
        client = create_spotify_client()
    except Exception:
        return candidates

    hydrated = []
    try:
        for candidate in candidates[:search_limit]:
            try:
                track_data = client.get_track_info(candidate["trackUrl"])
                hydrated.append(parse_spotify_track_info(track_data, candidate))
            except Exception:
                hydrated.append(candidate)
    finally:
        close = getattr(client, "close", None)
        if callable(close):
            close()
    return hydrated


def create_spotify_client():
    try:
        from spotify_scraper import SpotifyClient
    except ImportError as error:
        raise RuntimeError("spotifyscraper is not installed; run: python3 -m pip install spotifyscraper") from error
    return SpotifyClient(browser_type="requests", log_level="ERROR")


def fetch_spotify_search_tracks(song, search_limit, timeout_ms):
    token = fetch_spotify_access_token(timeout_ms)
    payload = fetch_json_body(
        SPOTIFY_PATHFINDER_URL,
        {
            "variables": {
                "query": sanitize_keyword(f"{song['artistName']} {song['title']}"),
                "limit": search_limit,
                "numberOfTopResults": max(search_limit, 10),
                "offset": 0,
                "includeAuthors": False,
                "includeAlbumPreReleases": False,
                "includeEpisodeContentRatingsV2": False,
            },
            "operationName": SPOTIFY_SEARCH_OPERATION,
            "extensions": {"persistedQuery": {"version": 1, "sha256Hash": SPOTIFY_SEARCH_HASH}},
        },
        headers={
            "Authorization": f"Bearer {token}",
            "App-Platform": "WebPlayer",
            "Referer": "https://open.spotify.com/",
        },
        timeout_ms=timeout_ms,
    )
    return parse_spotify_search_tracks(payload, search_limit)


def fetch_spotify_access_token(timeout_ms):
    now_ms = int(time.time() * 1000)
    if SPOTIFY_ACCESS_TOKEN_CACHE["token"] and SPOTIFY_ACCESS_TOKEN_CACHE["expiresAt"] > now_ms + 60000:
        return SPOTIFY_ACCESS_TOKEN_CACHE["token"]
    token_data = parse_spotify_access_token(
        fetch_text(
            f"https://open.spotify.com/embed/track/{SPOTIFY_TOKEN_TRACK_ID}",
            headers={"Accept": "text/html,*/*"},
            timeout_ms=timeout_ms,
        )
    )
    SPOTIFY_ACCESS_TOKEN_CACHE["token"] = token_data["token"]
    SPOTIFY_ACCESS_TOKEN_CACHE["expiresAt"] = token_data.get("expiresAt") or 0
    return token_data["token"]


def parse_spotify_access_token(html_text):
    match = re.search(r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>', html_text, re.S)
    if not match:
        raise RuntimeError("Spotify embed page did not include __NEXT_DATA__")
    payload = json.loads(html.unescape(match.group(1)))
    session = (
        (((payload.get("props") or {}).get("pageProps") or {}).get("state") or {}).get("settings") or {}
    ).get("session") or {}
    token = clean(session.get("accessToken"))
    if not token:
        raise RuntimeError("Spotify embed page did not include an anonymous access token")
    return {"token": token, "expiresAt": int(session.get("accessTokenExpirationTimestampMs") or 0)}


def parse_spotify_search_tracks(payload, search_limit):
    search = ((payload or {}).get("data") or {}).get("searchV2") or {}
    nodes = []
    for row in (((search.get("topResultsV2") or {}).get("itemsV2")) or []):
        node = (((row or {}).get("item") or {}).get("data")) or {}
        if node.get("__typename") == "Track":
            nodes.append(node)
    for row in (((search.get("tracksV2") or {}).get("items")) or []):
        node = (((row or {}).get("item") or {}).get("data")) or {}
        if node.get("__typename") == "Track":
            nodes.append(node)

    candidates = []
    seen = set()
    for node in nodes:
        candidate = parse_spotify_track_node(node)
        song_id = candidate.get("providerSongId")
        if not song_id or song_id in seen:
            continue
        seen.add(song_id)
        candidates.append(candidate)
        if len(candidates) >= search_limit:
            break
    return candidates


def parse_spotify_track_node(node):
    song_id = clean(node.get("id")) or spotify_id_from_uri(node.get("uri"))
    album = node.get("albumOfTrack") or node.get("album") or {}
    artist_names = []
    artists = node.get("artists") or {}
    if isinstance(artists, dict):
        artist_rows = artists.get("items") or []
    else:
        artist_rows = artists if isinstance(artists, list) else []
    for artist in artist_rows:
        profile = artist.get("profile") or {}
        name = clean(profile.get("name") or artist.get("name"))
        if name:
            artist_names.append(name)
    return {
        "provider": "spotify",
        "providerSongId": song_id,
        "title": strip_html(clean(node.get("name"))),
        "artistNames": artist_names,
        "albumName": strip_html(clean(album.get("name"))),
        "imageUrl": select_largest_image_url(((album.get("coverArt") or {}).get("sources")) or album.get("images") or []),
        "trackUrl": spotify_track_url(song_id),
    }


def parse_spotify_track_info(track_data, fallback=None):
    fallback = fallback or {}
    song_id = clean(track_data.get("id")) or spotify_id_from_uri(track_data.get("uri")) or clean(fallback.get("providerSongId"))
    album = track_data.get("album") or {}
    return {
        "provider": "spotify",
        "providerSongId": song_id,
        "title": strip_html(clean(track_data.get("name") or track_data.get("title") or fallback.get("title"))),
        "artistNames": spotify_track_artist_names(track_data) or list(fallback.get("artistNames") or []),
        "albumName": strip_html(clean(album.get("name") or fallback.get("albumName"))),
        "imageUrl": select_largest_image_url(album.get("images") or spotify_visual_identity_images(track_data))
        or clean(fallback.get("imageUrl")),
        "trackUrl": clean(fallback.get("trackUrl")) or spotify_track_url(song_id),
    }


def spotify_track_artist_names(track_data):
    names = []
    for artist in track_data.get("artists") or []:
        profile = artist.get("profile") or {}
        name = clean(artist.get("name") or profile.get("name"))
        if name:
            names.append(name)
    return names


def spotify_visual_identity_images(track_data):
    visual_identity = track_data.get("visualIdentity") or {}
    rows = visual_identity.get("image") or []
    return [
        {
            "url": row.get("url"),
            "width": row.get("width") or row.get("maxWidth"),
            "height": row.get("height") or row.get("maxHeight"),
        }
        for row in rows
    ]


def select_largest_image_url(images):
    if not isinstance(images, list):
        return ""
    valid = [row for row in images if isinstance(row, dict) and clean(row.get("url"))]
    valid.sort(key=lambda row: int(row.get("width") or row.get("maxWidth") or row.get("height") or row.get("maxHeight") or 0))
    return clean(valid[-1].get("url")) if valid else ""


def spotify_track_url(song_id):
    return f"https://open.spotify.com/track/{urllib.parse.quote(clean(song_id))}" if clean(song_id) else ""


def spotify_id_from_uri(uri):
    value = clean(uri)
    return value.rsplit(":", 1)[-1] if value.startswith("spotify:track:") else ""


def resolve_provider_image_url(provider, candidate, image_size, timeout_ms):
    direct_image_url = clean(candidate.get("imageUrl"))
    if direct_image_url:
        return direct_image_url
    pic_id = clean(candidate.get("picId"))
    if provider in ("netease", "cloud", "spotify"):
        return ""
    if not pic_id:
        return ""
    if provider == "tencent":
        return f"https://y.gtimg.cn/music/photo_new/T002R{image_size}x{image_size}M000{pic_id}.jpg?max_age=2592000"
    if provider == "kugou":
        payload = fetch_json(
            "http://m.kugou.com/app/i/getSongInfo.php",
            {"cmd": "playInfo", "hash": pic_id, "from": "mkugou"},
            headers={"User-Agent": "IPhone-8990-searchSong"},
            timeout_ms=timeout_ms,
        )
        return normalize_image_template(clean((payload or {}).get("imgUrl") or (payload or {}).get("album_img")), "400")
    if provider == "kuwo":
        payload = fetch_json(
            "http://www.kuwo.cn/api/www/music/musicInfo",
            {"mid": pic_id, "httpsStatus": 1},
            headers=kuwo_headers(),
            timeout_ms=timeout_ms,
        )
        data = (payload or {}).get("data") or {}
        return clean(data.get("pic") or data.get("albumpic"))
    return ""


def resolve_best_cover_for_modes(song, provider, candidates, match_modes, image_size, timeout_ms):
    match = select_best_cover_candidate(song, candidates, match_modes)
    if not match:
        return None
    image_url = resolve_provider_image_url(provider, match, image_size, timeout_ms)
    return {**match, "imageUrl": image_url} if image_url else None


def select_best_cover_candidate(song, candidates, match_modes=("title_artist", "title")):
    scored = []
    for match_mode in match_modes:
        scored = score_cover_candidates(song, candidates, match_mode=match_mode)
        if scored:
            break
    scored.sort(key=lambda item: (-item["confidence"], item.get("title") or ""))
    return scored[0] if scored else None


def score_cover_candidates(song, candidates, match_mode):
    scored = []
    for candidate in candidates:
        confidence = score_cover_candidate(song, candidate, match_mode)
        if confidence >= cover_match_threshold(match_mode):
            scored.append({**candidate, "confidence": confidence, "matchMode": match_mode})
    return scored


def score_cover_candidate(song, candidate, match_mode="title_artist"):
    title_score = score_title(song.get("title") or "", candidate.get("title") or "")
    if title_score == 0:
        return 0

    artist_score = 0
    if match_mode == "title_artist":
        artist_score = score_artist(song.get("artistName") or "", candidate.get("artistNames") or [])
        if artist_score == 0:
            return 0

    variant_penalty = 18 if looks_like_variant(candidate) and not looks_like_variant(song) else 0
    missing_image_penalty = 0 if candidate_has_cover_hint(candidate) else 50
    return max(0, min(100, title_score + artist_score - variant_penalty - missing_image_penalty))


def cover_match_threshold(match_mode):
    return 75 if match_mode == "title_artist" else 38


def candidate_has_cover_hint(candidate):
    return bool(clean(candidate.get("picId") or candidate.get("imageUrl") or candidate.get("trackUrl")))


def score_title(target_title, candidate_title):
    target = normalize_title(target_title)
    candidate = normalize_title(candidate_title)
    if not target or not candidate:
        return 0
    if target == candidate:
        return 60
    if candidate.startswith(target) or target.startswith(candidate):
        return 46
    if target in candidate or candidate in target:
        return 38
    return 0


def score_artist(target_artist_name, candidate_artist_names):
    target_artists = split_artist_names(target_artist_name)
    candidates = []
    for value in candidate_artist_names:
        candidates.extend(split_artist_names(value))
    if not target_artists or not candidates:
        return 0
    for target in target_artists:
        if target in candidates:
            return 40
    for target in target_artists:
        if any(target in candidate or candidate in target for candidate in candidates):
            return 28
    return 0


def normalize_title(value):
    normalized = normalize_base(value)
    normalized = re.sub(r"[（(【[].*?[）)】\]]", "", normalized)
    normalized = re.sub(r"(完整版|正式版|原版|原唱版|高清版|ktv版)$", "", normalized, flags=re.IGNORECASE)
    return normalized


def normalize_artist(value):
    return re.sub(r"(原唱|歌手)$", "", normalize_base(value))


def normalize_base(value):
    return (
        html.unescape(clean(value))
        .lower()
        .replace("周杰伦.-", "周杰伦")
        .translate(str.maketrans("", "", "·.．-_/:：'\"“”‘’!?！？ \t\r\n"))
        .strip()
    )


def split_artist_names(value):
    return [normalize_artist(part) for part in re.split(r"[/／,，、&＆+＋|｜;；\s]+", clean(value)) if normalize_artist(part)]


def looks_like_variant(value):
    return re.search(r"(dj|live|remix|伴奏|纯音乐|翻唱|现场|演唱会|串烧|片段|抖音)", f"{value.get('title', '')} {value.get('albumName', '')}", re.I) is not None


def parse_kugou_title(file_name):
    parts = file_name.split(" - ", 1)
    return parts[1] if len(parts) == 2 else file_name


def parse_kugou_artists(file_name):
    parts = file_name.split(" - ", 1)
    return [part.strip() for part in parts[0].split("、") if part.strip()] if len(parts) == 2 else []


def download_image(url, destination, timeout_ms):
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 HomeKTVCoverFetcher/0.1",
            "Accept": "image/jpeg,image/png,image/webp,image/gif,*/*;q=0.8",
        },
        method="GET",
    )
    with urllib.request.urlopen(request, timeout=timeout_ms / 1000) as response:
        data = response.read(MAX_IMAGE_BYTES + 1)
        content_type = response.headers.get("content-type", "")
    if len(data) > MAX_IMAGE_BYTES:
        raise RuntimeError("cover image is too large")
    if not is_supported_image(data, content_type):
        raise RuntimeError(f"downloaded cover is not a supported image: {content_type}")
    destination.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=destination.parent, delete=False) as temp_file:
        temp_file.write(data)
        temp_path = Path(temp_file.name)
    temp_path.replace(destination)


def is_supported_image(data, _content_type):
    return (
        data.startswith(b"\xff\xd8\xff")
        or data.startswith(b"\x89PNG\r\n\x1a\n")
        or data.startswith(b"RIFF") and data[8:12] == b"WEBP"
        or data.startswith(b"GIF87a")
        or data.startswith(b"GIF89a")
    )


def fetch_json(url, params, headers=None, timeout_ms=8000, method="GET"):
    query = urllib.parse.urlencode(params)
    separator = "&" if "?" in url else "?"
    normalized_method = method.upper()
    request = urllib.request.Request(
        f"{url}{separator}{query}",
        data=b"" if normalized_method == "POST" else None,
        headers={
            "User-Agent": "Mozilla/5.0 HomeKTVCoverFetcher/0.1",
            "Accept": "application/json,text/plain,*/*",
            **(headers or {}),
        },
        method=normalized_method,
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout_ms / 1000) as response:
            text = response.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")[:300]
        raise RuntimeError(f"HTTP {error.code} from {url}: {detail}") from error
    return json.loads(text)


def fetch_json_body(url, body, headers=None, timeout_ms=8000):
    request = urllib.request.Request(
        url,
        data=json.dumps(body, ensure_ascii=False).encode("utf-8"),
        headers={
            "User-Agent": "Mozilla/5.0 HomeKTVCoverFetcher/0.1",
            "Accept": "application/json,text/plain,*/*",
            "Content-Type": "application/json;charset=UTF-8",
            **(headers or {}),
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout_ms / 1000) as response:
            text = response.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")[:300]
        raise RuntimeError(f"HTTP {error.code} from {url}: {detail}") from error
    return json.loads(text)


def fetch_text(url, headers=None, timeout_ms=8000):
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 HomeKTVCoverFetcher/0.1",
            "Accept": "text/html,*/*",
            **(headers or {}),
        },
        method="GET",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout_ms / 1000) as response:
            return response.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")[:300]
        raise RuntimeError(f"HTTP {error.code} from {url}: {detail}") from error


def kuwo_headers():
    return {
        "Cookie": "kw_token=3E7JFQ7MRPL",
        "csrf": "3E7JFQ7MRPL",
        "Host": "www.kuwo.cn",
        "Referer": "http://www.kuwo.cn/",
    }


def select_candidate_songs(args, random_order=False, public_base_url=""):
    limit_sql = "" if args.limit == 0 else f"LIMIT {int(args.limit)}"
    order_sql = "ORDER BY random()" if random_order else "ORDER BY cover_updated_at ASC NULLS FIRST, updated_at DESC, id ASC"
    fetch_where_sql = ""
    if getattr(args, "command", "") == "fetch" and not getattr(args, "full_scan", False):
        desired_prefix = clean(public_base_url).rstrip("/")
        if not desired_prefix:
            raise ValueError("PUBLIC_BASE_URL or --public-base-url is required for fetch candidate selection")
        fetch_where_sql = f"""
  AND (
    cover_updated_at IS NULL
    OR cover_image_url IS NULL
    OR trim(cover_image_url) = ''
    OR cover_image_url <> {sql_literal(f"{desired_prefix}/media/covers/nas/")} || id || '.jpg'
  )
""".rstrip()
    sql = f"""
SELECT json_build_object(
  'id', id,
  'title', title,
  'artistName', primary_artist_name,
  'coverImageUrl', cover_image_url
)::text
FROM ktv_songs
WHERE missing_at IS NULL
  AND trim(title) <> ''
  AND trim(primary_artist_name) <> ''
{fetch_where_sql}
{order_sql}
{limit_sql}
""".strip()
    return [json.loads(line) for line in run_psql_lines(sql, args)]


def query_cover_summary(args):
    sql = """
SELECT json_build_object(
  'activeSongs', count(*),
  'withCoverUrl', count(*) FILTER (WHERE cover_image_url IS NOT NULL),
  'withoutCoverUrl', count(*) FILTER (WHERE cover_image_url IS NULL),
  'processed', count(*) FILTER (WHERE cover_updated_at IS NOT NULL)
)::text
FROM ktv_songs
WHERE missing_at IS NULL
""".strip()
    lines = run_psql_lines(sql, args)
    return json.loads(lines[0]) if lines else {}


def update_cover_url(args, song_id, cover_url):
    sql = f"""
UPDATE ktv_songs
SET cover_image_url = {sql_literal(cover_url)},
    cover_updated_at = now(),
    updated_at = now()
WHERE id = {sql_literal(song_id)}
""".strip()
    run_psql_script(sql, args)


def touch_cover_processed(args, song_id):
    sql = f"""
UPDATE ktv_songs
SET cover_updated_at = now(),
    updated_at = now()
WHERE id = {sql_literal(song_id)}
  AND cover_image_url IS NULL
""".strip()
    run_psql_script(sql, args)


def run_psql_lines(sql, args):
    result = run_psql(["-At", "-c", sql], args, capture=True)
    return [line for line in result.stdout.splitlines() if line.strip()]


def run_psql_script(sql, args):
    run_psql(["-v", "ON_ERROR_STOP=1", "-f", "-"], args, capture=False, input_text=sql)


def run_psql(psql_args, args, capture, input_text=None):
    command = build_psql_command(args) + psql_args
    result = subprocess.run(
        command,
        input=input_text,
        text=True,
        encoding="utf-8",
        stdout=subprocess.PIPE if capture else None,
        stderr=subprocess.PIPE if capture else None,
        check=False,
    )
    if result.returncode != 0:
        stderr = (result.stderr or "").strip()
        raise RuntimeError(stderr or f"psql failed with code {result.returncode}")
    return result


def build_psql_command(args):
    container = clean(args.postgres_container) or detect_postgres_container()
    if container:
        return ["docker", "exec", "-i", container, "psql", "-U", args.db_user, "-d", args.db_name]
    if shutil.which("psql"):
        return ["psql", resolve_database_url(args)]
    raise RuntimeError("psql is not installed and no Postgres container was found; pass --postgres-container")


def detect_postgres_container():
    if shutil.which("docker") is None:
        return ""
    try:
        result = subprocess.run(
            ["docker", "ps", "--format", "{{.Names}}"],
            text=True,
            encoding="utf-8",
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            check=False,
        )
    except OSError:
        return ""
    if result.returncode != 0:
        return ""
    names = [line.strip() for line in result.stdout.splitlines() if line.strip()]
    for name in ("home-ktv-postgres-1", "home-ktv-postgres"):
        if name in names:
            return name
    for name in names:
        if "home-ktv" in name and "postgres" in name:
            return name
    return ""


def resolve_database_url(args):
    database_url = clean(args.database_url) or clean(os.environ.get("DATABASE_URL"))
    if not database_url:
        raise RuntimeError("DATABASE_URL or --database-url is required")
    return database_url


def resolve_media_root(args):
    value = clean(args.media_root) or clean(os.environ.get("MEDIA_ROOT")) or clean(os.environ.get("DOCKER_MEDIA_ROOT"))
    return resolve_path(value or str(ROOT_DIR / "runtime" / "media"))


def resolve_cover_root(args, media_root):
    value = clean(args.cover_root)
    return resolve_path(value) if value else Path(media_root) / "covers"


def resolve_output_path(args, media_root):
    if clean(args.output):
        return resolve_path(args.output)
    job_root = clean(os.environ.get("KTV_COVER_JOB_ROOT"))
    root = resolve_path(job_root) if job_root else Path(media_root) / "covers" / "_jobs"
    return root / "song-covers.jsonl"


def resolve_state_path(args, output):
    if clean(args.state):
        return resolve_path(args.state)
    return Path(f"{output}.state.json")


def resolve_public_base_url(args):
    return clean(args.public_base_url) or clean(os.environ.get("PUBLIC_BASE_URL"))


def read_history(path):
    history = {}
    path = Path(path)
    if not path.exists():
        return history
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        try:
            row = json.loads(line)
        except json.JSONDecodeError:
            continue
        song_id = clean(row.get("songId"))
        if song_id:
            history[song_id] = row
    return history


def summarize_history(history):
    summary = {}
    for row in history.values():
        status = clean(row.get("status")) or "unknown"
        summary[status] = summary.get(status, 0) + 1
    return summary


def append_jsonl(path, row):
    ensure_parent(path)
    with Path(path).open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n")


def write_state(path, payload):
    ensure_parent(path)
    Path(path).write_text(json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True), encoding="utf-8")


def load_env_file(path):
    env_path = Path(path)
    if not env_path.exists() and str(path).endswith("deploy/source/.env"):
        env_path = ROOT_DIR / "deploy" / "docker" / ".env"
    if not env_path.exists():
        return
    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip("\"'")
        if key and key not in os.environ:
            os.environ[key] = value


def ensure_parent(path):
    Path(path).parent.mkdir(parents=True, exist_ok=True)


def resolve_path(value):
    path = Path(value).expanduser()
    return path if path.is_absolute() else ROOT_DIR / path


def read_provider_list(value):
    providers = [item.strip() for item in clean(value).split(",") if item.strip()]
    for provider in providers:
        if provider not in DEFAULT_PROVIDERS:
            raise ValueError(f"Unsupported provider: {provider}")
    return providers or list(DEFAULT_PROVIDERS)


def read_metadata_sidecar_provider_set(value):
    providers = [item.strip() for item in clean(value).split(",") if item.strip()]
    for provider in providers:
        if provider not in DEFAULT_METADATA_SIDECAR_PROVIDERS:
            raise ValueError(f"Unsupported metadata sidecar provider: {provider}")
    return set(providers or DEFAULT_METADATA_SIDECAR_PROVIDERS)


def try_create_metadata_sidecar_client(args, default_timeout_seconds):
    if getattr(args, "disable_metadata_sidecar", False):
        return None
    try:
        return create_metadata_sidecar_client(
            args.metadata_sidecar_command,
            cwd=ROOT_DIR,
            default_timeout_seconds=default_timeout_seconds,
        )
    except Exception as error:
        print(f"metadata-sidecar disabled: {error}", file=sys.stderr, flush=True)
        return None


def close_metadata_sidecar_client(client):
    if client is None:
        return
    try:
        client.close()
    except Exception:
        return


def normalize_image_template(value, size):
    return clean(value).replace("/{size}/", f"/{size}/").replace("{size}", size)


def sanitize_keyword(value):
    return re.sub(r"[!@#$%^&*/]+", "", clean(value))


def sql_literal(value):
    return "'" + clean(value).replace("'", "''") + "'"


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def clean(value):
    return "" if value is None else str(value).strip()


def strip_html(value):
    return re.sub(r"<[^>]+>", "", html.unescape(clean(value))).strip()


def positive_int(value):
    parsed = int(value)
    if parsed <= 0:
        raise argparse.ArgumentTypeError("must be positive")
    return parsed


def non_negative_int(value):
    parsed = int(value)
    if parsed < 0:
        raise argparse.ArgumentTypeError("must be non-negative")
    return parsed


if __name__ == "__main__":
    main()
