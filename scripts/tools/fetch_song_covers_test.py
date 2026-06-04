#!/usr/bin/env python3
import importlib.util
import json
import tempfile
import threading
import time
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
MODULE_PATH = ROOT / "scripts" / "tools" / "fetch_song_covers.py"


def load_module():
    spec = importlib.util.spec_from_file_location("fetch_song_covers", MODULE_PATH)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)
    return module


class FetchSongCoversTest(unittest.TestCase):
    def test_builds_stable_local_path_and_public_url(self):
        covers = load_module()

        self.assertEqual(
            covers.cover_file_path(Path("/data/home-ktv-media/covers"), "song-123"),
            Path("/data/home-ktv-media/covers/nas/song-123.jpg"),
        )
        self.assertEqual(
            covers.public_cover_url("https://ktv.example.com/", "song-123"),
            "https://ktv.example.com/media/covers/nas/song-123.jpg",
        )

    def test_public_url_requires_public_base_url(self):
        covers = load_module()

        with self.assertRaisesRegex(ValueError, "PUBLIC_BASE_URL"):
            covers.public_cover_url("", "song-123")

    def test_coverage_defaults_to_a_bounded_sample(self):
        covers = load_module()

        self.assertEqual(covers.parse_args(["fetch"]).limit, 0)
        self.assertEqual(covers.parse_args(["coverage"]).limit, 100)
        self.assertEqual(covers.parse_args(["fetch"]).concurrency, 10)
        self.assertEqual(covers.parse_args(["coverage"]).concurrency, 10)
        self.assertIn("netease", covers.parse_args(["coverage"]).providers.split(","))
        self.assertIn("cloud", covers.parse_args(["coverage"]).providers.split(","))
        self.assertEqual(covers.parse_args(["coverage"]).providers.split(",")[-1], "spotify")

    def test_fetch_and_coverage_accept_concurrency(self):
        covers = load_module()

        self.assertEqual(covers.parse_args(["fetch", "--concurrency", "4"]).concurrency, 4)
        self.assertEqual(covers.parse_args(["coverage", "--concurrency", "3"]).concurrency, 3)
        self.assertFalse(covers.parse_args(["fetch"]).full_scan)
        self.assertTrue(covers.parse_args(["fetch", "--full-scan"]).full_scan)

    def test_runs_song_tasks_concurrently(self):
        covers = load_module()
        active = 0
        max_active = 0
        lock = threading.Lock()

        def worker(song):
            nonlocal active, max_active
            with lock:
                active += 1
                max_active = max(max_active, active)
            time.sleep(0.02)
            with lock:
                active -= 1
            return {"songId": song["id"]}

        results = covers.run_song_tasks([{"id": str(index)} for index in range(6)], worker, concurrency=3)

        self.assertEqual({result["songId"] for result in results}, {"0", "1", "2", "3", "4", "5"})
        self.assertGreater(max_active, 1)

    def test_accepts_pnpm_argument_separator(self):
        covers = load_module()

        self.assertEqual(covers.parse_args(["coverage", "--", "--limit", "5"]).limit, 5)

    def test_probe_command_accepts_title_artist_and_providers(self):
        covers = load_module()

        args = covers.parse_args(["probe", "夜之光", "花姐", "--providers", "cloud,kugou"])

        self.assertEqual(args.title, "夜之光")
        self.assertEqual(args.artist, "花姐")
        self.assertEqual(args.providers, "cloud,kugou")

    def test_cover_commands_accept_metadata_sidecar_flags(self):
        covers = load_module()

        args = covers.parse_args(
            [
                "coverage",
                "--metadata-sidecar-command",
                "node scripts/tools/music_metadata_sidecar.mjs",
                "--metadata-sidecar-providers",
                "netease,kugou",
            ]
        )

        self.assertEqual(args.metadata_sidecar_command, "node scripts/tools/music_metadata_sidecar.mjs")
        self.assertEqual(args.metadata_sidecar_providers, "netease,kugou")
        self.assertFalse(args.disable_metadata_sidecar)

    def test_fetch_selection_defaults_to_songs_needing_local_cover(self):
        covers = load_module()
        args = covers.parse_args(["fetch"])
        args.public_base_url = "https://ktv.example.com"
        captured = {}

        original_run_psql_lines = covers.run_psql_lines
        def fake_run_psql_lines(sql, passed_args):
            captured["sql"] = sql
            return []
        covers.run_psql_lines = fake_run_psql_lines
        try:
            covers.select_candidate_songs(args, public_base_url=args.public_base_url)
        finally:
            covers.run_psql_lines = original_run_psql_lines

        sql = captured["sql"]
        self.assertIn("cover_updated_at IS NULL", sql)
        self.assertIn("cover_image_url IS NULL", sql)
        self.assertIn("cover_image_url <> 'https://ktv.example.com/media/covers/nas/' || id || '.jpg'", sql)

    def test_fetch_selection_can_full_scan_all_songs(self):
        covers = load_module()
        args = covers.parse_args(["fetch", "--full-scan"])
        args.public_base_url = "https://ktv.example.com"
        captured = {}

        original_run_psql_lines = covers.run_psql_lines
        def fake_run_psql_lines(sql, passed_args):
            captured["sql"] = sql
            return []
        covers.run_psql_lines = fake_run_psql_lines
        try:
            covers.select_candidate_songs(args, public_base_url=args.public_base_url)
        finally:
            covers.run_psql_lines = original_run_psql_lines

        self.assertNotIn("cover_image_url <>", captured["sql"])

    def test_image_validation_uses_bytes_not_only_content_type(self):
        covers = load_module()

        self.assertTrue(covers.is_supported_image(b"\xff\xd8\xff\xe0fake-jpeg", ""))
        self.assertFalse(covers.is_supported_image(b"<html>not an image</html>", "image/jpeg"))

    def test_repairs_database_when_local_file_already_exists(self):
        covers = load_module()

        with tempfile.TemporaryDirectory() as temp_dir:
            cover_root = Path(temp_dir) / "covers"
            cover_path = covers.cover_file_path(cover_root, "song-1")
            cover_path.parent.mkdir(parents=True)
            cover_path.write_bytes(b"\xff\xd8\xff\xe0fake-jpeg")

            decision = covers.decide_song_action(
                {
                    "id": "song-1",
                    "coverImageUrl": None,
                    "title": "晴天",
                    "artistName": "周杰伦",
                },
                history={},
                cover_root=cover_root,
                public_base_url="https://ktv.example.com",
                retry_failed=False,
                retry_not_found=False,
                force=False,
            )

        self.assertEqual(decision.action, "repair")
        self.assertEqual(decision.public_url, "https://ktv.example.com/media/covers/nas/song-1.jpg")

    def test_skips_previous_failures_until_retry_is_requested(self):
        covers = load_module()
        song = {
            "id": "song-2",
            "coverImageUrl": None,
            "title": "夜曲",
            "artistName": "周杰伦",
        }

        skipped = covers.decide_song_action(
            song,
            history={"song-2": {"status": "failed"}},
            cover_root=Path("/tmp/covers"),
            public_base_url="https://ktv.example.com",
            retry_failed=False,
            retry_not_found=False,
            force=False,
        )
        retried = covers.decide_song_action(
            song,
            history={"song-2": {"status": "failed"}},
            cover_root=Path("/tmp/covers"),
            public_base_url="https://ktv.example.com",
            retry_failed=True,
            retry_not_found=False,
            force=False,
        )

        self.assertEqual(skipped.action, "skip")
        self.assertEqual(retried.action, "fetch")

    def test_cover_matching_penalizes_unwanted_variants(self):
        covers = load_module()
        match = covers.select_best_cover_candidate(
            {"title": "晴天", "artistName": "周杰伦"},
            [
                {
                    "provider": "tencent",
                    "providerSongId": "dj",
                    "title": "晴天 DJ版",
                    "artistNames": ["周杰伦"],
                    "albumName": "DJ Remix",
                    "imageUrl": "https://example.com/dj.jpg",
                },
                {
                    "provider": "tencent",
                    "providerSongId": "original",
                    "title": "晴天",
                    "artistNames": ["周杰伦"],
                    "albumName": "叶惠美",
                    "imageUrl": "https://example.com/original.jpg",
                },
            ],
        )

        self.assertIsNotNone(match)
        self.assertEqual(match["providerSongId"], "original")

    def test_cover_matching_prefers_title_and_artist_before_title_only(self):
        covers = load_module()

        match = covers.select_best_cover_candidate(
            {"title": "夜之光", "artistName": "花姐"},
            [
                {
                    "provider": "spotify",
                    "providerSongId": "title-only",
                    "title": "夜之光",
                    "artistNames": ["其他歌手"],
                    "albumName": "夜之光",
                    "imageUrl": "https://example.com/title-only.jpg",
                },
                {
                    "provider": "spotify",
                    "providerSongId": "strict",
                    "title": "夜之光",
                    "artistNames": ["花姐"],
                    "albumName": "夜之光",
                    "imageUrl": "https://example.com/strict.jpg",
                },
            ],
        )

        self.assertEqual(match["providerSongId"], "strict")
        self.assertEqual(match["matchMode"], "title_artist")

    def test_cover_matching_falls_back_to_title_only(self):
        covers = load_module()

        match = covers.select_best_cover_candidate(
            {"title": "夜之光", "artistName": "花姐"},
            [
                {
                    "provider": "spotify",
                    "providerSongId": "wrong-artist",
                    "title": "夜之光",
                    "artistNames": ["其他歌手"],
                    "albumName": "夜之光",
                    "imageUrl": "https://example.com/title-only.jpg",
                }
            ],
        )

        self.assertEqual(match["providerSongId"], "wrong-artist")
        self.assertEqual(match["matchMode"], "title")

    def test_search_provider_uses_metadata_sidecar_when_configured(self):
        covers = load_module()
        calls = []

        class FakeSidecarClient:
            def request(self, command, payload):
                calls.append((command, payload))
                return {
                    "provider": "netease",
                    "candidates": [
                        {
                            "provider": "netease",
                            "providerSongId": "1",
                            "title": "夜曲",
                            "artistNames": ["周杰伦"],
                            "albumName": "十一月的萧邦",
                            "imageUrl": "https://example.com/cover.jpg",
                        }
                    ],
                }

        rows = covers.search_provider(
            "netease",
            {"title": "夜曲", "artistName": "周杰伦"},
            search_limit=3,
            timeout_ms=5000,
            sidecar_client=FakeSidecarClient(),
            sidecar_providers={"netease"},
        )

        self.assertEqual(calls[0][0], "searchCandidates")
        self.assertEqual(calls[0][1]["provider"], "netease")
        self.assertEqual(rows[0]["imageUrl"], "https://example.com/cover.jpg")

    def test_search_provider_falls_back_to_python_fetch_when_sidecar_fails(self):
        covers = load_module()

        class FailingSidecarClient:
            def request(self, command, payload):
                raise RuntimeError("sidecar unavailable")

        original_search_netease = covers.search_netease
        covers.search_netease = lambda song, search_limit, timeout_ms, base_url: [
            {
                "provider": "netease",
                "providerSongId": "fallback",
                "title": "晴天",
                "artistNames": ["周杰伦"],
                "albumName": "叶惠美",
                "imageUrl": "https://example.com/fallback.jpg",
            }
        ]
        try:
            rows = covers.search_provider(
                "netease",
                {"title": "晴天", "artistName": "周杰伦"},
                search_limit=3,
                timeout_ms=5000,
                sidecar_client=FailingSidecarClient(),
                sidecar_providers={"netease"},
            )
        finally:
            covers.search_netease = original_search_netease

        self.assertEqual(rows[0]["providerSongId"], "fallback")

    def test_search_netease_extracts_album_cover(self):
        covers = load_module()
        calls = []

        def fake_fetch_json(url, params, headers=None, timeout_ms=8000):
            calls.append((url, params, headers, timeout_ms))
            return {
                "result": {
                    "songs": [
                        {
                            "id": 77469,
                            "name": "冲动的惩罚",
                            "ar": [{"name": "刀郎"}],
                            "al": {
                                "name": "2002年的第一场雪",
                                "picUrl": "http://p1.music.126.net/example.jpg",
                            },
                        }
                    ]
                }
            }

        original_fetch_json = covers.fetch_json
        covers.fetch_json = fake_fetch_json
        try:
            candidates = covers.search_netease(
                {"title": "冲动的惩罚", "artistName": "刀郎"},
                search_limit=3,
                timeout_ms=5000,
                base_url="http://127.0.0.1:4300/",
            )
        finally:
            covers.fetch_json = original_fetch_json

        self.assertEqual(calls[0][0], "http://127.0.0.1:4300/cloudsearch")
        self.assertEqual(calls[0][1]["keywords"], "刀郎 冲动的惩罚")
        self.assertEqual(candidates[0]["provider"], "netease")
        self.assertEqual(candidates[0]["providerSongId"], "77469")
        self.assertEqual(candidates[0]["imageUrl"], "http://p1.music.126.net/example.jpg")

    def test_search_netease_falls_back_to_song_detail_cover(self):
        covers = load_module()
        calls = []

        def fake_fetch_json(url, params, headers=None, timeout_ms=8000):
            calls.append((url, params, headers, timeout_ms))
            if url.endswith("/cloudsearch"):
                return {
                    "result": {
                        "songs": [
                            {
                                "id": 77469,
                                "name": "冲动的惩罚",
                                "ar": [{"name": "刀郎"}],
                                "al": {"name": "2002年的第一场雪", "picUrl": ""},
                            }
                        ]
                    }
                }
            return {
                "songs": [
                    {
                        "id": 77469,
                        "name": "冲动的惩罚",
                        "ar": [{"name": "刀郎"}],
                        "al": {
                            "name": "2002年的第一场雪",
                            "picUrl": "http://p1.music.126.net/detail.jpg",
                        },
                    }
                ]
            }

        original_fetch_json = covers.fetch_json
        covers.fetch_json = fake_fetch_json
        try:
            candidates = covers.search_netease(
                {"title": "冲动的惩罚", "artistName": "刀郎"},
                search_limit=3,
                timeout_ms=5000,
                base_url="http://127.0.0.1:4300/",
            )
        finally:
            covers.fetch_json = original_fetch_json

        self.assertEqual(calls[1][0], "http://127.0.0.1:4300/song/detail")
        self.assertEqual(calls[1][1]["ids"], "77469")
        self.assertEqual(candidates[0]["imageUrl"], "http://p1.music.126.net/detail.jpg")

    def test_search_cloud_extracts_album_cover_from_detail(self):
        covers = load_module()
        calls = []

        def fake_fetch_json(url, params, headers=None, timeout_ms=8000, method="GET"):
            calls.append((url, params, method))
            if "search/get/web" in url:
                return {
                    "result": {
                        "songs": [
                            {
                                "id": 77469,
                                "name": "冲动的惩罚",
                                "artists": [{"name": "刀郎"}],
                            }
                        ]
                    }
                }
            return {
                "songs": [
                    {
                        "id": 77469,
                        "name": "冲动的惩罚",
                        "artists": [{"name": "刀郎"}],
                        "album": {
                            "name": "2002年的第一场雪",
                            "picUrl": "http://p1.music.126.net/cloud.jpg",
                        },
                    }
                ]
            }

        original_fetch_json = covers.fetch_json
        covers.fetch_json = fake_fetch_json
        try:
            candidates = covers.search_cloud(
                {"title": "冲动的惩罚", "artistName": "刀郎"},
                search_limit=3,
                timeout_ms=5000,
            )
        finally:
            covers.fetch_json = original_fetch_json

        self.assertEqual(calls[0][0], "https://music.163.com/api/search/get/web")
        self.assertEqual(calls[0][2], "POST")
        self.assertEqual(candidates[0]["provider"], "cloud")
        self.assertEqual(candidates[0]["providerSongId"], "77469")
        self.assertEqual(candidates[0]["imageUrl"], "http://p1.music.126.net/cloud.jpg")

    def test_spotify_search_parser_extracts_track_candidates(self):
        covers = load_module()
        payload = {
            "data": {
                "searchV2": {
                    "tracksV2": {
                        "items": [
                            {
                                "item": {
                                    "data": {
                                        "__typename": "Track",
                                        "id": "3yKaEc5oDoDShhzRNmnOpn",
                                        "name": "冲动的惩罚",
                                        "artists": {
                                            "items": [
                                                {"profile": {"name": "刀郎"}, "uri": "spotify:artist:0EU"}
                                            ]
                                        },
                                        "albumOfTrack": {
                                            "name": "2002年的第一场雪",
                                            "coverArt": {
                                                "sources": [
                                                    {
                                                        "height": 64,
                                                        "width": 64,
                                                        "url": "https://i.scdn.co/image/small",
                                                    },
                                                    {
                                                        "height": 640,
                                                        "width": 640,
                                                        "url": "https://i.scdn.co/image/large",
                                                    },
                                                ]
                                            },
                                        },
                                    }
                                }
                            }
                        ]
                    }
                }
            }
        }

        candidates = covers.parse_spotify_search_tracks(payload, search_limit=3)

        self.assertEqual(candidates[0]["providerSongId"], "3yKaEc5oDoDShhzRNmnOpn")
        self.assertEqual(candidates[0]["trackUrl"], "https://open.spotify.com/track/3yKaEc5oDoDShhzRNmnOpn")
        self.assertEqual(candidates[0]["imageUrl"], "https://i.scdn.co/image/large")

    def test_search_spotify_uses_spotify_scraper_track_info(self):
        covers = load_module()
        calls = {"closed": False, "urls": []}

        def fake_fetch_spotify_search_tracks(song, search_limit, timeout_ms):
            return [
                {
                    "provider": "spotify",
                    "providerSongId": "3yKaEc5oDoDShhzRNmnOpn",
                    "title": "冲动的惩罚",
                    "artistNames": ["刀郎"],
                    "albumName": "谢谢你",
                    "imageUrl": "https://i.scdn.co/image/search",
                    "trackUrl": "https://open.spotify.com/track/3yKaEc5oDoDShhzRNmnOpn",
                }
            ]

        class FakeSpotifyClient:
            def get_track_info(self, url):
                calls["urls"].append(url)
                return {
                    "id": "3yKaEc5oDoDShhzRNmnOpn",
                    "name": "冲动的惩罚",
                    "artists": [{"name": "刀郎"}],
                    "album": {
                        "name": "2002年的第一场雪",
                        "images": [
                            {"width": 64, "url": "https://i.scdn.co/image/small"},
                            {"width": 640, "url": "https://i.scdn.co/image/large"},
                        ],
                    },
                }

            def close(self):
                calls["closed"] = True

        original_fetch_spotify_search_tracks = covers.fetch_spotify_search_tracks
        original_create_spotify_client = covers.create_spotify_client
        covers.fetch_spotify_search_tracks = fake_fetch_spotify_search_tracks
        covers.create_spotify_client = lambda: FakeSpotifyClient()
        try:
            candidates = covers.search_spotify(
                {"title": "冲动的惩罚", "artistName": "刀郎"},
                search_limit=3,
                timeout_ms=5000,
            )
        finally:
            covers.fetch_spotify_search_tracks = original_fetch_spotify_search_tracks
            covers.create_spotify_client = original_create_spotify_client

        self.assertEqual(calls["urls"], ["https://open.spotify.com/track/3yKaEc5oDoDShhzRNmnOpn"])
        self.assertTrue(calls["closed"])
        self.assertEqual(candidates[0]["provider"], "spotify")
        self.assertEqual(candidates[0]["providerSongId"], "3yKaEc5oDoDShhzRNmnOpn")
        self.assertEqual(candidates[0]["artistNames"], ["刀郎"])
        self.assertEqual(candidates[0]["albumName"], "2002年的第一场雪")
        self.assertEqual(candidates[0]["imageUrl"], "https://i.scdn.co/image/large")

    def test_kugou_image_resolution_accepts_music_tagger_album_img(self):
        covers = load_module()

        def fake_fetch_json(url, params, headers=None, timeout_ms=8000, method="GET"):
            return {"album_img": "http://imge.kugou.com/stdmusic/{size}/cover.jpg"}

        original_fetch_json = covers.fetch_json
        covers.fetch_json = fake_fetch_json
        try:
            image_url = covers.resolve_provider_image_url(
                "kugou",
                {"picId": "abc123"},
                image_size=300,
                timeout_ms=5000,
            )
        finally:
            covers.fetch_json = original_fetch_json

        self.assertEqual(image_url, "http://imge.kugou.com/stdmusic/400/cover.jpg")

    def test_find_cover_ignores_failed_provider_when_another_provider_completed(self):
        covers = load_module()

        def fake_search_provider(provider, song, search_limit, timeout_ms, netease_base_url):
            if provider == "netease":
                raise RuntimeError("netease unavailable")
            return []

        original_search_provider = covers.search_provider
        covers.search_provider = fake_search_provider
        try:
            match = covers.find_cover(
                {"title": "晴天", "artistName": "周杰伦"},
                ["netease", "tencent"],
                search_limit=3,
                timeout_ms=5000,
                image_size=300,
                netease_base_url="http://127.0.0.1:4300",
            )
        finally:
            covers.search_provider = original_search_provider

        self.assertIsNone(match)

    def test_find_cover_prefers_later_strict_match_over_earlier_title_only_match(self):
        covers = load_module()

        def fake_search_provider(provider, song, search_limit, timeout_ms, netease_base_url):
            if provider == "first":
                return [
                    {
                        "provider": "first",
                        "providerSongId": "title-only",
                        "title": "夜之光",
                        "artistNames": ["其他歌手"],
                        "albumName": "夜之光",
                        "imageUrl": "https://example.com/title-only.jpg",
                    }
                ]
            return [
                {
                    "provider": "second",
                    "providerSongId": "strict",
                    "title": "夜之光",
                    "artistNames": ["花姐"],
                    "albumName": "夜之光",
                    "imageUrl": "https://example.com/strict.jpg",
                }
            ]

        original_search_provider = covers.search_provider
        covers.search_provider = fake_search_provider
        try:
            match = covers.find_cover(
                {"title": "夜之光", "artistName": "花姐"},
                ["first", "second"],
                search_limit=3,
                timeout_ms=5000,
                image_size=300,
                netease_base_url="http://127.0.0.1:4300",
            )
        finally:
            covers.search_provider = original_search_provider

        self.assertEqual(match["providerSongId"], "strict")
        self.assertEqual(match["matchMode"], "title_artist")

    def test_probe_cover_uses_provider_fallback_order(self):
        covers = load_module()
        seen = []

        def fake_search_provider(provider, song, search_limit, timeout_ms, netease_base_url):
            seen.append(provider)
            if provider == "cloud":
                return []
            return [
                {
                    "provider": "kugou",
                    "providerSongId": "hash-1",
                    "title": "夜之光",
                    "artistNames": ["花姐"],
                    "albumName": "夜之光",
                    "imageUrl": "http://example.com/kugou.jpg",
                }
            ]

        original_search_provider = covers.search_provider
        covers.search_provider = fake_search_provider
        try:
            result = covers.probe_cover(
                title="夜之光",
                artist="花姐",
                providers=["cloud", "kugou"],
                search_limit=3,
                timeout_ms=5000,
                image_size=300,
                netease_base_url="http://127.0.0.1:4300",
            )
        finally:
            covers.search_provider = original_search_provider

        self.assertEqual(seen, ["cloud", "kugou"])
        self.assertEqual(result["best"]["provider"], "kugou")
        self.assertEqual(result["best"]["imageUrl"], "http://example.com/kugou.jpg")

    def test_reads_latest_history_row_per_song(self):
        covers = load_module()

        with tempfile.TemporaryDirectory() as temp_dir:
            history_path = Path(temp_dir) / "covers.jsonl"
            history_path.write_text(
                "\n".join(
                    [
                        json.dumps({"songId": "song-1", "status": "failed"}),
                        json.dumps({"songId": "song-1", "status": "found"}),
                        json.dumps({"songId": "song-2", "status": "not_found"}),
                    ]
                ),
                encoding="utf-8",
            )

            history = covers.read_history(history_path)

        self.assertEqual(history["song-1"]["status"], "found")
        self.assertEqual(history["song-2"]["status"], "not_found")


if __name__ == "__main__":
    unittest.main()
