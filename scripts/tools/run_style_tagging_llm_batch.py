#!/usr/bin/env python3
import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request
from concurrent.futures import FIRST_COMPLETED, ThreadPoolExecutor, wait
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse


SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from music_metadata_sidecar_client import create_metadata_sidecar_client, default_metadata_sidecar_command


SOURCE = "llm-style-v1"
PROVIDER_SOURCE = "provider-style-v1"
PLAYLIST_SOURCE = "playlist-style-v1"
DEFAULT_BATCH_SIZE = 30
DEFAULT_CONFIDENCE = 0.72
DEFAULT_PROVIDER_CONFIDENCE = 0.64
DEFAULT_PLAYLIST_CONFIDENCE = 0.68
DEFAULT_METADATA_SIDECAR_PROVIDERS = ["netease", "tencent", "kugou", "kuwo"]
DEFAULT_METADATA_SEARCH_LIMIT = 5
DEFAULT_PLAYLIST_EVIDENCE_PROVIDERS = ["netease", "kugou"]
DEFAULT_PLAYLIST_EVIDENCE_LIMIT = 10

KTV_STYLE_TAXONOMY = [
    {
        "id": "language-region",
        "name": "语种地区",
        "sortOrder": 10,
        "tags": ["国语", "粤语", "闽南语", "客家语", "英语", "日语", "韩语", "华语", "内地", "港台", "港乐", "台语"],
    },
    {
        "id": "core-genre",
        "name": "核心曲风",
        "sortOrder": 20,
        "tags": [
            "流行",
            "华语流行",
            "粤语流行",
            "摇滚",
            "流行摇滚",
            "另类摇滚",
            "独立摇滚",
            "民谣",
            "校园民谣",
            "民歌",
            "民族",
            "民族流行",
            "草原",
            "R&B",
            "灵魂乐",
            "说唱",
            "电子",
            "流行舞曲",
            "舞曲",
            "DJ",
            "迪斯科",
            "浩室",
            "放克",
            "爵士",
            "布鲁斯",
            "古典",
            "轻音乐",
            "器乐",
            "新世纪",
            "戏曲",
            "京剧",
            "黄梅戏",
            "越剧",
            "儿歌",
            "童谣",
            "宗教/佛乐",
        ],
    },
    {
        "id": "mood-theme",
        "name": "主题情绪",
        "sortOrder": 30,
        "tags": [
            "情歌",
            "甜蜜",
            "浪漫",
            "伤感",
            "失恋",
            "思念",
            "孤独",
            "治愈",
            "励志",
            "热血",
            "青春回忆",
            "怀旧",
            "亲情",
            "友情",
            "友情/兄弟",
            "爱国",
            "红歌/革命歌曲",
            "军旅",
            "思乡",
            "校园",
            "婚礼",
            "离别",
            "励志合唱",
        ],
    },
    {
        "id": "ktv-scene",
        "name": "KTV场景",
        "sortOrder": 40,
        "tags": [
            "KTV必点",
            "经典老歌",
            "冷门佳曲",
            "热门",
            "对唱",
            "合唱",
            "女生",
            "男声",
            "女声",
            "高音",
            "低音",
            "容易唱",
            "飙歌",
            "广场舞",
            "车载",
            "运动/节奏",
            "酒吧",
            "晚会",
            "春晚",
            "生日歌",
            "喜庆/节日",
            "婚礼歌曲",
            "影视金曲",
            "动漫/ACG",
        ],
    },
    {
        "id": "era-version",
        "name": "年代版本",
        "sortOrder": 50,
        "tags": [
            "50/60年代",
            "70/80年代",
            "80/90年代",
            "70后",
            "80后",
            "90后",
            "00后",
            "00年代",
            "10年代",
            "20年代",
            "现场/演唱会",
            "Live",
            "DJ版",
            "翻唱",
            "怀旧金曲",
            "网络歌曲",
        ],
    },
]

ALLOWED_TAGS = frozenset(tag for group in KTV_STYLE_TAXONOMY for tag in group["tags"])
TAG_GROUP_BY_TAG = {tag: group["name"] for group in KTV_STYLE_TAXONOMY for tag in group["tags"]}
DERIVED_HINT_RULES = [
    (re.compile(r"国语", re.IGNORECASE), ["国语"]),
    (re.compile(r"华语", re.IGNORECASE), ["华语"]),
    (re.compile(r"粤语|港乐", re.IGNORECASE), ["粤语"]),
    (re.compile(r"闽南语|台语", re.IGNORECASE), ["闽南语"]),
    (re.compile(r"客家", re.IGNORECASE), ["客家语"]),
    (re.compile(r"英语|英文", re.IGNORECASE), ["英语"]),
    (re.compile(r"日语|日文", re.IGNORECASE), ["日语"]),
    (re.compile(r"韩语|韩文", re.IGNORECASE), ["韩语"]),
    (re.compile(r"\blive\b|现场|演唱会|音乐会", re.IGNORECASE), ["Live", "现场/演唱会"]),
    (re.compile(r"\bdj\b|remix", re.IGNORECASE), ["DJ版"]),
    (re.compile(r"流行", re.IGNORECASE), ["流行"]),
    (re.compile(r"摇滚", re.IGNORECASE), ["摇滚"]),
    (re.compile(r"民谣", re.IGNORECASE), ["民谣"]),
    (re.compile(r"说唱|嘻哈|\brap\b", re.IGNORECASE), ["说唱"]),
    (re.compile(r"电子|电音", re.IGNORECASE), ["电子"]),
    (re.compile(r"舞曲|disco|house", re.IGNORECASE), ["舞曲"]),
    (re.compile(r"对唱", re.IGNORECASE), ["对唱"]),
    (re.compile(r"合唱", re.IGNORECASE), ["合唱"]),
    (re.compile(r"广场舞", re.IGNORECASE), ["广场舞"]),
    (re.compile(r"影视|主题曲|片尾曲|片头曲|插曲|电影|电视剧", re.IGNORECASE), ["影视金曲"]),
    (re.compile(r"动漫|动画|acg|二次元", re.IGNORECASE), ["动漫/ACG"]),
    (re.compile(r"经典老歌|老歌", re.IGNORECASE), ["经典老歌"]),
    (re.compile(r"怀旧", re.IGNORECASE), ["怀旧"]),
    (re.compile(r"网络歌曲|网红|抖音", re.IGNORECASE), ["网络歌曲"]),
    (re.compile(r"70后", re.IGNORECASE), ["70后"]),
    (re.compile(r"80后", re.IGNORECASE), ["80后"]),
    (re.compile(r"90后", re.IGNORECASE), ["90后"]),
    (re.compile(r"00后", re.IGNORECASE), ["00后"]),
]
PLAYLIST_TAG_RULES = [
    (re.compile(r"粤语|港乐|香港乐坛|港式", re.IGNORECASE), ["粤语", "港台"]),
    (re.compile(r"港台|香港|台湾", re.IGNORECASE), ["港台"]),
    (re.compile(r"国语", re.IGNORECASE), ["国语"]),
    (re.compile(r"华语|中文", re.IGNORECASE), ["华语"]),
    (re.compile(r"闽南语|台语", re.IGNORECASE), ["闽南语"]),
    (re.compile(r"英语|英文|欧美", re.IGNORECASE), ["英语"]),
    (re.compile(r"日语|日文|日系|j-?pop|日本", re.IGNORECASE), ["日语"]),
    (re.compile(r"韩语|韩文|韩流|韩国", re.IGNORECASE), ["韩语"]),
    (re.compile(r"流行|pop|热歌", re.IGNORECASE), ["流行"]),
    (re.compile(r"摇滚|rock|beyond", re.IGNORECASE), ["摇滚"]),
    (re.compile(r"民谣", re.IGNORECASE), ["民谣"]),
    (re.compile(r"民歌|民族", re.IGNORECASE), ["民歌", "民族"]),
    (re.compile(r"草原|藏族|青藏|雪域|天籁", re.IGNORECASE), ["草原", "民族"]),
    (re.compile(r"说唱|嘻哈|\brap\b", re.IGNORECASE), ["说唱"]),
    (re.compile(r"电子|电音", re.IGNORECASE), ["电子"]),
    (re.compile(r"舞曲|disco|house", re.IGNORECASE), ["舞曲"]),
    (re.compile(r"情歌", re.IGNORECASE), ["情歌"]),
    (re.compile(r"甜蜜|浪漫", re.IGNORECASE), ["甜蜜", "浪漫"]),
    (re.compile(r"伤感|催泪|虐心|失恋", re.IGNORECASE), ["伤感"]),
    (re.compile(r"励志|热血|正能量|冲刺|拼尽全力", re.IGNORECASE), ["励志", "热血"]),
    (re.compile(r"爱国|中华|红歌|革命", re.IGNORECASE), ["爱国", "红歌/革命歌曲"]),
    (re.compile(r"ktv|必点|点唱|会唱|麦霸", re.IGNORECASE), ["KTV必点"]),
    (re.compile(r"经典|金曲|老歌|百听不厌|回忆", re.IGNORECASE), ["经典老歌"]),
    (re.compile(r"怀旧", re.IGNORECASE), ["怀旧"]),
    (re.compile(r"抖音|短视频|bgm|爆火|热播|热门|顶流|全网", re.IGNORECASE), ["热门", "网络歌曲"]),
    (re.compile(r"影视|电影|电视剧|主题曲|片尾曲|片头曲|插曲|ost", re.IGNORECASE), ["影视金曲"]),
    (re.compile(r"动漫|动画|acg|二次元", re.IGNORECASE), ["动漫/ACG"]),
    (re.compile(r"高音|高亢|飙歌", re.IGNORECASE), ["高音", "飙歌"]),
    (re.compile(r"70后|七零后|70年代", re.IGNORECASE), ["70后", "70/80年代"]),
    (re.compile(r"80后|八零后|80年代|8090|80、90", re.IGNORECASE), ["80后", "80/90年代"]),
    (re.compile(r"90后|九零后|90年代|8090|80、90", re.IGNORECASE), ["90后", "80/90年代"]),
    (re.compile(r"00后|零零后|00年代", re.IGNORECASE), ["00后", "00年代"]),
]
WEAK_PLAYLIST_TAGS = frozenset(["热门", "网络歌曲", "伤感", "甜蜜", "浪漫"])
PLAYLIST_TAG_MIN_SCORES = {
    "伤感": 7,
    "甜蜜": 5,
    "浪漫": 5,
    "怀旧": 4,
    "经典老歌": 3,
    "动漫/ACG": 3,
}
PLAYLIST_TEXT_ONLY_TAGS = frozenset(["伤感", "甜蜜", "浪漫", "怀旧", "经典老歌", "动漫/ACG"])


def main(argv=None):
    args = parse_args(sys.argv[1:] if argv is None else argv)
    load_env_file(args.env_file)

    if args.command == "status":
        status(args)
    elif args.command == "run":
        run(args)
    elif args.command == "import":
        import_results(args)
    elif args.command == "run-and-import":
        run(args)
        import_results(args)
    else:
        raise SystemExit(f"Unknown command: {args.command}")


def parse_args(argv):
    parser = argparse.ArgumentParser(description="Run batched LLM style tagging outside the API container.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    for command in ("status", "run", "import", "run-and-import"):
        sub = subparsers.add_parser(command)
        add_common_args(sub)
        if command in ("run", "run-and-import", "status"):
            add_selection_args(sub)
        if command in ("run", "run-and-import"):
            add_llm_args(sub)
        if command in ("import", "run-and-import"):
            sub.add_argument("--apply", action="store_true", help="Write the JSONL results back to the database.")
            sub.add_argument("--dry-run", action="store_true", help="Validate and summarize without writing.")

    args = parser.parse_args(argv)
    if getattr(args, "dry_run", False) and getattr(args, "apply", False):
        parser.error("--dry-run and --apply cannot be used together")
    if args.command in ("import", "run-and-import") and not args.apply and not args.dry_run:
        args.dry_run = True
    return args


def add_common_args(parser):
    parser.add_argument("--env-file", default=os.environ.get("KTV_ENV_FILE", "deploy/docker/.env"))
    parser.add_argument("--database-url", default="")
    parser.add_argument("--postgres-container", default=os.environ.get("KTV_POSTGRES_CONTAINER", ""))
    parser.add_argument("--db-user", default=os.environ.get("PGUSER", "ktv"))
    parser.add_argument("--db-name", default=os.environ.get("PGDATABASE", "home_ktv"))
    parser.add_argument("--job-root", default=os.environ.get("KTV_STYLE_TAG_JOB_ROOT", "runtime/tagging/llm"))
    parser.add_argument("--output", default="")
    parser.add_argument("--state", default="")


def add_selection_args(parser):
    parser.add_argument("--batch-size", type=positive_int, default=DEFAULT_BATCH_SIZE)
    parser.add_argument("--limit", type=non_negative_int, default=0, help="0 means all current candidates.")
    parser.add_argument("--max-existing-tags", type=non_negative_int, default=1)


def add_llm_args(parser):
    parser.add_argument("--llm-base-url", default="")
    parser.add_argument("--llm-api-key", default="")
    parser.add_argument("--llm-model", default="")
    parser.add_argument("--playlist-evidence-first", action=argparse.BooleanOptionalAction, default=True)
    parser.add_argument("--playlist-evidence-limit", type=positive_int, default=DEFAULT_PLAYLIST_EVIDENCE_LIMIT)
    parser.add_argument("--min-playlist-tag-score", type=positive_int, default=2)
    parser.add_argument(
        "--playlist-evidence-providers",
        default=os.environ.get("KTV_PLAYLIST_EVIDENCE_PROVIDERS", ",".join(DEFAULT_PLAYLIST_EVIDENCE_PROVIDERS)),
    )
    parser.add_argument("--provider-first", action=argparse.BooleanOptionalAction, default=True)
    parser.add_argument("--min-provider-tags", type=positive_int, default=2)
    parser.add_argument("--concurrency", type=positive_int, default=10)
    parser.add_argument("--max-tags", type=positive_int, default=6)
    parser.add_argument("--max-tokens", type=positive_int, default=2048)
    parser.add_argument("--timeout-seconds", type=positive_int, default=180)
    parser.add_argument("--max-retries", type=positive_int, default=5)
    parser.add_argument("--sleep-ms", type=positive_int, default=60_000)
    parser.add_argument("--progress-every", type=positive_int, default=1)
    parser.add_argument(
        "--metadata-sidecar-command",
        default=os.environ.get("KTV_METADATA_SIDECAR_COMMAND", default_metadata_sidecar_command()),
    )
    parser.add_argument(
        "--metadata-sidecar-providers",
        default=os.environ.get(
            "KTV_METADATA_SIDECAR_PROVIDERS",
            ",".join(DEFAULT_METADATA_SIDECAR_PROVIDERS),
        ),
    )
    parser.add_argument("--metadata-search-limit", type=positive_int, default=DEFAULT_METADATA_SEARCH_LIMIT)
    parser.add_argument("--disable-metadata-sidecar", action="store_true")


def run(args):
    output = resolve_output_path(args)
    state_path = resolve_state_path(args, output)
    ensure_parent(output)
    ensure_parent(state_path)

    songs = select_candidate_songs(args)
    completed = read_completed_song_ids(output)
    pending = [song for song in songs if song["id"] not in completed]
    model = resolve_llm_model(args)
    write_state(
        state_path,
        {
            "status": "running",
            "output": str(output),
            "selected": len(songs),
            "completed": len(completed),
            "pending": len(pending),
            "maxExistingTags": args.max_existing_tags,
            "model": model,
            "updatedAt": now_iso(),
        },
    )

    print(f"selected={len(songs)} completed={len(completed)} pending={len(pending)} output={output}", flush=True)
    if not pending:
        write_state(
            state_path,
            {
                "status": "completed",
                "output": str(output),
                "selected": len(songs),
                "completed": len(completed),
                "pending": 0,
                "maxExistingTags": args.max_existing_tags,
                "model": model,
                "updatedAt": now_iso(),
            },
        )
        return

    sidecar_client = try_create_metadata_sidecar_client(args)
    metadata_resolver = build_sidecar_metadata_resolver(sidecar_client, args)
    playlist_evidence_resolver = build_sidecar_playlist_evidence_resolver(sidecar_client, args)
    try:
        batches = list(enumerate(chunks(pending, args.batch_size), start=1))
        worker = lambda batch_row: complete_batch_job(
            batch_row,
            args,
            metadata_resolver=metadata_resolver,
            playlist_evidence_resolver=playlist_evidence_resolver,
        )
        for batch_index, batch, rows, error in iter_completed_batch_results(batches, worker, args.concurrency):
            if error:
                rows = build_failed_result_rows(batch, model, error)
            append_result_rows(output, rows)
            completed.update(song["id"] for song in batch)
            remaining = len(songs) - len(completed)
            if batch_index % args.progress_every == 0 or remaining == 0:
                print(
                    f"batch={batch_index} wrote={len(batch)} completed={len(completed)}/{len(songs)} remaining={remaining}",
                    flush=True,
                )
            write_state(
                state_path,
                {
                    "status": "running" if remaining else "completed",
                    "output": str(output),
                    "selected": len(songs),
                    "completed": len(completed),
                    "pending": remaining,
                    "maxExistingTags": args.max_existing_tags,
                    "model": model,
                    "updatedAt": now_iso(),
                },
            )
    finally:
        close_metadata_sidecar_client(sidecar_client)


def status(args):
    output = resolve_output_path(args)
    state_path = resolve_state_path(args, output)
    pending_count = count_candidate_songs(args)
    rows = read_result_rows(output)
    summary = summarize_rows(rows)
    print(f"dbPending={pending_count} maxExistingTags={args.max_existing_tags}")
    print(f"output={output}")
    print(json.dumps(summary, ensure_ascii=False, sort_keys=True))
    if state_path.exists():
        print(f"state={state_path}")
        print(state_path.read_text(encoding="utf-8").strip())


def import_results(args):
    output = resolve_output_path(args)
    rows = read_result_rows(output)
    summary = summarize_rows(rows)
    if not rows:
        raise SystemExit(f"No JSONL result rows found: {output}")
    validate_unique_song_rows(rows)
    print(json.dumps({"input": str(output), **summary}, ensure_ascii=False, sort_keys=True), flush=True)
    if getattr(args, "dry_run", False):
        print("dryRun=true; database was not changed")
        return

    sql = build_import_sql(rows)
    run_psql_script(sql, args)
    print(f"imported={len(rows)} tagged={summary['tagged']} empty={summary['empty']} failed={summary['failed']}", flush=True)


def build_batch_prompt_songs_and_prompt(songs, metadata_resolver=None, playlist_evidence_resolver=None):
    prompt_songs = [
        build_prompt_song(
            song,
            str(index + 1),
            metadata_resolver=metadata_resolver,
            playlist_evidence_resolver=playlist_evidence_resolver,
        )
        for index, song in enumerate(songs)
    ]
    prompt = "\n".join(
        [
            "请为下面每首歌返回适合的 KTV 曲库标签。",
            "输入歌曲 JSON:",
            json.dumps(prompt_songs, ensure_ascii=False, separators=(",", ":")),
            "说明: artistNames、fileName、relativePath、matchedProvider、matchedAlbumName、matchedArtistNames、playlistEvidence、playlistCandidateTags、derivedHints 都是辅助线索，只有与歌曲本身一致时才使用。",
            "要求: results 数量必须等于输入歌曲数量；不要解释；不要输出 Markdown。",
        ]
    )
    return prompt_songs, prompt


def build_prompt_song(song, prompt_id, metadata_resolver=None, playlist_evidence_resolver=None):
    prompt_song = {
        "id": prompt_id,
        "title": clean(song.get("title")),
        "artistName": clean(song.get("primary_artist_name")),
    }
    artist_names = normalize_artist_name_list(song.get("artist_names"), prompt_song["artistName"])
    if artist_names:
        prompt_song["artistNames"] = artist_names

    file_name = clean(song.get("file_name"))
    if file_name:
        prompt_song["fileName"] = file_name

    relative_path = clean(song.get("relative_path"))
    if relative_path:
        prompt_song["relativePath"] = relative_path

    derived_hints = derive_prompt_hints(song)
    if derived_hints:
        prompt_song["derivedHints"] = derived_hints

    metadata = resolve_prompt_metadata(song, metadata_resolver)
    if metadata:
        provider = clean(metadata.get("provider"))
        if provider:
            prompt_song["matchedProvider"] = provider
        album_name = clean(metadata.get("albumName"))
        if album_name:
            prompt_song["matchedAlbumName"] = album_name
        matched_artist_names = normalize_artist_name_list(metadata.get("artistNames"))
        if matched_artist_names:
            prompt_song["matchedArtistNames"] = matched_artist_names

    playlist_evidence = resolve_prompt_playlist_evidence(song, playlist_evidence_resolver)
    if playlist_evidence:
        candidate_tags = build_playlist_tags(
            playlist_evidence,
            min_score=1,
            max_tags=8,
            include_weak=True,
        )
        if candidate_tags:
            prompt_song["playlistCandidateTags"] = candidate_tags
        prompt_rows = []
        for row in playlist_evidence.get("evidence", [])[:6]:
            if not isinstance(row, dict):
                continue
            name = clean(row.get("name"))
            if not name:
                continue
            prompt_row = {"name": name}
            tags = normalize_artist_name_list(row.get("tags"))
            if tags:
                prompt_row["tags"] = tags[:4]
            description = clean(row.get("description"))
            if description:
                prompt_row["description"] = description[:80]
            prompt_rows.append(prompt_row)
        if prompt_rows:
            prompt_song["playlistEvidence"] = prompt_rows

    return prompt_song


def resolve_prompt_metadata(song, metadata_resolver=None):
    if not callable(metadata_resolver):
        return None
    metadata = metadata_resolver(song)
    if not isinstance(metadata, dict):
        return None
    candidate = metadata.get("candidate")
    if isinstance(candidate, dict):
        return candidate
    return metadata


def resolve_prompt_playlist_evidence(song, playlist_evidence_resolver=None):
    if not callable(playlist_evidence_resolver):
        return None
    evidence = playlist_evidence_resolver(song)
    if not isinstance(evidence, dict):
        return None
    return evidence


def derive_prompt_hints(song):
    text = " ".join(
        part
        for part in (
            clean(song.get("title")),
            clean(song.get("file_name")),
            clean(song.get("relative_path")),
        )
        if part
    )
    if not text:
        return []

    hints = []
    for pattern, tags in DERIVED_HINT_RULES:
        if not pattern.search(text):
            continue
        for tag in tags:
            if tag in ALLOWED_TAGS and tag not in hints:
                hints.append(tag)
    return hints[:8]


def normalize_artist_name_list(values, fallback=None):
    names = []
    raw_values = values if isinstance(values, list) else [values]
    for raw_value in raw_values:
        value = clean(raw_value)
        if value and value not in names:
            names.append(value)
    fallback_value = clean(fallback)
    if fallback_value and fallback_value not in names:
        names.append(fallback_value)
    return names


def build_system_prompt():
    taxonomy = "\n".join(f"{group['name']}: {'、'.join(group['tags'])}" for group in KTV_STYLE_TAXONOMY)
    return "\n".join(
        [
            "你是家庭 KTV 曲库标签助手。",
            "只能从给定白名单中选择标签，不能创造新标签。",
            "根据歌名、歌手和附带辅助线索判断语种、曲风、情绪、KTV场景和年代版本。",
            "每首歌最多返回 6 个标签，优先选择对点歌筛选有用的标签。",
            "必须为输入中的每一个数字 id 返回且只返回一条结果，id 必须原样保留。",
            "不要返回 UUID、歌名或解释文字作为 id。",
            '只输出 JSON，格式为 {"results":[{"id":"1","tags":["标签1","标签2"]}]}。',
            "",
            taxonomy,
        ]
    )


def complete_batch_with_retries(batch, args, metadata_resolver=None, playlist_evidence_resolver=None):
    last_error = None
    for attempt in range(1, args.max_retries + 1):
        try:
            return complete_batch(
                batch,
                args,
                metadata_resolver=metadata_resolver,
                playlist_evidence_resolver=playlist_evidence_resolver,
            )
        except Exception as error:
            last_error = error
            print(f"batch failed attempt={attempt}/{args.max_retries} error={error}", flush=True)
            if attempt < args.max_retries:
                time.sleep(args.sleep_ms / 1000)
    raise RuntimeError(f"batch failed after {args.max_retries} attempts: {last_error}")


def complete_batch_job(batch_row, args, metadata_resolver=None, playlist_evidence_resolver=None):
    batch_index, batch = batch_row
    try:
        return (
            batch_index,
            batch,
            complete_batch_rows(
                batch,
                args,
                metadata_resolver=metadata_resolver,
                playlist_evidence_resolver=playlist_evidence_resolver,
            ),
            "",
        )
    except Exception as error:
        return batch_index, batch, [], str(error)[:500]


def complete_batch_rows(batch, args, metadata_resolver=None, playlist_evidence_resolver=None):
    model = resolve_llm_model(args)
    provider_rows, llm_batch = split_provider_and_llm_rows(
        batch,
        args,
        model,
        metadata_resolver=metadata_resolver,
        playlist_evidence_resolver=playlist_evidence_resolver,
    )
    if not llm_batch:
        return provider_rows
    try:
        results = complete_batch_with_retries(
            llm_batch,
            args,
            metadata_resolver=metadata_resolver,
            playlist_evidence_resolver=playlist_evidence_resolver,
        )
        return provider_rows + build_result_rows(llm_batch, results, model)
    except Exception as error:
        return provider_rows + build_failed_result_rows(llm_batch, model, error)


def split_provider_and_llm_rows(batch, args, model, metadata_resolver=None, playlist_evidence_resolver=None):
    provider_rows = []
    llm_batch = []
    for song in batch:
        if getattr(args, "playlist_evidence_first", True) and callable(playlist_evidence_resolver):
            playlist_evidence = resolve_prompt_playlist_evidence(song, playlist_evidence_resolver)
            row = build_playlist_tag_row(song, playlist_evidence, model, args.min_playlist_tag_score, args.max_tags)
            if row["status"] == "tagged":
                provider_rows.append(row)
                continue
        if getattr(args, "provider_first", True) and callable(metadata_resolver):
            metadata = resolve_prompt_metadata(song, metadata_resolver)
            row = build_provider_tag_row(song, metadata, model, args.min_provider_tags)
            if row["status"] == "tagged":
                provider_rows.append(row)
                continue
        llm_batch.append(song)
    return provider_rows, llm_batch


def complete_batch(batch, args, metadata_resolver=None, playlist_evidence_resolver=None):
    prompt_songs, user_prompt = build_batch_prompt_songs_and_prompt(
        batch,
        metadata_resolver=metadata_resolver,
        playlist_evidence_resolver=playlist_evidence_resolver,
    )
    content = call_llm(
        base_url=resolve_llm_base_url(args),
        api_key=resolve_llm_api_key(args),
        model=resolve_llm_model(args),
        system_prompt=build_system_prompt(),
        user_prompt=user_prompt,
        max_tokens=args.max_tokens,
        timeout_seconds=args.timeout_seconds,
    )
    return parse_batch_response(content, prompt_songs, args.max_tags)


def call_llm(base_url, api_key, model, system_prompt, user_prompt, max_tokens, timeout_seconds):
    if not base_url:
        raise RuntimeError("LLM base URL is required")
    if not api_key:
        raise RuntimeError("LLM API key is required")
    if not model:
        raise RuntimeError("LLM model is required")
    body = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": 0.1,
        "max_tokens": max_tokens,
        "response_format": {"type": "json_object"},
    }
    request = urllib.request.Request(
        resolve_chat_completions_url(base_url),
        data=json.dumps(body, ensure_ascii=False).encode("utf-8"),
        headers={
            "authorization": f"Bearer {api_key}",
            "content-type": "application/json",
            "user-agent": "HomeKTVStyleTaggerPython/0.1",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout_seconds) as response:
            data = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")[:500]
        raise RuntimeError(f"LLM API HTTP {error.code}: {detail}") from error
    content = data.get("choices", [{}])[0].get("message", {}).get("content")
    if not isinstance(content, str) or not content.strip():
        raise RuntimeError("LLM API response did not include message content")
    return content


def parse_batch_response(content, prompt_songs, max_tags=6):
    parsed = json.loads(extract_json_object(content))
    raw_results = parsed.get("results")
    if not isinstance(raw_results, list):
        raise ValueError("LLM batch response must include results array")
    expected_ids = {song["id"] for song in prompt_songs}
    results = {}
    for raw_result in raw_results:
        if not isinstance(raw_result, dict):
            raise ValueError("LLM batch response result must be an object")
        result_id = str(raw_result.get("id", "")).strip()
        if result_id not in expected_ids:
            raise ValueError(f"unexpected result id {result_id or '<empty>'}")
        if result_id in results:
            raise ValueError(f"duplicate result id {result_id}")
        results[result_id] = normalize_tags(raw_result.get("tags", []), max_tags)
    for song in prompt_songs:
        if song["id"] not in results:
            raise ValueError(f"missing result id {song['id']}")
    return results


def normalize_tags(raw_tags, max_tags=6):
    if not isinstance(raw_tags, list):
        return []
    seen = set()
    tags = []
    for raw_tag in raw_tags:
        if not isinstance(raw_tag, str):
            continue
        tag = raw_tag.strip()
        if tag not in ALLOWED_TAGS or tag in seen:
            continue
        seen.add(tag)
        tags.append(tag)
        if len(tags) >= max_tags:
            break
    return tags


def build_provider_tag_row(song, metadata, model, min_tags=2):
    tags = build_provider_tags(song, metadata)
    status = "tagged" if len(tags) >= min_tags else "empty"
    provider = clean((metadata or {}).get("provider")) if isinstance(metadata, dict) else ""
    evidence = [f"{PROVIDER_SOURCE}:{provider}"] if status == "tagged" and provider else []
    return {
        "songId": song["id"],
        "title": song["title"],
        "artistName": song["primary_artist_name"],
        "status": status,
        "tags": tags if status == "tagged" else [],
        "source": PROVIDER_SOURCE,
        "model": model,
        "confidence": DEFAULT_PROVIDER_CONFIDENCE if status == "tagged" else None,
        "evidence": evidence,
        "createdAt": now_iso(),
    }


def build_playlist_tag_row(song, playlist_evidence, model, min_score=2, max_tags=6):
    tags = build_playlist_tags(playlist_evidence, min_score=min_score, max_tags=max_tags)
    status = "tagged" if tags else "empty"
    evidence = []
    if status == "tagged" and isinstance(playlist_evidence, dict):
        for row in playlist_evidence.get("evidence", []):
            if not isinstance(row, dict):
                continue
            source = clean(row.get("source"))
            if source:
                item = f"{PLAYLIST_SOURCE}:{source}"
                if item not in evidence:
                    evidence.append(item)
            if len(evidence) >= 4:
                break
    return {
        "songId": song["id"],
        "title": song["title"],
        "artistName": song["primary_artist_name"],
        "status": status,
        "tags": tags if status == "tagged" else [],
        "source": PLAYLIST_SOURCE,
        "model": model,
        "confidence": DEFAULT_PLAYLIST_CONFIDENCE if status == "tagged" else None,
        "evidence": evidence,
        "createdAt": now_iso(),
    }


def build_playlist_tags(playlist_evidence, min_score=2, max_tags=6, include_weak=False):
    if not isinstance(playlist_evidence, dict):
        return []
    scores = {}
    first_seen = {}
    for index, row in enumerate(playlist_evidence.get("evidence", [])):
        if not isinstance(row, dict):
            continue
        weight = max(1, int(row.get("weight") or 1))
        primary_text = " ".join(
            part
            for part in (
                clean(row.get("name")),
                clean(row.get("description")),
            )
            if part
        )
        text = " ".join(part for part in (primary_text, " ".join(normalize_artist_name_list(row.get("tags")))) if part)
        if not text:
            continue
        for pattern, tags in PLAYLIST_TAG_RULES:
            match_text = primary_text if all(tag in PLAYLIST_TEXT_ONLY_TAGS for tag in tags) else text
            if not pattern.search(match_text):
                continue
            for tag in tags:
                if tag not in ALLOWED_TAGS:
                    continue
                scores[tag] = scores.get(tag, 0) + weight
                first_seen.setdefault(tag, index)

    selected = []
    for tag, score in scores.items():
        required = max(min_score, PLAYLIST_TAG_MIN_SCORES.get(tag, min_score))
        if tag in WEAK_PLAYLIST_TAGS and not include_weak:
            required = max(required + 1, 3)
        if score >= required:
            selected.append((tag, score, first_seen.get(tag, 0), tag_sort_key(tag)))
    selected.sort(key=lambda row: (-row[1], row[3], row[2], row[0]))
    return [tag for tag, _score, _index, _sort in selected[:max_tags]]


def tag_sort_key(tag):
    group_order = {group["name"]: group["sortOrder"] for group in KTV_STYLE_TAXONOMY}
    return group_order.get(TAG_GROUP_BY_TAG.get(tag, ""), 999)


def build_provider_tags(song, metadata, max_tags=6):
    if not isinstance(metadata, dict):
        return []
    text = " ".join(
        part
        for part in (
            clean(metadata.get("language")),
            clean(metadata.get("genreName")),
            " ".join(normalize_artist_name_list(metadata.get("tags"))),
            " ".join(normalize_artist_name_list(metadata.get("categories"))),
            clean(metadata.get("description")),
        )
        if part
    )
    return derive_tags_from_text(text, max_tags=max_tags)


def derive_tags_from_text(text, max_tags=8):
    value = clean(text)
    if not value:
        return []
    hints = []
    for pattern, tags in DERIVED_HINT_RULES:
        if not pattern.search(value):
            continue
        for tag in tags:
            if tag in ALLOWED_TAGS and tag not in hints:
                hints.append(tag)
            if len(hints) >= max_tags:
                return hints
    return hints


def extract_json_object(content):
    fenced = re.search(r"```(?:json)?\s*([\s\S]*?)```", content, flags=re.IGNORECASE)
    if fenced:
        return fenced.group(1).strip()
    start = content.find("{")
    end = content.rfind("}")
    if start >= 0 and end > start:
        return content[start : end + 1]
    return content.strip()


def build_result_rows(batch, results, model):
    rows = []
    for index, song in enumerate(batch):
        prompt_id = str(index + 1)
        tags = results[prompt_id]
        rows.append(
            {
                "songId": song["id"],
                "title": song["title"],
                "artistName": song["primary_artist_name"],
                "status": "tagged" if tags else "empty",
                "tags": tags,
                "source": SOURCE,
                "model": model,
                "confidence": DEFAULT_CONFIDENCE if tags else None,
                "evidence": ["llm-style-v1:batch-tag"] if tags else [],
                "createdAt": now_iso(),
            }
        )
    return rows


def build_failed_result_rows(batch, model, error):
    rows = []
    for song in batch:
        rows.append(
            {
                "songId": song["id"],
                "title": song["title"],
                "artistName": song["primary_artist_name"],
                "status": "failed",
                "tags": [],
                "source": SOURCE,
                "model": model,
                "confidence": None,
                "evidence": [],
                "error": str(error or "")[:500],
                "createdAt": now_iso(),
            }
        )
    return rows


def select_candidate_songs(args):
    sql = candidate_sql(args.max_existing_tags, args.limit)
    return [json.loads(line) for line in run_psql_lines(sql, args)]


def count_candidate_songs(args):
    sql = f"SELECT count(*) FROM ({candidate_sql(args.max_existing_tags, args.limit)}) candidate_count"
    lines = run_psql_lines(sql, args)
    return int(lines[0]) if lines else 0


def candidate_sql(max_existing_tags, limit):
    limit_sql = "" if limit == 0 else f"LIMIT {int(limit)}"
    return f"""
WITH existing_tags AS (
  SELECT s.id AS song_id,
         cardinality(s.style_tags)::integer AS tag_count
  FROM ktv_songs s
)
SELECT json_build_object(
  'id', s.id,
  'title', s.title,
  'primary_artist_name', s.primary_artist_name,
  'artist_names', CASE
    WHEN cardinality(s.artist_names) > 0 THEN s.artist_names
    ELSE ARRAY[s.primary_artist_name]::text[]
  END,
  'file_name', s.file_name,
  'relative_path', s.relative_path,
  'tag_count', existing_tags.tag_count
)::text
FROM ktv_songs s
JOIN existing_tags ON existing_tags.song_id = s.id
WHERE s.missing_at IS NULL
  AND existing_tags.tag_count <= {int(max_existing_tags)}
ORDER BY existing_tags.tag_count ASC, s.updated_at DESC, s.id ASC
{limit_sql}
""".strip()


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
    container = args.postgres_container.strip() or detect_postgres_container()
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
    preferred = ["home-ktv-postgres-1", "home-ktv-postgres"]
    for name in preferred:
        if name in names:
            return name
    for name in names:
        if "home-ktv" in name and "postgres" in name:
            return name
    return ""


def build_import_sql(rows):
    statements = ["BEGIN;"]
    for row in rows:
        statements.extend(song_import_sql(row))
    statements.append("COMMIT;")
    return "\n".join(statements)


def song_import_sql(row):
    song_id = row["songId"]
    status = row.get("status")
    tags = normalize_tags(row.get("tags", []))
    if status not in ("tagged", "empty", "failed"):
        raise ValueError(f"invalid row status for song {song_id}: {status}")
    if status == "tagged" and not tags:
        status = "empty"
    statements = []
    if status == "tagged":
        statements.append(
            f"""
UPDATE ktv_songs
SET style_tags = {sql_text_array(tags)},
    updated_at = now()
WHERE id = {sql_literal(song_id)};
""".strip()
        )
    return statements


def sql_literal(value):
    if value is None:
        return "NULL"
    if isinstance(value, (int, float)):
        return str(value)
    return "'" + str(value).replace("'", "''") + "'"


def sql_text_array(values):
    return "ARRAY[" + ", ".join(sql_literal(value) for value in values) + "]::text[]"


def append_result_rows(output, rows):
    with output.open("a", encoding="utf-8") as file:
        for row in rows:
            file.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n")
        file.flush()
        os.fsync(file.fileno())


def read_completed_song_ids(output):
    return {row["songId"] for row in read_result_rows(output) if "songId" in row}


def read_result_rows(output):
    if not output.exists():
        return []
    rows = []
    with output.open("r", encoding="utf-8") as file:
        for line_number, line in enumerate(file, start=1):
            if not line.strip():
                continue
            try:
                rows.append(json.loads(line))
            except json.JSONDecodeError as error:
                raise ValueError(f"invalid JSONL at {output}:{line_number}: {error}") from error
    return rows


def validate_unique_song_rows(rows):
    seen = set()
    for row in rows:
        song_id = row.get("songId")
        if not song_id:
            raise ValueError("result row missing songId")
        if song_id in seen:
            raise ValueError(f"duplicate songId in result file: {song_id}")
        seen.add(song_id)


def summarize_rows(rows):
    summary = {
        "total": 0,
        "tagged": 0,
        "empty": 0,
        "failed": 0,
        "tagsTotal": 0,
        "maxTags": 0,
    }
    for row in rows:
        status = row.get("status", "failed")
        if status not in ("tagged", "empty", "failed"):
            status = "failed"
        tags = normalize_tags(row.get("tags", []))
        summary["total"] += 1
        summary[status] += 1
        summary["tagsTotal"] += len(tags)
        summary["maxTags"] = max(summary["maxTags"], len(tags))
    summary["averageTags"] = round(summary["tagsTotal"] / summary["tagged"], 3) if summary["tagged"] else 0
    return summary


def resolve_output_path(args):
    if args.output:
        return Path(args.output)
    job_root = Path(args.job_root)
    command_name = "run" if args.command == "status" else args.command
    return job_root / f"{command_name}-llm-style-tags-{format_timestamp()}.jsonl"


def resolve_state_path(args, output):
    if args.state:
        return Path(args.state)
    return output.with_suffix(output.suffix + ".state.json")


def ensure_parent(path):
    path.parent.mkdir(parents=True, exist_ok=True)


def write_state(path, state):
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(state, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    tmp.replace(path)


def chunks(values, size):
    for index in range(0, len(values), size):
        yield values[index : index + size]


def iter_completed_batch_results(batches, worker, concurrency=1):
    concurrency = max(1, int(concurrency))
    if concurrency == 1:
        for batch_row in batches:
            yield worker(batch_row)
        return

    batch_iter = iter(batches)
    in_flight = set()

    def submit_next(executor):
        try:
            batch_row = next(batch_iter)
        except StopIteration:
            return False
        in_flight.add(executor.submit(worker, batch_row))
        return True

    with ThreadPoolExecutor(max_workers=concurrency) as executor:
        while len(in_flight) < concurrency and submit_next(executor):
            pass
        while in_flight:
            done, in_flight = wait(in_flight, return_when=FIRST_COMPLETED)
            for future in done:
                yield future.result()
                submit_next(executor)


def build_sidecar_metadata_resolver(sidecar_client, args):
    if sidecar_client is None:
        return None
    providers = read_metadata_sidecar_providers(args.metadata_sidecar_providers)
    if not providers:
        return None

    def resolve(song):
        title = clean(song.get("title"))
        if not title:
            return None
        try:
            result = sidecar_client.request(
                "bestMetadata",
                {
                    "title": title,
                    "artist": "",
                    "providers": providers,
                    "limit": args.metadata_search_limit,
                },
            )
        except Exception:
            return None
        return aggregate_sidecar_metadata(result)

    return resolve


def build_sidecar_playlist_evidence_resolver(sidecar_client, args):
    if sidecar_client is None or not getattr(args, "playlist_evidence_first", True):
        return None
    providers = read_playlist_evidence_providers(args.playlist_evidence_providers)
    if not providers:
        return None

    def resolve(song):
        title = clean(song.get("title"))
        if not title:
            return None
        try:
            return sidecar_client.request(
                "playlistEvidence",
                {
                    "title": title,
                    "artist": "",
                    "providers": providers,
                    "limit": args.playlist_evidence_limit,
                },
            )
        except Exception:
            return None

    return resolve


def aggregate_sidecar_metadata(result):
    if not isinstance(result, dict):
        return None
    candidate = result.get("candidate")
    metadata = dict(candidate) if isinstance(candidate, dict) else {}
    candidates = result.get("candidates") if isinstance(result.get("candidates"), list) else []
    for field in ("language", "genreName"):
        if clean(metadata.get(field)):
            continue
        for row in candidates:
            value = clean(row.get(field)) if isinstance(row, dict) else ""
            if value:
                metadata[field] = value
                break
    for field in ("tags", "categories"):
        merged = normalize_artist_name_list(metadata.get(field))
        for row in candidates:
            if not isinstance(row, dict):
                continue
            for value in normalize_artist_name_list(row.get(field)):
                if value not in merged:
                    merged.append(value)
        if merged:
            metadata[field] = merged
    descriptions = []
    for value in [metadata.get("description")] + [
        row.get("description") for row in candidates if isinstance(row, dict)
    ]:
        text = clean(value)
        if text and text not in descriptions:
            descriptions.append(text)
    if descriptions:
        metadata["description"] = " ".join(descriptions)
    return metadata or None


def try_create_metadata_sidecar_client(args):
    if getattr(args, "disable_metadata_sidecar", False):
        return None
    try:
        return create_metadata_sidecar_client(
            args.metadata_sidecar_command,
            cwd=Path(__file__).resolve().parents[2],
            default_timeout_seconds=max(15, min(args.timeout_seconds, 60)),
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


def read_metadata_sidecar_providers(value):
    providers = [item.strip() for item in clean(value).split(",") if item.strip()]
    for provider in providers:
        if provider not in DEFAULT_METADATA_SIDECAR_PROVIDERS:
            raise ValueError(f"Unsupported metadata sidecar provider: {provider}")
    return providers or list(DEFAULT_METADATA_SIDECAR_PROVIDERS)


def read_playlist_evidence_providers(value):
    providers = [item.strip() for item in clean(value).split(",") if item.strip()]
    for provider in providers:
        if provider not in DEFAULT_PLAYLIST_EVIDENCE_PROVIDERS:
            raise ValueError(f"Unsupported playlist evidence provider: {provider}")
    return providers or list(DEFAULT_PLAYLIST_EVIDENCE_PROVIDERS)


def resolve_llm_base_url(args):
    return args.llm_base_url or os.environ.get("KTV_LLM_BASE_URL") or os.environ.get("LLM_API_BASE_URL", "")


def resolve_llm_api_key(args):
    return args.llm_api_key or os.environ.get("KTV_LLM_API_KEY") or os.environ.get("LLM_API_KEY", "")


def resolve_llm_model(args):
    return args.llm_model or os.environ.get("KTV_LLM_MODEL") or os.environ.get("LLM_MODEL") or "gpt-5.5"


def resolve_database_url(args):
    return args.database_url or os.environ.get("DATABASE_URL") or "postgres://ktv:ktv@127.0.0.1:5432/home_ktv"


def resolve_chat_completions_url(raw_base_url):
    base_url = raw_base_url if re.match(r"^[a-z][a-z0-9+.-]*://", raw_base_url, re.IGNORECASE) else f"http://{raw_base_url}"
    parsed = urlparse(base_url)
    path = parsed.path.rstrip("/")
    if path.endswith("/chat/completions"):
        resolved_path = path
    elif path.endswith("/v1"):
        resolved_path = f"{path}/chat/completions"
    else:
        resolved_path = f"{path}/v1/chat/completions"
    return parsed._replace(path=resolved_path).geturl()


def load_env_file(path):
    if not path:
        return
    env_path = Path(path)
    if not env_path.exists():
        return
    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[len("export ") :].strip()
        if "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = strip_quotes(value.strip())
        if key and key not in os.environ:
            os.environ[key] = value


def strip_quotes(value):
    if len(value) >= 2 and value[0] == value[-1] and value[0] in ("'", '"'):
        return value[1:-1]
    return value


def clean(value):
    return str(value or "").strip()


def positive_int(raw):
    value = int(raw)
    if value <= 0:
        raise argparse.ArgumentTypeError("must be a positive integer")
    return value


def non_negative_int(raw):
    value = int(raw)
    if value < 0:
        raise argparse.ArgumentTypeError("must be a non-negative integer")
    return value


def format_timestamp():
    return datetime.now().strftime("%Y%m%d-%H%M%S")


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def find_tag_group(tag):
    tag_group = TAG_GROUP_BY_TAG.get(tag)
    if not tag_group:
        raise ValueError(f"unknown style tag group for tag: {tag}")
    return tag_group


if __name__ == "__main__":
    main()
