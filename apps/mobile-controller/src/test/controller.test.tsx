import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect } from "react";
import type { RoomControlSnapshot } from "@home-ktv/player-contracts";
import {
  addQueueEntry,
  deleteQueueEntry,
  getOrCreateDeviceId,
  promoteQueueEntry,
  requestSupplement,
  skipCurrent,
  switchVocalMode,
  undoDeleteQueueEntry
} from "../api/client.js";
import { App } from "../App.js";
import { fallbackPollingIntervalMs, sessionRefreshIntervalMs, useRoomController } from "../runtime/use-room-controller.js";

type RequestRecord = {
  url: string;
  method: string;
  body: unknown;
};

beforeEach(() => {
  vi.stubGlobal("localStorage", createMemoryStorage());
  vi.stubGlobal("crypto", { randomUUID: () => "test-uuid" });
  window.history.pushState({}, "", "/controller?room=living-room");
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("mobile controller API client", () => {
  it("stores only home_ktv_device_id and never stores pairing or control tokens", () => {
    const deviceId = getOrCreateDeviceId();

    expect(deviceId).toMatch(/^mobile-/u);
    expect(localStorage.getItem("home_ktv_device_id")).toBe(deviceId);
    expect(Object.keys(localStorage)).toEqual(["home_ktv_device_id"]);
  });

  it("falls back to a generated device id when crypto.randomUUID is unavailable", () => {
    vi.stubGlobal("crypto", {});

    const deviceId = getOrCreateDeviceId();

    expect(deviceId).toMatch(/^mobile-/u);
    expect(localStorage.getItem("home_ktv_device_id")).toBe(deviceId);
  });

  it("falls back to a generated device id when localStorage is unavailable", () => {
    vi.stubGlobal("localStorage", {
      getItem() {
        throw new Error("storage unavailable");
      },
      setItem() {
        throw new Error("storage unavailable");
      }
    });

    const deviceId = getOrCreateDeviceId();

    expect(deviceId).toMatch(/^mobile-/u);
  });

  it("sends commandId, sessionVersion, and deviceId with all command helpers", async () => {
    const { requests } = installFetchMock();
    const base = {
      roomSlug: "living-room",
      deviceId: "phone-1",
      sessionVersion: 7
    };

    await addQueueEntry({ ...base, songId: "song-1" });
    await deleteQueueEntry({ ...base, queueEntryId: "queue-1" });
    await undoDeleteQueueEntry({ ...base, queueEntryId: "queue-1" });
    await promoteQueueEntry({ ...base, queueEntryId: "queue-2" });
    await skipCurrent({ ...base, confirmSkip: true });
    await switchVocalMode({ ...base, playbackPositionMs: 1234 });
    await requestSupplement({
      ...base,
      provider: "demo-provider",
      providerCandidateId: "remote-qilixiang"
    });

    expect(requests.map((request) => request.url)).toEqual([
      "/rooms/living-room/commands/add-queue-entry",
      "/rooms/living-room/commands/delete-queue-entry",
      "/rooms/living-room/commands/undo-delete-queue-entry",
      "/rooms/living-room/commands/promote-queue-entry",
      "/rooms/living-room/commands/skip-current",
      "/rooms/living-room/commands/switch-vocal-mode",
      "/rooms/living-room/commands/request-supplement"
    ]);
    for (const request of requests) {
      expect(request.method).toBe("POST");
      expect(request.body).toMatchObject({
        commandId: expect.stringMatching(/^mobile-command-/u),
        sessionVersion: 7,
        deviceId: "phone-1"
      });
    }
  });
});

describe("mobile controller runtime", () => {
  it("switches the KTV controller chrome between Chinese and English", async () => {
    const user = userEvent.setup();
    installControllerFetchMock({
      restoreResponses: [json(sessionResponse(roomSnapshot()))]
    });
    installWebSocketMock();

    render(<App />);

    await screen.findByRole("heading", { name: "点歌控制台" });
    await user.click(screen.getByRole("button", { name: "English" }));

    expect(screen.getByRole("heading", { name: "KTV controller" })).toBeTruthy();
    expect(screen.getByText("TV online")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Search songs" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "中文" }));

    expect(screen.getByRole("heading", { name: "点歌控制台" })).toBeTruthy();
    expect(screen.getByText("电视在线")).toBeTruthy();
    expect(screen.getByRole("region", { name: "当前播放" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "播放队列" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "搜索歌曲" })).toBeTruthy();
  });

  it("places song search before the queue for the phone-first flow", async () => {
    installControllerFetchMock({
      restoreResponses: [json(sessionResponse(roomSnapshot()))]
    });
    installWebSocketMock();

    render(<App />);

    await screen.findByText("电视在线");
    const current = screen.getByRole("region", { name: "当前播放" });
    const search = screen.getByRole("region", { name: "搜索歌曲" });
    const queue = screen.getByRole("region", { name: "播放队列" });

    expect(current).toBeTruthy();
    expect(search.compareDocumentPosition(queue) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("shows an empty online supplement state when a search has no local result and no candidates", async () => {
    const user = userEvent.setup();
    installControllerFetchMock({
      restoreResponses: [json(sessionResponse(roomSnapshot()))],
      songSearchResponse: emptySongSearchResponse
    });
    installWebSocketMock();

    render(<App />);

    await screen.findByText("电视在线");
    await user.clear(screen.getByLabelText("搜索关键词"));
    await user.type(screen.getByLabelText("搜索关键词"), "不存在的歌曲");

    expect(await screen.findByText("暂未找到在线补歌候选")).toBeTruthy();
    expect(screen.getByText("当前没有可请求的在线候选，可以换关键词或稍后重试。")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "请求补歌" })).toBeNull();
  });

  it("loads empty song search results after control-session restore", async () => {
    const { requests } = installControllerFetchMock({
      restoreResponses: [json(sessionResponse(roomSnapshot()))]
    });
    installWebSocketMock();

    render(<App />);

    await screen.findByText("电视在线");
    expect(requests.some((request) => request.url === "/rooms/living-room/songs/search?q=&limit=30")).toBe(true);
    expect(requests.some((request) => request.url.endsWith("/available-songs"))).toBe(false);
  });

  it("debounces song search query changes by 250ms", async () => {
    vi.useFakeTimers();
    const { requests } = installControllerFetchMock({
      restoreResponses: [json(sessionResponse(roomSnapshot()))]
    });
    installWebSocketMock();
    const controller = renderControllerProbe();
    await flush();
    requests.length = 0;

    act(() => {
      controller.current?.setSongSearchQuery("qlx");
    });
    await vi.advanceTimersByTimeAsync(249);
    expect(requests.some((request) => request.url === "/rooms/living-room/songs/search?q=qlx&limit=30")).toBe(false);
    await vi.advanceTimersByTimeAsync(1);

    await flush();
    expect(requests.some((request) => request.url === "/rooms/living-room/songs/search?q=qlx&limit=30")).toBe(true);
  });

  it("submits the latest song search query immediately", async () => {
    vi.useFakeTimers();
    const { requests } = installControllerFetchMock({
      restoreResponses: [json(sessionResponse(roomSnapshot()))]
    });
    installWebSocketMock();
    const controller = renderControllerProbe();
    await flush();
    requests.length = 0;

    act(() => {
      controller.current?.setSongSearchQuery("qlx");
      controller.current?.submitSongSearch();
    });
    await flush();

    expect(requests.some((request) => request.url === "/rooms/living-room/songs/search?q=qlx&limit=30")).toBe(true);
  });

  it("sends selected assetId when adding a song version", async () => {
    const { requests } = installControllerFetchMock({
      restoreResponses: [json(sessionResponse(roomSnapshot()))]
    });
    installWebSocketMock();
    const controller = renderControllerProbe();
    await flush();

    await act(async () => {
      await controller.current?.addSongVersion("song-ready", "asset-ready-alt");
    });

    expect(requests.find((request) => request.url === "/rooms/living-room/commands/add-queue-entry")?.body).toMatchObject({
      songId: "song-ready",
      assetId: "asset-ready-alt"
    });
  });

  it("requires duplicate confirmation before re-adding a queued song version", async () => {
    const { requests } = installControllerFetchMock({
      restoreResponses: [json(sessionResponse(roomSnapshot()))]
    });
    installWebSocketMock();
    const controller = renderControllerProbe();
    await flush();

    act(() => {
      controller.current?.requestAddSongVersion("song-ready", "asset-ready-alt", "Ready Song", "queued");
    });

    expect(controller.current?.duplicateConfirm).toEqual({
      songId: "song-ready",
      assetId: "asset-ready-alt",
      title: "Ready Song"
    });
    expect(requests.some((request) => request.url === "/rooms/living-room/commands/add-queue-entry")).toBe(false);

    await act(async () => {
      await controller.current?.confirmDuplicateAdd();
    });

    expect(controller.current?.duplicateConfirm).toBeNull();
    expect(requests.find((request) => request.url === "/rooms/living-room/commands/add-queue-entry")?.body).toMatchObject({
      songId: "song-ready",
      assetId: "asset-ready-alt"
    });
  });

  it("tries cookie restore before token exchange and removes token after success", async () => {
    window.history.pushState({}, "", "/controller?room=living-room&token=pair-token");
    const { requests } = installControllerFetchMock({
      restoreResponses: [json({ code: "CONTROL_SESSION_REQUIRED" }, 401)],
      createResponses: [json(sessionResponse(roomSnapshot()))]
    });
    installWebSocketMock();

    render(<App />);

    expect(await screen.findByText("电视在线")).toBeTruthy();
    expect(requests.slice(0, 2).map((request) => `${request.method} ${request.url}`)).toEqual([
      "GET /rooms/living-room/control-session?deviceId=mobile-test-uuid",
      "POST /rooms/living-room/control-sessions"
    ]);
    expect(window.location.search).toBe("?room=living-room");
  });

  it("falls back to cookie restore when token exchange returns INVALID_PAIRING_TOKEN", async () => {
    window.history.pushState({}, "", "/controller?room=living-room&token=expired-token");
    const { requests } = installControllerFetchMock({
      restoreResponses: [json({ code: "CONTROL_SESSION_REQUIRED" }, 401), json(sessionResponse(roomSnapshot()))],
      createResponses: [json({ code: "INVALID_PAIRING_TOKEN" }, 401)]
    });
    installWebSocketMock();

    render(<App />);

    expect(await screen.findByText("电视在线")).toBeTruthy();
    expect(requests.slice(0, 3).map((request) => `${request.method} ${request.url}`)).toEqual([
      "GET /rooms/living-room/control-session?deviceId=mobile-test-uuid",
      "POST /rooms/living-room/control-sessions",
      "GET /rooms/living-room/control-session?deviceId=mobile-test-uuid"
    ]);
    expect(window.location.search).toBe("?room=living-room");
  });

  it("shows reconnect state and polls every 5000ms after WebSocket disconnect", async () => {
    vi.useFakeTimers();
    const { requests } = installControllerFetchMock({
      restoreResponses: [json(sessionResponse(roomSnapshot())), json(sessionResponse(roomSnapshot({ sessionVersion: 2 })))]
    });
    const sockets = installWebSocketMock();

    render(<App />);
    await flush();
    expect(screen.getByText("电视在线")).toBeTruthy();
    sockets[0]?.emitOpen();
    sockets[0]?.emitClose();

    await flush();
    expect(screen.getByText("连接中断，正在重连")).toBeTruthy();
    await vi.advanceTimersByTimeAsync(fallbackPollingIntervalMs);
    expect(requests.filter((request) => request.url.includes("/control-session")).length).toBeGreaterThanOrEqual(2);
  });

  it("refreshes the httpOnly cookie Max-Age every 15 minutes while WebSocket is connected", async () => {
    vi.useFakeTimers();
    const { requests } = installControllerFetchMock({
      restoreResponses: [json(sessionResponse(roomSnapshot())), json(sessionResponse(roomSnapshot({ sessionVersion: 2 })))]
    });
    const sockets = installWebSocketMock();

    render(<App />);
    await flush();
    expect(screen.getByText("电视在线")).toBeTruthy();
    sockets[0]?.emitOpen();
    await vi.advanceTimersByTimeAsync(sessionRefreshIntervalMs);
    expect(requests.filter((request) => request.url.includes("/control-session")).length).toBeGreaterThanOrEqual(2);
  });

  it("confirms skip before sending confirmSkip true", async () => {
    const user = userEvent.setup();
    const { requests } = installControllerFetchMock({
      restoreResponses: [json(sessionResponse(roomSnapshot()))],
      commandResponses: {
        "/rooms/living-room/commands/skip-current": json({ status: "accepted", snapshot: roomSnapshot({ sessionVersion: 2 }) })
      }
    });
    installWebSocketMock();

    render(<App />);
    await screen.findByText("电视在线");
    await user.click(screen.getByRole("button", { name: "切歌" }));
    expect(screen.getByRole("dialog", { name: "确认切歌" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "确认" }));
    await flush();

    expect(requests.some((request) => request.url === "/rooms/living-room/commands/skip-current")).toBe(true);
    expect(requests.find((request) => request.url === "/rooms/living-room/commands/skip-current")?.body).toMatchObject({
      confirmSkip: true
    });
  });

  it("marks destructive queue and skip actions with danger styling hooks", async () => {
    const user = userEvent.setup();
    installControllerFetchMock({
      restoreResponses: [json(sessionResponse(roomSnapshot()))]
    });
    installWebSocketMock();

    render(<App />);

    await screen.findByText("下一首");
    expect(screen.getByRole("button", { name: "删除" }).className).toContain("danger-button");

    await user.click(screen.getByRole("button", { name: "切歌" }));
    expect(screen.getByRole("button", { name: "确认" }).className).toContain("danger-button");
  });

  it("deletes immediately and shows undo only from server undoExpiresAt", async () => {
    const user = userEvent.setup();
    const undoExpiresAt = "2026-05-04T10:01:00.000Z";
    const { requests } = installControllerFetchMock({
      restoreResponses: [json(sessionResponse(roomSnapshot()))],
      commandResponses: {
        "/rooms/living-room/commands/delete-queue-entry": json({
          status: "accepted",
          snapshot: roomSnapshot({ queueUndoExpiresAt: undoExpiresAt, queueStatus: "removed", sessionVersion: 2 }),
          undo: { queueEntryId: "queue-next", undoExpiresAt }
        }),
        "/rooms/living-room/commands/undo-delete-queue-entry": json({
          status: "accepted",
          snapshot: roomSnapshot({ sessionVersion: 3 })
        })
      }
    });
    installWebSocketMock();

    render(<App />);
    await screen.findByText("下一首");
    expect(screen.queryByRole("button", { name: "撤销" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "删除" }));

    expect(await screen.findByRole("button", { name: "撤销" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "撤销" }));
    await flush();
    expect(requests.some((request) => request.url === "/rooms/living-room/commands/undo-delete-queue-entry")).toBe(true);
  });

  it("sends vocal switch immediately without confirmation", async () => {
    const user = userEvent.setup();
    const { requests } = installControllerFetchMock({
      restoreResponses: [json(sessionResponse(roomSnapshot()))],
      commandResponses: {
        "/rooms/living-room/commands/switch-vocal-mode": json({
          status: "accepted",
          snapshot: roomSnapshot({ sessionVersion: 2 })
        })
      }
    });
    installWebSocketMock();

    render(<App />);
    await screen.findByRole("button", { name: "切到原唱" });
    await user.click(screen.getByRole("button", { name: "切到原唱" }));
    await flush();

    expect(requests.some((request) => request.url === "/rooms/living-room/commands/switch-vocal-mode")).toBe(true);
    expect(screen.queryByRole("dialog", { name: "确认切歌" })).toBeNull();
  });

  it("shows the switch-to-instrumental control when the current track is original", async () => {
    const user = userEvent.setup();
    const baseSnapshot = roomSnapshot();
    const currentTarget = baseSnapshot.currentTarget!;
    const switchTarget = baseSnapshot.switchTarget!;
    const originalSnapshot: RoomControlSnapshot = {
      ...baseSnapshot,
      currentTarget: {
        currentQueueEntryPreview: currentTarget.currentQueueEntryPreview,
        nextQueueEntryPreview: currentTarget.nextQueueEntryPreview,
        queueEntryId: currentTarget.queueEntryId,
        resumePositionMs: currentTarget.resumePositionMs,
        roomId: currentTarget.roomId,
        sessionVersion: currentTarget.sessionVersion,
        assetId: "asset-original",
        playbackUrl: "http://ktv.local/media/asset-original",
        switchFamily: currentTarget.switchFamily,
        vocalMode: "original"
      },
      switchTarget: {
        playbackUrl: "http://ktv.local/media/asset-instrumental",
        queueEntryId: switchTarget.queueEntryId,
        resumePositionMs: switchTarget.resumePositionMs,
        rollbackAssetId: "asset-original",
        roomId: switchTarget.roomId,
        sessionVersion: switchTarget.sessionVersion,
        switchFamily: switchTarget.switchFamily,
        fromAssetId: "asset-original",
        toAssetId: "asset-instrumental",
        vocalMode: "instrumental"
      }
    };
    const { requests } = installControllerFetchMock({
      restoreResponses: [json(sessionResponse(originalSnapshot))],
      commandResponses: {
        "/rooms/living-room/commands/switch-vocal-mode": json({
          status: "accepted",
          snapshot: {
            ...originalSnapshot,
            sessionVersion: 2
          }
        })
      }
    });
    installWebSocketMock();

    render(<App />);

    await screen.findByText("电视在线");
    expect(screen.getByRole("button", { name: "切到伴唱" })).toBeTruthy();
    expect(screen.getByLabelText("current-vocal-mode").textContent).toContain("原唱");

    await user.click(screen.getByRole("button", { name: "切到伴唱" }));
    await flush();

    expect(requests.some((request) => request.url === "/rooms/living-room/commands/switch-vocal-mode")).toBe(true);
    expect(requests.find((request) => request.url === "/rooms/living-room/commands/switch-vocal-mode")?.body).toMatchObject({
      playbackPositionMs: 1234
    });
  });

  it("shows the current vocal mode clearly in the playback panel", async () => {
    const { requests } = installControllerFetchMock({
      restoreResponses: [json(sessionResponse(roomSnapshot()))]
    });
    installWebSocketMock();

    render(<App />);

    await screen.findByText("电视在线");
    expect(requests.some((request) => request.url.includes("/control-session"))).toBe(true);
    const modeSummary = screen.getByLabelText("current-vocal-mode");
    expect(modeSummary.textContent).toContain("当前模式");
    expect(modeSummary.textContent).toContain("伴唱");
  });

  it("does not expose raw playback or vocal enum labels in the Chinese controller", async () => {
    installControllerFetchMock({
      restoreResponses: [json(sessionResponse(roomSnapshot()))]
    });
    installWebSocketMock();

    render(<App />);

    await screen.findByText("电视在线");
    expect(screen.getByText("播放中")).toBeTruthy();
    expect(screen.getAllByText("伴唱").length).toBeGreaterThan(0);
    expect(screen.getByText("当前模式")).toBeTruthy();

    const appText = screen.getByLabelText("Home KTV 点歌控制台").textContent ?? "";
    expect(appText).not.toContain("unknown");
    expect(appText).not.toContain("original");
    expect(appText).not.toContain("instrumental");
    expect(appText).not.toContain("playing");
  });

  it("searches while typing and submits immediately from the search form", async () => {
    vi.useFakeTimers();
    const { requests } = installControllerFetchMock({
      restoreResponses: [json(sessionResponse(roomSnapshot()))]
    });
    installWebSocketMock();

    render(<App />);
    await flush();
    expect(screen.getByText("电视在线")).toBeTruthy();
    const searchInput = screen.getByLabelText("搜索关键词");
    requests.length = 0;

    fireEvent.change(searchInput, { target: { value: "qlx" } });
    await vi.advanceTimersByTimeAsync(250);
    expect(requests.some((request) => request.url === "/rooms/living-room/songs/search?q=qlx&limit=30")).toBe(true);

    requests.length = 0;
    fireEvent.change(searchInput, { target: { value: "晴天" } });
    fireEvent.submit(searchInput.closest("form")!);
    await flush();
    expect(requests.some((request) => request.url === "/rooms/living-room/songs/search?q=%E6%99%B4%E5%A4%A9&limit=30")).toBe(true);
  });

  it("renders local search results, statuses, version hints, and selected asset add buttons", async () => {
    const user = userEvent.setup();
    const { requests } = installControllerFetchMock({
      restoreResponses: [json(sessionResponse(roomSnapshot()))]
    });
    installWebSocketMock();

    render(<App />);

    expect(await screen.findByText("晴天")).toBeTruthy();
    expect(screen.getByText("本地可播")).toBeTruthy();
    expect(screen.getByText("已点 / 队列中")).toBeTruthy();
    expect(screen.getByText("1 个版本")).toBeTruthy();
    expect(screen.getByText("2 个版本")).toBeTruthy();
    expect(screen.getByText("推荐")).toBeTruthy();
    expect(screen.getByText("现场版")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "点歌" }));
    await flush();

    expect(requests.find((request) => request.url === "/rooms/living-room/commands/add-queue-entry")?.body).toMatchObject({
      songId: "song-sunny",
      assetId: "asset-sunny-main"
    });
  });

  it("confirms queued multi-version duplicate add before sending the selected assetId", async () => {
    const user = userEvent.setup();
    const { requests } = installControllerFetchMock({
      restoreResponses: [json(sessionResponse(roomSnapshot()))]
    });
    installWebSocketMock();

    render(<App />);
    await screen.findAllByText("七里香");
    const versionButtons = screen.getAllByRole("button", { name: "点这个版本" });

    await user.click(versionButtons[1]!);

    expect(screen.getByRole("dialog", { name: "重复点歌" })).toBeTruthy();
    expect(requests.some((request) => request.url === "/rooms/living-room/commands/add-queue-entry")).toBe(false);
    await user.click(screen.getByRole("button", { name: "确认加点" }));
    await flush();

    expect(requests.find((request) => request.url === "/rooms/living-room/commands/add-queue-entry")?.body).toMatchObject({
      songId: "song-qlx",
      assetId: "asset-qlx-live"
    });
  });

  it("shows local empty state before actionable online supplement candidates without disabled duplicate controls", async () => {
    installControllerFetchMock({
      restoreResponses: [json(sessionResponse(roomSnapshot()))],
      songSearchResponse: (query) => ({
        query,
        local: [],
        online: {
          status: "available",
          message: "找到在线补歌候选",
          requestSupplement: { visible: true, label: "请求补歌" },
          candidates: [
            {
              provider: "demo-provider",
              providerCandidateId: "remote-qilixiang",
              title: "七里香",
              artistName: "周杰伦",
              sourceLabel: "Demo Provider",
              durationMs: 180000,
              candidateType: "mv",
              reliabilityLabel: "high",
              riskLabel: "normal",
              taskState: "discovered",
              taskId: "task-1"
            }
          ]
        }
      })
    });
    installWebSocketMock();

    render(<App />);

    await screen.findByText("电视在线");
    expect(screen.getByText("本地未找到")).toBeTruthy();
    expect(screen.getByText("找到在线补歌候选")).toBeTruthy();
    const requestButtons = screen.getAllByRole("button", { name: "请求补歌" }) as HTMLButtonElement[];
    expect(requestButtons).toHaveLength(1);
    expect(requestButtons[0]?.disabled).toBe(false);
    expect(screen.getByText("七里香", { selector: "strong" })).toBeTruthy();
    expect(screen.getByText("MV")).toBeTruthy();
    expect(screen.getByText("高可靠")).toBeTruthy();
    expect(screen.getByText("普通风险")).toBeTruthy();
    expect(screen.getByText("已发现")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "加点" })).toBeNull();
    expect(screen.queryByRole("button", { name: "点歌" })).toBeNull();
  });

  it("renders online supplement candidates below local results when both exist", async () => {
    installControllerFetchMock({
      restoreResponses: [json(sessionResponse(roomSnapshot()))],
      songSearchResponse: (query) => ({
        query,
        local: [
          {
            songId: "song-sunny",
            title: "晴天",
            artistName: "周杰伦",
            language: "mandarin",
            matchReason: "title",
            queueState: "not_queued",
            versions: [
              {
                assetId: "asset-sunny-main",
                displayName: "高清版",
                sourceType: "local",
                sourceLabel: "本地",
                durationMs: 180000,
                qualityLabel: "HD",
                isRecommended: true
              }
            ]
          }
        ],
        online: {
          status: "available",
          message: "找到在线补歌候选",
          requestSupplement: { visible: true, label: "请求补歌" },
          candidates: [
            {
              provider: "demo-provider",
              providerCandidateId: "remote-qilixiang",
              title: "远端七里香",
              artistName: "周杰伦",
              sourceLabel: "Demo Provider",
              durationMs: 180000,
              candidateType: "mv",
              reliabilityLabel: "high",
              riskLabel: "normal",
              taskState: "discovered",
              taskId: "task-1"
            }
          ]
        }
      })
    });
    installWebSocketMock();

    render(<App />);

    await screen.findByText("晴天");
    await screen.findByText("远端七里香");
    const searchPanelText = screen.getByRole("region", { name: "搜索歌曲" }).textContent ?? "";
    const localIndex = searchPanelText.indexOf("晴天");
    const onlineIndex = searchPanelText.indexOf("远端七里香");

    expect(localIndex).toBeGreaterThanOrEqual(0);
    expect(onlineIndex).toBeGreaterThanOrEqual(0);
    expect(localIndex).toBeLessThan(onlineIndex);
  });

  it("keeps request supplement disabled while submission is pending and then shows ready state", async () => {
    const user = userEvent.setup();
    const supplement = deferred<Response>();
    installControllerFetchMock({
      restoreResponses: [json(sessionResponse(roomSnapshot()))],
      commandResponses: {
        "/rooms/living-room/commands/request-supplement": supplement.promise
      },
      songSearchResponse: (query) => ({
        query,
        local: [],
        online: {
          status: "available",
          message: "找到在线补歌候选",
          requestSupplement: { visible: true, label: "请求补歌" },
          candidates: [
            {
              provider: "demo-provider",
              providerCandidateId: "remote-qilixiang",
              title: "七里香",
              artistName: "周杰伦",
              sourceLabel: "Demo Provider",
              durationMs: 180000,
              candidateType: "mv",
              reliabilityLabel: "high",
              riskLabel: "normal",
              taskState: "discovered",
              taskId: "task-1"
            }
          ]
        }
      })
    });
    installWebSocketMock();

    render(<App />);

    await screen.findByText("七里香", { selector: "strong" });
    const requestButton = screen.getByRole("button", { name: "请求补歌" }) as HTMLButtonElement;
    expect(requestButton.disabled).toBe(false);
    await user.click(requestButton);

    const pendingButton = await screen.findByRole("button", { name: "提交中" });
    expect((pendingButton as HTMLButtonElement).disabled).toBe(true);

    supplement.resolve(
      json({
        status: "accepted",
        commandId: "mobile-command-test",
        sessionVersion: 2,
        task: readySupplementTask()
      })
    );
    await flush();

    expect(screen.getAllByText("已准备").length).toBeGreaterThan(0);
    expect((screen.getByRole("button", { name: "已准备" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("requests supplement explicitly from an online candidate without auto-enqueueing", async () => {
    const user = userEvent.setup();
    const { requests } = installControllerFetchMock({
      restoreResponses: [json(sessionResponse(roomSnapshot()))],
      commandResponses: {
        "/rooms/living-room/commands/request-supplement": json({
          status: "accepted",
          commandId: "mobile-command-test",
          sessionVersion: 2,
          task: {
            id: "task-1",
            roomId: "living-room",
            provider: "demo-provider",
            providerCandidateId: "remote-qilixiang",
            title: "七里香",
            artistName: "周杰伦",
            sourceLabel: "Demo Provider",
            durationMs: 180000,
            candidateType: "mv",
            reliabilityLabel: "high",
            riskLabel: "normal",
            status: "ready",
            failureReason: null,
            recentEvent: { type: "ready" },
            providerPayload: {},
            readyAssetId: "asset-ready-online",
            createdAt: "2026-05-04T10:00:00.000Z",
            updatedAt: "2026-05-04T10:00:01.000Z",
            selectedAt: "2026-05-04T10:00:00.500Z",
            reviewRequiredAt: null,
            fetchingAt: "2026-05-04T10:00:00.600Z",
            fetchedAt: "2026-05-04T10:00:00.700Z",
            readyAt: "2026-05-04T10:00:01.000Z",
            failedAt: null,
            staleAt: null,
            promotedAt: null,
            purgedAt: null
          }
        })
      },
      songSearchResponse: (query) => ({
        query,
        local: [],
        online: {
          status: "available",
          message: "找到在线补歌候选",
          requestSupplement: { visible: true, label: "请求补歌" },
          candidates: [
            {
              provider: "demo-provider",
              providerCandidateId: "remote-qilixiang",
              title: "七里香",
              artistName: "周杰伦",
              sourceLabel: "Demo Provider",
              durationMs: 180000,
              candidateType: "mv",
              reliabilityLabel: "high",
              riskLabel: "normal",
              taskState: "discovered",
              taskId: "task-1"
            }
          ]
        }
      })
    });
    installWebSocketMock();

    render(<App />);

    await screen.findByText("七里香", { selector: "strong" });
    await user.click(screen.getByRole("button", { name: "请求补歌" }));
    await flush();

    expect(requests.find((request) => request.url === "/rooms/living-room/commands/request-supplement")?.body).toMatchObject({
      provider: "demo-provider",
      providerCandidateId: "remote-qilixiang"
    });
    expect(screen.getAllByText("已准备").length).toBeGreaterThan(0);
    expect((screen.getByRole("button", { name: "已准备" }) as HTMLButtonElement).disabled).toBe(true);
    expect(requests.some((request) => request.url === "/rooms/living-room/commands/add-queue-entry")).toBe(false);
  });
});

function installFetchMock() {
  const requests: RequestRecord[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const requestUrl = new URL(String(input), "http://controller.test");
      requests.push({
        url: `${requestUrl.pathname}${requestUrl.search}`,
        method: init?.method ?? "GET",
        body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined
      });
      return new Response(JSON.stringify({ status: "accepted", sessionVersion: 8, snapshot: null }), {
        headers: { "Content-Type": "application/json" },
        status: 200
      });
    })
  );
  return { requests };
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function installControllerFetchMock(options: {
  restoreResponses?: Response[];
  createResponses?: Response[];
  commandResponses?: Record<string, Response | Promise<Response>>;
  songSearchResponse?: (query: string) => unknown;
} = {}) {
  const requests: RequestRecord[] = [];
  const restoreResponses = [...(options.restoreResponses ?? [json(sessionResponse(roomSnapshot()))])];
  const createResponses = [...(options.createResponses ?? [json(sessionResponse(roomSnapshot()))])];
  const commandResponses = options.commandResponses ?? {};

  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const requestUrl = new URL(String(input), "http://controller.test");
      const url = `${requestUrl.pathname}${requestUrl.search}`;
      const method = init?.method ?? "GET";
      const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
      requests.push({ url, method, body });

      if (method === "GET" && requestUrl.pathname.endsWith("/control-session")) {
        return restoreResponses.shift() ?? json(sessionResponse(roomSnapshot()));
      }

      if (method === "POST" && requestUrl.pathname.endsWith("/control-sessions")) {
        return createResponses.shift() ?? json(sessionResponse(roomSnapshot()));
      }

      if (method === "GET" && requestUrl.pathname.endsWith("/available-songs")) {
        return json({
          songs: [{ songId: "song-ready", title: "晴天", artistName: "周杰伦", language: "mandarin", defaultAssetId: "asset-ready", durationMs: 180000 }]
        });
      }

      if (method === "GET" && requestUrl.pathname.endsWith("/songs/search")) {
        const query = requestUrl.searchParams.get("q") ?? "";
        return json((options.songSearchResponse ?? songSearchResponse)(query));
      }

      const commandResponse = commandResponses[requestUrl.pathname];
      if (method === "POST" && commandResponse) {
        return commandResponse;
      }

      if (method === "POST" && requestUrl.pathname.includes("/commands/")) {
        return json({ status: "accepted", snapshot: roomSnapshot({ sessionVersion: 2 }) });
      }

      return json({ code: "NOT_FOUND" }, 404);
    })
  );

  return { requests };
}

function renderControllerProbe() {
  const holder: { current: any } = { current: null };

  function ControllerProbe() {
    const controller = useRoomController();
    useEffect(() => {
      holder.current = controller;
    }, [controller]);
    return null;
  }

  render(<ControllerProbe />);
  return holder;
}

class FakeWebSocket {
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(readonly url: string) {}

  close(): void {}

  emitOpen(): void {
    this.onopen?.();
  }

  emitClose(): void {
    this.onclose?.();
  }

  emitSnapshot(snapshot: RoomControlSnapshot): void {
    this.onmessage?.({
      data: JSON.stringify({
        type: "room.control.snapshot.updated",
        payload: snapshot
      })
    });
  }
}

function installWebSocketMock(): FakeWebSocket[] {
  const sockets: FakeWebSocket[] = [];
  vi.stubGlobal(
    "WebSocket",
    class extends FakeWebSocket {
      constructor(url: string) {
        super(url);
        sockets.push(this);
      }
    }
  );
  return sockets;
}

function sessionResponse(snapshot: RoomControlSnapshot) {
  return {
    controlSession: {
      id: "control-session-1",
      roomId: "living-room",
      roomSlug: "living-room",
      deviceId: "mobile-test-uuid",
      deviceName: "Phone",
      expiresAt: "2026-05-04T12:00:00.000Z",
      lastSeenAt: "2026-05-04T10:00:00.000Z"
    },
    snapshot
  };
}

function songSearchResponse(query: string) {
  return {
    query,
    local: [
      {
        songId: "song-sunny",
        title: "晴天",
        artistName: "周杰伦",
        language: "mandarin",
        matchReason: query ? "initials" : "default",
        queueState: "not_queued",
        versions: [
          {
            assetId: "asset-sunny-main",
            displayName: "高清版",
            sourceType: "local",
            sourceLabel: "本地",
            durationMs: 180000,
            qualityLabel: "HD",
            isRecommended: true
          }
        ]
      },
      {
        songId: "song-qlx",
        title: "七里香",
        artistName: "周杰伦",
        language: "mandarin",
        matchReason: query ? "initials" : "default",
        queueState: "queued",
        versions: [
          {
            assetId: "asset-qlx-hd",
            displayName: "高清版",
            sourceType: "local",
            sourceLabel: "本地",
            durationMs: 240000,
            qualityLabel: "HD",
            isRecommended: true
          },
          {
            assetId: "asset-qlx-live",
            displayName: "现场版",
            sourceType: "online_cached",
            sourceLabel: "缓存",
            durationMs: 245000,
            qualityLabel: "Live",
            isRecommended: false
          }
        ]
      }
    ],
    online: { status: "disabled", message: "本地未入库，补歌功能后续可用", candidates: [] }
  };
}

function emptySongSearchResponse(query: string) {
  return {
    query,
    local: [],
    online: {
      status: "disabled",
      message: "本地未入库，补歌功能后续可用",
      requestSupplement: { visible: true, label: "请求补歌" },
      candidates: []
    }
  };
}

function readySupplementTask() {
  return {
    id: "task-1",
    roomId: "living-room",
    provider: "demo-provider",
    providerCandidateId: "remote-qilixiang",
    title: "七里香",
    artistName: "周杰伦",
    sourceLabel: "Demo Provider",
    durationMs: 180000,
    candidateType: "mv",
    reliabilityLabel: "high",
    riskLabel: "normal",
    status: "ready",
    failureReason: null,
    recentEvent: { type: "ready" },
    providerPayload: {},
    readyAssetId: "asset-ready-online",
    createdAt: "2026-05-04T10:00:00.000Z",
    updatedAt: "2026-05-04T10:00:01.000Z",
    selectedAt: "2026-05-04T10:00:00.500Z",
    reviewRequiredAt: null,
    fetchingAt: "2026-05-04T10:00:00.600Z",
    fetchedAt: "2026-05-04T10:00:00.700Z",
    readyAt: "2026-05-04T10:00:01.000Z",
    failedAt: null,
    staleAt: null,
    promotedAt: null,
    purgedAt: null
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

function roomSnapshot(options: {
  queueStatus?: "queued" | "removed";
  queueUndoExpiresAt?: string | null;
  sessionVersion?: number;
} = {}): RoomControlSnapshot {
  const queueStatus = options.queueStatus ?? "queued";
  return {
    type: "room.control.snapshot",
    roomId: "living-room",
    roomSlug: "living-room",
    sessionVersion: options.sessionVersion ?? 1,
    state: "playing",
    pairing: {
      roomSlug: "living-room",
      controllerUrl: "http://ktv.local/controller?room=living-room",
      qrPayload: "http://ktv.local/controller?room=living-room",
      token: "token",
      tokenExpiresAt: "2026-05-04T10:10:00.000Z"
    },
    tvPresence: { online: true, deviceName: "TV", lastSeenAt: "2026-05-04T10:00:00.000Z", conflict: null },
    controllers: { onlineCount: 1 },
    currentTarget: {
      roomId: "living-room",
      sessionVersion: options.sessionVersion ?? 1,
      queueEntryId: "queue-current",
      assetId: "asset-current",
      currentQueueEntryPreview: { queueEntryId: "queue-current", songTitle: "七里香", artistName: "周杰伦" },
      playbackUrl: "http://ktv.local/media/asset-current",
      resumePositionMs: 1234,
      vocalMode: "instrumental",
      switchFamily: "family-main",
      nextQueueEntryPreview: { queueEntryId: "queue-next", songTitle: "下一首", artistName: "歌手" }
    },
    switchTarget: {
      roomId: "living-room",
      sessionVersion: options.sessionVersion ?? 1,
      queueEntryId: "queue-current",
      fromAssetId: "asset-current",
      toAssetId: "asset-original",
      playbackUrl: "http://ktv.local/media/asset-original",
      switchFamily: "family-main",
      vocalMode: "original",
      resumePositionMs: 1234,
      rollbackAssetId: "asset-current"
    },
    queue: [
      {
        queueEntryId: "queue-next",
        songId: "song-next",
        assetId: "asset-next",
        songTitle: "下一首",
        artistName: "歌手",
        requestedBy: "phone-1",
        queuePosition: 2,
        status: queueStatus,
        canPromote: queueStatus === "queued",
        canDelete: queueStatus === "queued",
        undoExpiresAt: options.queueUndoExpiresAt ?? null
      }
    ],
    notice: null,
    generatedAt: "2026-05-04T10:00:00.000Z"
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    status
  });
}

function createMemoryStorage(): Storage {
  const values = new Map<string, string>();
  const storage = {};
  Object.defineProperties(storage, {
    length: {
      get() {
        return values.size;
      }
    },
    clear: {
      value() {
        values.clear();
      }
    },
    getItem: {
      value(key: string) {
        return values.get(key) ?? null;
      }
    },
    key: {
      value(index: number) {
        return [...values.keys()][index] ?? null;
      }
    },
    removeItem: {
      value(key: string) {
        values.delete(key);
      }
    },
    setItem: {
      value(key: string, value: string) {
        values.set(key, value);
        Object.defineProperty(storage, key, {
          configurable: true,
          enumerable: true,
          value
        });
      }
    }
  });
  return storage as Storage;
}
