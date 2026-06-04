import importlib.util
import tempfile
import threading
import time
import unittest
from pathlib import Path


SCRIPT_PATH = Path(__file__).with_name("run_style_tagging_llm_batch.py")
SPEC = importlib.util.spec_from_file_location("run_style_tagging_llm_batch", SCRIPT_PATH)
runner = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(runner)


class RunStyleTaggingLlmBatchTest(unittest.TestCase):
    def test_run_command_accepts_metadata_sidecar_flags(self):
        args = runner.parse_args(
            [
                "run",
                "--concurrency",
                "10",
                "--metadata-sidecar-command",
                "node scripts/tools/music_metadata_sidecar.mjs",
                "--metadata-sidecar-providers",
                "netease,kugou",
                "--metadata-search-limit",
                "7",
            ]
        )

        self.assertEqual(args.metadata_sidecar_command, "node scripts/tools/music_metadata_sidecar.mjs")
        self.assertEqual(args.metadata_sidecar_providers, "netease,kugou")
        self.assertEqual(args.metadata_search_limit, 7)
        self.assertEqual(args.concurrency, 10)
        self.assertFalse(args.disable_metadata_sidecar)

    def test_run_defaults_to_ten_way_concurrency(self):
        args = runner.parse_args(["run"])

        self.assertEqual(args.concurrency, 10)
        self.assertTrue(args.provider_first)
        self.assertTrue(args.playlist_evidence_first)
        self.assertEqual(args.min_provider_tags, 2)
        self.assertEqual(args.min_playlist_tag_score, 2)

    def test_run_command_accepts_playlist_evidence_flags(self):
        args = runner.parse_args(
            [
                "run",
                "--playlist-evidence-limit",
                "12",
                "--min-playlist-tag-score",
                "3",
                "--no-playlist-evidence-first",
            ]
        )

        self.assertEqual(args.playlist_evidence_limit, 12)
        self.assertEqual(args.min_playlist_tag_score, 3)
        self.assertFalse(args.playlist_evidence_first)

    def test_provider_tag_row_uses_platform_metadata(self):
        song = {
            "id": "song-1",
            "title": "Kiss Goodbye",
            "primary_artist_name": "王铮亮",
            "artist_names": ["王铮亮"],
            "file_name": "",
            "relative_path": "",
        }
        metadata = {
            "provider": "netease",
            "title": "Kiss Goodbye (围炉音乐会)",
            "albumName": "普通专辑名不应参与规则打标",
            "artistNames": ["王铮亮"],
            "language": "国语",
            "tags": ["流行"],
            "description": "围炉音乐会",
        }

        row = runner.build_provider_tag_row(song, metadata, "provider-model", min_tags=2)

        self.assertEqual(row["status"], "tagged")
        self.assertIn("国语", row["tags"])
        self.assertIn("流行", row["tags"])
        self.assertIn("现场/演唱会", row["tags"])
        self.assertIn("provider-style-v1:netease", row["evidence"])

    def test_provider_tag_row_does_not_infer_from_title_or_album_name(self):
        song = {
            "id": "song-1",
            "title": "Kiss Goodbye",
            "primary_artist_name": "王铮亮",
            "artist_names": ["王铮亮"],
            "file_name": "",
            "relative_path": "",
        }
        metadata = {
            "provider": "netease",
            "title": "Kiss Goodbye (围炉音乐会)",
            "albumName": "国语 流行 音乐会",
            "artistNames": ["王铮亮"],
        }

        row = runner.build_provider_tag_row(song, metadata, "provider-model", min_tags=2)

        self.assertEqual(row["status"], "empty")
        self.assertEqual(row["tags"], [])

    def test_playlist_tag_row_scores_playlist_title_evidence(self):
        song = {"id": "song-1", "title": "海阔天空", "primary_artist_name": "Beyond"}
        evidence = {
            "evidence": [
                {
                    "provider": "netease",
                    "source": "netease_simi_playlist",
                    "name": "粤语经典老歌：80、90后的港乐回忆",
                    "description": "Beyond 摇滚金曲",
                    "tags": ["粤语", "摇滚"],
                    "weight": 2,
                },
                {
                    "provider": "kugou",
                    "source": "kugou_special_search",
                    "name": "Beyond必听经典摇滚丨摇滚殿堂",
                    "description": "",
                    "tags": [],
                    "weight": 1,
                },
            ]
        }

        row = runner.build_playlist_tag_row(song, evidence, "test-model", min_score=2)

        self.assertEqual(row["status"], "tagged")
        self.assertIn("粤语", row["tags"])
        self.assertIn("港台", row["tags"])
        self.assertIn("摇滚", row["tags"])
        self.assertIn("经典老歌", row["tags"])
        self.assertIn("playlist-style-v1:netease_simi_playlist", row["evidence"])

    def test_playlist_tag_row_requires_enough_evidence(self):
        song = {"id": "song-1", "title": "七里香", "primary_artist_name": "周杰伦"}
        evidence = {
            "evidence": [
                {
                    "provider": "kugou",
                    "source": "kugou_special_search",
                    "name": "热门歌曲",
                    "description": "",
                    "tags": [],
                    "weight": 1,
                }
            ]
        }

        row = runner.build_playlist_tag_row(song, evidence, "test-model", min_score=2)

        self.assertEqual(row["status"], "empty")
        self.assertEqual(row["tags"], [])

    def test_sidecar_metadata_resolver_matches_by_title_only(self):
        class FakeSidecarClient:
            def __init__(self):
                self.payloads = []

            def request(self, command, payload):
                self.payloads.append((command, payload))
                return {"candidate": {"provider": "netease", "title": "七里香"}}

        client = FakeSidecarClient()
        args = runner.parse_args(["run", "--metadata-sidecar-providers", "netease,kugou"])

        resolver = runner.build_sidecar_metadata_resolver(client, args)
        metadata = resolver({"title": "七里香", "primary_artist_name": "周杰伦"})

        self.assertEqual(metadata["provider"], "netease")
        self.assertEqual(client.payloads[0][0], "bestMetadata")
        self.assertEqual(client.payloads[0][1]["title"], "七里香")
        self.assertEqual(client.payloads[0][1]["artist"], "")

    def test_sidecar_playlist_evidence_resolver_matches_by_title_only(self):
        class FakeSidecarClient:
            def __init__(self):
                self.payloads = []

            def request(self, command, payload):
                self.payloads.append((command, payload))
                return {"evidence": [{"provider": "netease", "name": "粤语经典"}]}

        client = FakeSidecarClient()
        args = runner.parse_args(["run", "--metadata-sidecar-providers", "netease,kugou"])

        resolver = runner.build_sidecar_playlist_evidence_resolver(client, args)
        evidence = resolver({"title": "海阔天空", "primary_artist_name": "Beyond"})

        self.assertEqual(evidence["evidence"][0]["provider"], "netease")
        self.assertEqual(client.payloads[0][0], "playlistEvidence")
        self.assertEqual(client.payloads[0][1]["title"], "海阔天空")
        self.assertEqual(client.payloads[0][1]["artist"], "")

    def test_sidecar_metadata_resolver_aggregates_classification_from_all_candidates(self):
        class FakeSidecarClient:
            def request(self, command, payload):
                return {
                    "candidate": {"provider": "netease", "title": "Lemon", "artistNames": ["米津玄師"]},
                    "candidates": [
                        {"provider": "netease", "title": "Lemon", "artistNames": ["米津玄師"]},
                        {
                            "provider": "kugou",
                            "title": "Lemon",
                            "artistNames": ["米津玄師"],
                            "language": "日语",
                            "description": "《非自然死亡》电视剧主题曲",
                        },
                    ],
                }

        args = runner.parse_args(["run", "--metadata-sidecar-providers", "netease,kugou"])
        metadata = runner.build_sidecar_metadata_resolver(FakeSidecarClient(), args)(
            {"title": "Lemon", "primary_artist_name": ""}
        )
        row = runner.build_provider_tag_row(
            {"id": "song-1", "title": "Lemon", "primary_artist_name": ""},
            metadata,
            "test-model",
            min_tags=2,
        )

        self.assertEqual(metadata["provider"], "netease")
        self.assertEqual(metadata["language"], "日语")
        self.assertEqual(metadata["description"], "《非自然死亡》电视剧主题曲")
        self.assertEqual(row["status"], "tagged")
        self.assertIn("日语", row["tags"])
        self.assertIn("影视金曲", row["tags"])

    def test_run_skips_llm_when_provider_tags_are_sufficient(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            output_path = Path(temp_dir) / "tags.jsonl"
            state_path = Path(temp_dir) / "tags.state.json"

            original_select_candidate_songs = runner.select_candidate_songs
            original_read_completed_song_ids = runner.read_completed_song_ids
            original_resolve_llm_model = runner.resolve_llm_model
            original_complete_batch_with_retries = runner.complete_batch_with_retries
            original_try_create_metadata_sidecar_client = runner.try_create_metadata_sidecar_client
            original_close_metadata_sidecar_client = runner.close_metadata_sidecar_client
            original_build_sidecar_metadata_resolver = runner.build_sidecar_metadata_resolver

            runner.select_candidate_songs = lambda args: [
                {
                    "id": "song-1",
                    "title": "Kiss Goodbye",
                    "primary_artist_name": "王铮亮",
                    "artist_names": ["王铮亮"],
                    "file_name": "",
                    "relative_path": "",
                }
            ]
            runner.read_completed_song_ids = lambda output: set()
            runner.resolve_llm_model = lambda args: "test-model"
            runner.try_create_metadata_sidecar_client = lambda args: object()
            runner.close_metadata_sidecar_client = lambda client: None
            runner.build_sidecar_metadata_resolver = lambda client, args: lambda song: {
                "provider": "netease",
                "title": "Kiss Goodbye (围炉音乐会)",
                "albumName": "普通专辑名",
                "artistNames": ["王铮亮"],
                "language": "国语",
                "tags": ["流行"],
            }

            def fail_if_llm_is_called(batch, args, metadata_resolver=None, playlist_evidence_resolver=None):
                raise AssertionError("LLM should not be called for sufficient provider tags")

            runner.complete_batch_with_retries = fail_if_llm_is_called
            args = runner.parse_args(
                [
                    "run",
                    "--batch-size",
                    "1",
                    "--concurrency",
                    "1",
                    "--output",
                    str(output_path),
                    "--state",
                    str(state_path),
                ]
            )
            try:
                runner.run(args)
            finally:
                runner.select_candidate_songs = original_select_candidate_songs
                runner.read_completed_song_ids = original_read_completed_song_ids
                runner.resolve_llm_model = original_resolve_llm_model
                runner.complete_batch_with_retries = original_complete_batch_with_retries
                runner.try_create_metadata_sidecar_client = original_try_create_metadata_sidecar_client
                runner.close_metadata_sidecar_client = original_close_metadata_sidecar_client
                runner.build_sidecar_metadata_resolver = original_build_sidecar_metadata_resolver

            rows = runner.read_result_rows(output_path)
            self.assertEqual(len(rows), 1)
            self.assertEqual(rows[0]["status"], "tagged")
            self.assertIn("provider-style-v1:netease", rows[0]["evidence"])

    def test_run_prefers_playlist_evidence_before_provider_metadata(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            output_path = Path(temp_dir) / "tags.jsonl"
            state_path = Path(temp_dir) / "tags.state.json"

            original_select_candidate_songs = runner.select_candidate_songs
            original_read_completed_song_ids = runner.read_completed_song_ids
            original_resolve_llm_model = runner.resolve_llm_model
            original_complete_batch_with_retries = runner.complete_batch_with_retries
            original_try_create_metadata_sidecar_client = runner.try_create_metadata_sidecar_client
            original_close_metadata_sidecar_client = runner.close_metadata_sidecar_client
            original_build_sidecar_metadata_resolver = runner.build_sidecar_metadata_resolver
            original_build_sidecar_playlist_evidence_resolver = runner.build_sidecar_playlist_evidence_resolver

            runner.select_candidate_songs = lambda args: [
                {"id": "song-1", "title": "海阔天空", "primary_artist_name": "Beyond"}
            ]
            runner.read_completed_song_ids = lambda output: set()
            runner.resolve_llm_model = lambda args: "test-model"
            runner.try_create_metadata_sidecar_client = lambda args: object()
            runner.close_metadata_sidecar_client = lambda client: None
            runner.build_sidecar_metadata_resolver = lambda client, args: lambda song: {
                "provider": "kugou",
                "language": "国语",
                "tags": ["流行"],
            }
            runner.build_sidecar_playlist_evidence_resolver = lambda client, args: lambda song: {
                "evidence": [
                    {
                        "provider": "netease",
                        "source": "netease_simi_playlist",
                        "name": "粤语经典老歌",
                        "description": "Beyond 港乐摇滚",
                        "tags": ["粤语", "摇滚"],
                        "weight": 2,
                    }
                ]
            }

            def fail_if_llm_is_called(batch, args, metadata_resolver=None, playlist_evidence_resolver=None):
                raise AssertionError("LLM should not be called for sufficient playlist evidence")

            runner.complete_batch_with_retries = fail_if_llm_is_called
            args = runner.parse_args(
                [
                    "run",
                    "--batch-size",
                    "1",
                    "--concurrency",
                    "1",
                    "--output",
                    str(output_path),
                    "--state",
                    str(state_path),
                ]
            )
            try:
                runner.run(args)
            finally:
                runner.select_candidate_songs = original_select_candidate_songs
                runner.read_completed_song_ids = original_read_completed_song_ids
                runner.resolve_llm_model = original_resolve_llm_model
                runner.complete_batch_with_retries = original_complete_batch_with_retries
                runner.try_create_metadata_sidecar_client = original_try_create_metadata_sidecar_client
                runner.close_metadata_sidecar_client = original_close_metadata_sidecar_client
                runner.build_sidecar_metadata_resolver = original_build_sidecar_metadata_resolver
                runner.build_sidecar_playlist_evidence_resolver = original_build_sidecar_playlist_evidence_resolver

            rows = runner.read_result_rows(output_path)
            self.assertEqual(len(rows), 1)
            self.assertEqual(rows[0]["source"], runner.PLAYLIST_SOURCE)
            self.assertIn("粤语", rows[0]["tags"])
            self.assertNotIn("国语", rows[0]["tags"])

    def test_batch_prompt_uses_short_ids_instead_of_song_ids(self):
        songs = [
            {"id": "real-song-uuid-1", "title": "七里香", "primary_artist_name": "周杰伦"},
            {"id": "real-song-uuid-2", "title": "海阔天空", "primary_artist_name": "Beyond"},
        ]

        prompt_songs, prompt = runner.build_batch_prompt_songs_and_prompt(songs)

        self.assertEqual([song["id"] for song in prompt_songs], ["1", "2"])
        self.assertIn('"id":"1"', prompt)
        self.assertIn('"id":"2"', prompt)
        self.assertNotIn("real-song-uuid-1", prompt)
        self.assertNotIn("real-song-uuid-2", prompt)

    def test_batch_prompt_includes_local_metadata_and_sidecar_match(self):
        songs = [
            {
                "id": "real-song-uuid-1",
                "title": "第一时间 (Live)",
                "primary_artist_name": "F4",
                "artist_names": ["F4"],
                "file_name": "F4-第一时间 (Live)[1080P]-国语-合唱.mpg",
                "relative_path": "1080P全高清MPG2026年更新（更新中）/01月MPG1080/F4-第一时间 (Live)[1080P]-国语-合唱.mpg",
            }
        ]

        prompt_songs, prompt = runner.build_batch_prompt_songs_and_prompt(
            songs,
            metadata_resolver=lambda song: {
                "provider": "netease",
                "albumName": "Fantasy 4ever",
                "artistNames": ["F4"],
            },
        )

        self.assertEqual(prompt_songs[0]["artistNames"], ["F4"])
        self.assertEqual(prompt_songs[0]["fileName"], "F4-第一时间 (Live)[1080P]-国语-合唱.mpg")
        self.assertEqual(
            prompt_songs[0]["relativePath"],
            "1080P全高清MPG2026年更新（更新中）/01月MPG1080/F4-第一时间 (Live)[1080P]-国语-合唱.mpg",
        )
        self.assertEqual(prompt_songs[0]["matchedProvider"], "netease")
        self.assertEqual(prompt_songs[0]["matchedAlbumName"], "Fantasy 4ever")
        self.assertEqual(prompt_songs[0]["matchedArtistNames"], ["F4"])
        self.assertIn("国语", prompt_songs[0]["derivedHints"])
        self.assertIn("合唱", prompt_songs[0]["derivedHints"])
        self.assertIn("Live", prompt_songs[0]["derivedHints"])
        self.assertIn('"matchedProvider":"netease"', prompt)

    def test_batch_prompt_falls_back_to_local_metadata_when_sidecar_has_no_match(self):
        songs = [
            {
                "id": "real-song-uuid-1",
                "title": "七里香",
                "primary_artist_name": "周杰伦",
                "artist_names": ["周杰伦"],
                "file_name": "周杰伦-七里香-国语-流行.mkv",
                "relative_path": "流行歌曲/周杰伦-七里香-国语-流行.mkv",
            }
        ]

        prompt_songs, _ = runner.build_batch_prompt_songs_and_prompt(
            songs,
            metadata_resolver=lambda song: None,
        )

        self.assertEqual(prompt_songs[0]["artistNames"], ["周杰伦"])
        self.assertEqual(prompt_songs[0]["fileName"], "周杰伦-七里香-国语-流行.mkv")
        self.assertNotIn("matchedProvider", prompt_songs[0])
        self.assertIn("国语", prompt_songs[0]["derivedHints"])
        self.assertIn("流行", prompt_songs[0]["derivedHints"])

    def test_batch_response_rejects_unknown_ids(self):
        prompt_songs = [
            {"id": "1", "title": "七里香", "artistName": "周杰伦"},
            {"id": "2", "title": "海阔天空", "artistName": "Beyond"},
        ]

        with self.assertRaisesRegex(ValueError, "unexpected result id"):
            runner.parse_batch_response('{"results":[{"id":"1","tags":["华语"]},{"id":"3","tags":["粤语"]}]}', prompt_songs)

    def test_batch_response_filters_to_allowed_unique_tags(self):
        prompt_songs = [{"id": "1", "title": "七里香", "artistName": "周杰伦"}]

        result = runner.parse_batch_response('{"results":[{"id":"1","tags":["华语","流行","不存在","华语"]}]}', prompt_songs)

        self.assertEqual(result, {"1": ["华语", "流行"]})

    def test_sql_literal_escapes_single_quotes(self):
        self.assertEqual(runner.sql_literal("A'B"), "'A''B'")

    def test_candidate_sql_uses_inline_style_tags(self):
        sql = runner.candidate_sql(max_existing_tags=1, limit=30)

        self.assertIn("cardinality(s.style_tags)::integer AS tag_count", sql)
        self.assertIn("WHERE s.missing_at IS NULL", sql)
        self.assertIn("'artist_names', CASE", sql)
        self.assertIn("'file_name', s.file_name", sql)
        self.assertIn("'relative_path', s.relative_path", sql)
        self.assertNotIn("ktv_song_style_tags", sql)
        self.assertNotIn("ktv_song_assets", sql)
        self.assertNotIn("st.tag_id", sql)
        self.assertNotIn("ktv_song_tagging_status", sql)

    def test_import_sql_writes_inline_style_tags(self):
        sql = runner.build_import_sql(
            [
                {"songId": "song-1", "status": "tagged", "tags": ["流行", "KTV必点"]},
                {"songId": "song-2", "status": "empty", "tags": []},
            ]
        )

        self.assertIn("UPDATE ktv_songs", sql)
        self.assertIn("style_tags = ARRAY['流行', 'KTV必点']::text[]", sql)
        self.assertNotIn("ktv_style_tags", sql)
        self.assertNotIn("ktv_style_groups", sql)
        self.assertNotIn("ktv_song_style_tags", sql)
        self.assertNotIn("ktv_song_tagging_status", sql)
        self.assertNotIn("ktv_song_tagging_runs", sql)

    def test_iter_completed_batch_results_runs_batches_concurrently(self):
        active = 0
        max_active = 0
        lock = threading.Lock()

        def worker(batch_row):
            nonlocal active, max_active
            with lock:
                active += 1
                max_active = max(max_active, active)
            time.sleep(0.02)
            with lock:
                active -= 1
            index, batch = batch_row
            return {"batchIndex": index, "size": len(batch)}

        results = list(
            runner.iter_completed_batch_results(
                [(1, [1]), (2, [2]), (3, [3]), (4, [4])],
                worker,
                concurrency=3,
            )
        )

        self.assertEqual({row["batchIndex"] for row in results}, {1, 2, 3, 4})
        self.assertGreater(max_active, 1)

    def test_run_processes_batches_with_configured_concurrency(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            output_path = Path(temp_dir) / "tags.jsonl"
            state_path = Path(temp_dir) / "tags.state.json"
            active = 0
            max_active = 0
            lock = threading.Lock()

            original_select_candidate_songs = runner.select_candidate_songs
            original_read_completed_song_ids = runner.read_completed_song_ids
            original_resolve_llm_model = runner.resolve_llm_model
            original_complete_batch_with_retries = runner.complete_batch_with_retries
            original_build_result_rows = runner.build_result_rows
            original_try_create_metadata_sidecar_client = runner.try_create_metadata_sidecar_client
            original_close_metadata_sidecar_client = runner.close_metadata_sidecar_client
            original_build_sidecar_metadata_resolver = runner.build_sidecar_metadata_resolver

            runner.select_candidate_songs = lambda args: [
                {"id": f"song-{index}", "title": f"歌{index}", "primary_artist_name": "歌手"}
                for index in range(6)
            ]
            runner.read_completed_song_ids = lambda output: set()
            runner.resolve_llm_model = lambda args: "test-model"
            runner.try_create_metadata_sidecar_client = lambda args: None
            runner.close_metadata_sidecar_client = lambda client: None
            runner.build_sidecar_metadata_resolver = lambda client, args: None

            def fake_complete_batch_with_retries(batch, args, metadata_resolver=None, playlist_evidence_resolver=None):
                nonlocal active, max_active
                with lock:
                    active += 1
                    max_active = max(max_active, active)
                time.sleep(0.02)
                with lock:
                    active -= 1
                return {str(index + 1): ["流行"] for index, _song in enumerate(batch)}

            runner.complete_batch_with_retries = fake_complete_batch_with_retries
            runner.build_result_rows = lambda batch, results, model: [
                {
                    "songId": song["id"],
                    "title": song["title"],
                    "artistName": song["primary_artist_name"],
                    "status": "tagged",
                    "tags": ["流行"],
                    "source": runner.SOURCE,
                    "model": model,
                    "confidence": runner.DEFAULT_CONFIDENCE,
                    "evidence": [],
                    "createdAt": runner.now_iso(),
                }
                for song in batch
            ]
            args = runner.parse_args(
                [
                    "run",
                    "--batch-size",
                    "1",
                    "--concurrency",
                    "3",
                    "--output",
                    str(output_path),
                    "--state",
                    str(state_path),
                ]
            )
            try:
                runner.run(args)
            finally:
                runner.select_candidate_songs = original_select_candidate_songs
                runner.read_completed_song_ids = original_read_completed_song_ids
                runner.resolve_llm_model = original_resolve_llm_model
                runner.complete_batch_with_retries = original_complete_batch_with_retries
                runner.build_result_rows = original_build_result_rows
                runner.try_create_metadata_sidecar_client = original_try_create_metadata_sidecar_client
                runner.close_metadata_sidecar_client = original_close_metadata_sidecar_client
                runner.build_sidecar_metadata_resolver = original_build_sidecar_metadata_resolver

            self.assertGreater(max_active, 1)
            rows = runner.read_result_rows(output_path)
            self.assertEqual(len(rows), 6)

    def test_run_marks_failed_batch_rows_without_aborting_remaining_batches(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            output_path = Path(temp_dir) / "tags.jsonl"
            state_path = Path(temp_dir) / "tags.state.json"

            original_select_candidate_songs = runner.select_candidate_songs
            original_read_completed_song_ids = runner.read_completed_song_ids
            original_resolve_llm_model = runner.resolve_llm_model
            original_complete_batch_with_retries = runner.complete_batch_with_retries
            original_try_create_metadata_sidecar_client = runner.try_create_metadata_sidecar_client
            original_close_metadata_sidecar_client = runner.close_metadata_sidecar_client
            original_build_sidecar_metadata_resolver = runner.build_sidecar_metadata_resolver

            runner.select_candidate_songs = lambda args: [
                {"id": "song-1", "title": "歌1", "primary_artist_name": "歌手1"},
                {"id": "song-2", "title": "歌2", "primary_artist_name": "歌手2"},
                {"id": "song-3", "title": "歌3", "primary_artist_name": "歌手3"},
            ]
            runner.read_completed_song_ids = lambda output: set()
            runner.resolve_llm_model = lambda args: "test-model"
            runner.try_create_metadata_sidecar_client = lambda args: None
            runner.close_metadata_sidecar_client = lambda client: None
            runner.build_sidecar_metadata_resolver = lambda client, args: None

            def fake_complete_batch_with_retries(batch, args, metadata_resolver=None, playlist_evidence_resolver=None):
                if batch[0]["id"] == "song-2":
                    raise RuntimeError("LLM upstream timeout")
                return {str(index + 1): ["流行"] for index, _song in enumerate(batch)}

            runner.complete_batch_with_retries = fake_complete_batch_with_retries
            args = runner.parse_args(
                [
                    "run",
                    "--batch-size",
                    "1",
                    "--concurrency",
                    "2",
                    "--output",
                    str(output_path),
                    "--state",
                    str(state_path),
                ]
            )
            try:
                runner.run(args)
            finally:
                runner.select_candidate_songs = original_select_candidate_songs
                runner.read_completed_song_ids = original_read_completed_song_ids
                runner.resolve_llm_model = original_resolve_llm_model
                runner.complete_batch_with_retries = original_complete_batch_with_retries
                runner.try_create_metadata_sidecar_client = original_try_create_metadata_sidecar_client
                runner.close_metadata_sidecar_client = original_close_metadata_sidecar_client
                runner.build_sidecar_metadata_resolver = original_build_sidecar_metadata_resolver

            rows = sorted(runner.read_result_rows(output_path), key=lambda row: row["songId"])
            self.assertEqual([row["songId"] for row in rows], ["song-1", "song-2", "song-3"])
            self.assertEqual([row["status"] for row in rows], ["tagged", "failed", "tagged"])
            self.assertIn("LLM upstream timeout", rows[1]["error"])


if __name__ == "__main__":
    unittest.main()
