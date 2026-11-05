import type { SongDiscoveryResponse, SongDiscoverySong } from "@home-ktv/domain";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect } from "react";
import { DEFAULT_ROOM_VOLUME_PERCENT, type RoomControlSnapshot } from "@home-ktv/player-contracts";
import {
  addQueueEntry,
  deleteQueueEntry,
  getOrCreateDeviceId,
  promoteQueueEntry,
  shuffleQueue,
  setVolume,
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

type MockResponse = Response | Promise<Response>;

beforeEach(() => {
  vi.stubGlobal("localStorage", createMemoryStorage());
  vi.stubGlobal("crypto", { randomUUID: () => "test-uuid" });
  window.history.pushState({}, "", "/controller");
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
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

    await addQueueEntry({ ...base, sourceType: "nas", assetId: "asset-1" });
    await deleteQueueEntry({ ...base, queueEntryId: "queue-1" });
    await undoDeleteQueueEntry({ ...base, queueEntryId: "queue-1" });
    await promoteQueueEntry({ ...base, queueEntryId: "queue-2" });
    await shuffleQueue(base);
    await skipCurrent({ ...base, confirmSkip: true });
    await switchVocalMode({ ...base, playbackPositionMs: 1234 });
    await setVolume({ ...base, volumePercent: 65 });

    expect(requests.map((request) => request.url)).toEqual([
      "/rooms/living-room/commands/add-queue-entry",
      "/rooms/living-room/commands/delete-queue-entry",
      "/rooms/living-room/commands/undo-delete-queue-entry",
      "/rooms/living-room/commands/promote-queue-entry",
      "/rooms/living-room/commands/shuffle-queue",
      "/rooms/living-room/commands/skip-current",
      "/rooms/living-room/commands/switch-vocal-mode",
      "/rooms/living-room/commands/set-volume"
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

  it("sends NAS source asset identity without legacy song ids for queue commands", async () => {
    const { requests } = installFetchMock();

    await addQueueEntry({
      roomSlug: "living-room",
      deviceId: "phone-1",
      sessionVersion: 7,
      sourceType: "nas",
      assetId: "ktv-asset-sunny-mkv"
    });

    const body = requests[0]?.body as Record<string, unknown>;
    expect(body).toMatchObject({
      commandId: expect.stringMatching(/^mobile-command-/u),
      sessionVersion: 7,
      deviceId: "phone-1",
      sourceType: "nas",
      assetId: "ktv-asset-sunny-mkv"
    });
    expect(body).not.toHaveProperty("indexedAssetId");
    expect(body).not.toHaveProperty("songId");
  });
});

describe("mobile controller runtime", () => {
  it("shows the login/register gate and does not restore or search as a guest", async () => {
    const { requests } = installControllerFetchMock({
      authMeResponse: json({ code: "AUTH_REQUIRED" }, 401)
    });

    render(<App />);

    expect(await screen.findByRole("heading", { name: "登录 KTV 控制端" })).toBeTruthy();
    expect(screen.getByLabelText("手机号")).toBeTruthy();
    expect(screen.getByLabelText("密码")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "打开搜索" })).toBeNull();
    expect(requests.map((request) => request.url)).toEqual(["/controller/auth/me"]);
  });

  it("logs in and enters the controller home", async () => {
    const user = userEvent.setup();
    const { requests } = installControllerFetchMock({
      authMeResponse: json({ code: "AUTH_REQUIRED" }, 401),
      loginResponse: json({ user: controllerUser() })
    });
    installWebSocketMock();

    render(<App />);

    await user.type(await screen.findByLabelText("手机号"), "13800138000");
    await user.type(screen.getByLabelText("密码"), "abcde");
    await user.click(screen.getByRole("button", { name: "登录" }));

    expect(await screen.findByRole("button", { name: "打开搜索" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "我的" }));
    expect(screen.getByText("阿飞")).toBeTruthy();
    expect(requests.some((request) => request.url === "/controller/auth/login")).toBe(true);
    expect(requests.some((request) => request.url === "/rooms/living-room/control-session?deviceId=mobile-test-uuid")).toBe(true);
  });

  it("switches the KTV controller chrome between Chinese and English", async () => {
    const user = userEvent.setup();
    installControllerFetchMock({
      restoreResponses: [json(sessionResponse(roomSnapshot()))]
    });
    installWebSocketMock();

    render(<App />);

    await waitForControllerHome();
    await user.click(screen.getByRole("button", { name: "English" }));

    expect(screen.getByRole("region", { name: "Music console" })).toBeTruthy();
    expect(screen.getByText("Volume")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "中文" }));

    expect(screen.getByRole("region", { name: "音乐控制台" })).toBeTruthy();
    expect(screen.getByText("音量")).toBeTruthy();
    expect(screen.getByRole("region", { name: "音乐控制台" })).toBeTruthy();
  });

  it("starts on the discovery home and keeps playback controls behind the control tab", async () => {
    installControllerFetchMock({
      restoreResponses: [json(sessionResponse(roomSnapshot()))]
    });
    installWebSocketMock();

    render(<App />);

    const search = await screen.findByRole("region", { name: "搜索歌曲" });
    const recommendations = screen.getByRole("region", { name: "推荐歌曲" });
    expect(search.compareDocumentPosition(recommendations) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole("region", { name: "音乐控制台" })).toBeTruthy();

    await openControlTab();
    const queue = screen.getByRole("region", { name: "播放队列" });
    expect(queue).toBeTruthy();
    const requester = within(queue).getByText("点歌人 阿飞");
    expect(requester).toBeTruthy();
    expect(requester.closest(".queue-meta")).toBeTruthy();
    expect(requester.className).toContain("queue-requester--tone-");
  });

  it("keeps the console visible when multiple TV players are online", async () => {
    installControllerFetchMock({
      restoreResponses: [json(sessionResponse(roomSnapshot({ tvOnlineCount: 2 })))]
    });
    installWebSocketMock();

    render(<App />);

    await openControlTab();

    expect(screen.getByRole("region", { name: "音乐控制台" })).toBeTruthy();
  });

  it("shows a NAS-only empty state when a search has no local result", async () => {
    const user = userEvent.setup();
    installControllerFetchMock({
      restoreResponses: [json(sessionResponse(roomSnapshot()))],
      songSearchResponse: emptySongSearchResponse
    });
    installWebSocketMock();

    render(<App />);

    await screen.findByRole("button", { name: "打开搜索" });
    const dialog = await typeSearchQuery(user, "不存在的歌曲");
    expect(dialog).toBeTruthy();

    await waitFor(() => expect(screen.getByRole("button", { name: "打开搜索" }).textContent).toContain("不存在的歌曲"));
    expect(screen.queryByText("暂未找到在线补歌候选")).toBeNull();
    expect(screen.queryByRole("button", { name: "请求补歌" })).toBeNull();
  });

  it("loads empty song search results after control-session restore", async () => {
    const { requests } = installControllerFetchMock({
      restoreResponses: [json(sessionResponse(roomSnapshot()))]
    });
    installWebSocketMock();

    render(<App />);

    await screen.findByRole("button", { name: "打开搜索" });
    expect(requests.some((request) => request.url === "/rooms/living-room/songs/search?q=&limit=30")).toBe(true);
    expect(requests.some((request) => request.url.startsWith("/rooms/living-room/songs/discovery?"))).toBe(true);
    expect(requests.some((request) => request.url.endsWith("/available-songs"))).toBe(false);
  });

  it("renders artist, genre, and vertical recommendation discovery sections with refresh", async () => {
    const user = userEvent.setup();
    const { requests } = installControllerFetchMock({
      restoreResponses: [json(sessionResponse(roomSnapshot()))]
    });
    installWebSocketMock();

    render(<App />);

    expect(await screen.findByText("歌手点歌")).toBeTruthy();
    expect(screen.getByText("风格点歌")).toBeTruthy();
    await waitFor(() => expect(within(screen.getByRole("button", { name: /歌手点歌/u })).getByText("周杰伦")).toBeTruthy());
    expect(within(screen.getByRole("button", { name: /歌手点歌/u })).getByText("五月天")).toBeTruthy();
    expect(within(screen.getByRole("button", { name: /风格点歌/u })).getByText("流行")).toBeTruthy();
    expect(within(screen.getByRole("button", { name: /风格点歌/u })).getByText("摇滚")).toBeTruthy();
    expect(screen.getByRole("region", { name: "互动快捷操作" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "发表情" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "彩虹屁" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "神吐槽" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "送祝福" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "推荐歌曲" })).toBeTruthy();
    expect(screen.getAllByText("周杰伦").length).toBeGreaterThan(0);
    expect(screen.getAllByText("流行").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/^推荐歌曲/u, { selector: "strong" })).toHaveLength(30);
    const recommendations = screen.getByRole("region", { name: "推荐歌曲" });
    expect(within(recommendations).queryByText("本地可播")).toBeNull();
    expect(within(recommendations).queryByText("流行")).toBeNull();
    expect(within(recommendations).queryByText(/次点歌/u)).toBeNull();
    expect(recommendations.querySelector(".result-meta")).toBeNull();
    expect(recommendations.querySelector('img[src="https://cover.example/thumbs/recommend-1.jpg"]')).toBeTruthy();
    expect(recommendations.querySelector(".song-art--fallback")).toBeTruthy();

    const initialDiscoveryRequests = requests.filter((request) => request.url.startsWith("/rooms/living-room/songs/discovery?"));
    await user.click(screen.getByRole("button", { name: "换一批" }));
    await flush();

    const refreshedDiscoveryRequests = requests.filter((request) => request.url.startsWith("/rooms/living-room/songs/discovery?"));
    expect(refreshedDiscoveryRequests.length).toBeGreaterThan(initialDiscoveryRequests.length);
  });

  it("returns from an artist detail page to the artist list instead of the home page", async () => {
    const user = userEvent.setup();
    installControllerFetchMock({
      restoreResponses: [json(sessionResponse(roomSnapshot()))]
    });
    installWebSocketMock();

    render(<App />);

    await user.click(await screen.findByRole("button", { name: /歌手点歌/u }));
    await user.click(screen.getByRole("button", { name: /周杰伦 2 首歌/u }));
    await user.click(screen.getByRole("button", { name: "返回" }));

    expect(screen.getByRole("heading", { name: "全部歌手" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /周杰伦 2 首歌/u })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /歌手点歌/u })).toBeNull();
  });

  it("loads artist detail songs from the discovery artist endpoint", async () => {
    const user = userEvent.setup();
    const { requests } = installControllerFetchMock({
      restoreResponses: [json(sessionResponse(roomSnapshot()))]
    });
    installWebSocketMock();

    render(<App />);

    await user.click(await screen.findByRole("button", { name: /歌手点歌/u }));
    await user.click(screen.getByRole("button", { name: /周杰伦 2 首歌/u }));

    expect(await screen.findByText("周杰伦详情歌1")).toBeTruthy();
    expect(requests.some((request) => request.url === "/rooms/living-room/songs/discovery/artists/artist-jay/songs?offset=0&limit=60")).toBe(
      true
    );
  });

  it("loads genre detail songs from the discovery genre endpoint", async () => {
    const user = userEvent.setup();
    const { requests } = installControllerFetchMock({
      restoreResponses: [json(sessionResponse(roomSnapshot()))]
    });
    installWebSocketMock();

    render(<App />);

    await user.click(await screen.findByRole("button", { name: /风格点歌/u }));
    await user.click(screen.getByRole("button", { name: /流行 2 首歌/u }));

    expect(await screen.findByText("流行详情歌1")).toBeTruthy();
    expect(requests.some((request) => request.url === "/rooms/living-room/songs/discovery/genres/songs?genre=%E6%B5%81%E8%A1%8C&offset=0&limit=60")).toBe(
      true
    );
  });

  it("shows the current queue count on the control tab", async () => {
    installControllerFetchMock({
      restoreResponses: [json(sessionResponse(roomSnapshot()))]
    });
    installWebSocketMock();

    render(<App />);

    await screen.findByText("歌手点歌");

    const queueButton = screen.getByRole("button", { name: /歌单/u });
    await waitFor(() => {
      expect(queueButton.textContent).toContain("1");
    });
  });

  it("opens the playlist drawer from the music console and closes it", async () => {
    const user = userEvent.setup();
    installControllerFetchMock({
      restoreResponses: [json(sessionResponse(roomSnapshot()))]
    });
    installWebSocketMock();

    render(<App />);

    await screen.findByText("歌手点歌");
    await user.click(screen.getByRole("button", { name: /歌单/u }));
    const drawer = await screen.findByRole("region", { name: "播放队列" });
    expect(within(drawer).getByRole("heading", { name: "播放队列" })).toBeTruthy();

    await user.click(within(drawer).getByRole("button", { name: "关闭" }));
    await waitFor(() => expect(screen.queryByRole("region", { name: "播放队列" })).toBeNull());
  });

  it("shows user profile and request history in the My tab and queues history songs again", async () => {
    const user = userEvent.setup();
    const { requests } = installControllerFetchMock({
      restoreResponses: [json(sessionResponse(roomSnapshot()))],
      controllerHistoryResponse: {
        songs: [
          {
            songId: "ktv-song-sunny",
            assetId: "ktv-song-sunny",
            title: "晴天",
            artistName: "周杰伦",
            requestCount: 3,
            lastRequestedAt: "2026-06-05T10:00:00.000Z"
          }
        ]
      }
    });
    installWebSocketMock();

    render(<App />);

    await screen.findByRole("button", { name: "打开搜索" });
    expect(screen.queryByRole("region", { name: "我的账号" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "我的" }));

    expect(await screen.findByRole("region", { name: "我的账号" })).toBeTruthy();
    expect(screen.getByText("阿飞")).toBeTruthy();
    expect(screen.getByText("13800138000")).toBeTruthy();
    const history = await screen.findByRole("region", { name: "点歌历史" });
    const myScreen = history.closest(".my-screen");
    expect(myScreen).toBeTruthy();
    expect(within(myScreen as HTMLElement).getByRole("region", { name: "我的账号" })).toBeTruthy();
    expect(within(history).getByText("晴天")).toBeTruthy();
    expect(within(history).getByText("周杰伦")).toBeTruthy();
    expect(within(history).getByText("点过 3 次")).toBeTruthy();

    await user.click(within(history).getByRole("button", { name: "再点 晴天" }));
    await flush();

    expect(requests.some((request) => request.url === "/controller/me/song-history")).toBe(true);
    expect(requests.find((request) => request.url === "/rooms/living-room/commands/add-queue-entry")?.body).toMatchObject({
      sourceType: "nas",
      assetId: "ktv-song-sunny"
    });
  });

  it("adds NAS discovery recommendations through the source-aware queue command", async () => {
    const user = userEvent.setup();
    const { requests } = installControllerFetchMock({
      restoreResponses: [json(sessionResponse(roomSnapshot()))],
      songDiscoveryResponse: nasSongDiscoveryResponse
    });
    installWebSocketMock();

    render(<App />);

    const recommendations = await screen.findByRole("region", { name: "推荐歌曲" });
    expect(await within(recommendations).findByText("NAS 晴天")).toBeTruthy();

    await user.click(within(recommendations).getByRole("button", { name: "点歌 NAS 晴天" }));
    expect(screen.getByTestId("queue-add-flyer")).toBeTruthy();
    await flush();

    const addRequest = requests.find((request) => request.url === "/rooms/living-room/commands/add-queue-entry");
    expect(addRequest?.body).toMatchObject({
      sourceType: "nas",
      assetId: "ktv-asset-discovery-sunny"
    });
    expect(addRequest?.body).not.toHaveProperty("indexedAssetId");
    expect(addRequest?.body).not.toHaveProperty("songId");
  });

  it("increments the control tab queue badge immediately while a recommendation add is pending", async () => {
    const user = userEvent.setup();
    const indexedCommand = deferred<Response>();
    installControllerFetchMock({
      restoreResponses: [json(sessionResponse(roomSnapshot())), json(sessionResponse(roomSnapshot({ queueLength: 2, sessionVersion: 3 })))],
      commandResponses: {
        "/rooms/living-room/commands/add-queue-entry": indexedCommand.promise
      },
      songDiscoveryResponse: nasSongDiscoveryResponse
    });
    installWebSocketMock();

    render(<App />);

    const recommendations = await screen.findByRole("region", { name: "推荐歌曲" });
    expect(await within(recommendations).findByText("NAS 晴天")).toBeTruthy();
    const controlTab = screen.getByRole("button", { name: /歌单/u });
    await waitFor(() => {
      expect(controlTab.textContent).toContain("1");
    });

    await user.click(within(recommendations).getByRole("button", { name: "点歌 NAS 晴天" }));

    expect(controlTab.textContent).toContain("2");
    await user.click(controlTab);
    const queue = screen.getByRole("region", { name: "播放队列" });
    expect(within(queue).getByText("NAS 晴天")).toBeTruthy();

    indexedCommand.resolve(json({ status: "accepted", snapshot: roomSnapshot({ queueLength: 2, sessionVersion: 2 }) }));
    await flush();
    await waitFor(() => {
      expect(controlTab.textContent).toContain("2");
    });
  });

  it("retries recommendation queueing once with the latest snapshot after a session version conflict", async () => {
    const user = userEvent.setup();
    const { requests } = installControllerFetchMock({
      restoreResponses: [json(sessionResponse(roomSnapshot()))],
      commandResponses: {
        "/rooms/living-room/commands/add-queue-entry": [
          json({ code: "SESSION_VERSION_CONFLICT", latestSessionVersion: 2, snapshot: roomSnapshot({ sessionVersion: 2 }) }, 409),
          json({ status: "accepted", snapshot: roomSnapshot({ queueLength: 2, sessionVersion: 3 }) })
        ]
      },
      songDiscoveryResponse: nasSongDiscoveryResponse
    });
    installWebSocketMock();

    render(<App />);

    const recommendations = await screen.findByRole("region", { name: "推荐歌曲" });
    expect(await within(recommendations).findByText("NAS 晴天")).toBeTruthy();
    await user.click(within(recommendations).getByRole("button", { name: "点歌 NAS 晴天" }));
    await flush();

    const addRequests = requests.filter((request) => request.url === "/rooms/living-room/commands/add-queue-entry");
    expect(addRequests).toHaveLength(2);
    expect(addRequests[0]?.body).toMatchObject({ sourceType: "nas", assetId: "ktv-asset-discovery-sunny", sessionVersion: 1 });
    expect(addRequests[1]?.body).toMatchObject({ sourceType: "nas", assetId: "ktv-asset-discovery-sunny", sessionVersion: 2 });
  });

  it("sends emoji, rainbow praise, roast, and blessing shortcut interactions", async () => {
    const user = userEvent.setup();
    vi.spyOn(Math, "random").mockReturnValue(0);
    const { requests } = installControllerFetchMock({
      restoreResponses: [json(sessionResponse(roomSnapshot()))]
    });
    installWebSocketMock();

    render(<App />);

    await screen.findByRole("button", { name: "发表情" });
    await user.click(screen.getByRole("button", { name: "发表情" }));
    const emojiDialog = screen.getByRole("dialog", { name: "发表情" });
    expect(emojiDialog.className).toContain("interaction-sheet");
    expect(emojiDialog.querySelectorAll(".interaction-option--emoji")).toHaveLength(48);
    expect(within(emojiDialog).getByRole("button", { name: "😀" })).toBeTruthy();
    expect(within(emojiDialog).getByRole("button", { name: "🏆" })).toBeTruthy();
    expect(within(emojiDialog).getByRole("button", { name: "🚀" })).toBeTruthy();
    expect(within(emojiDialog).getByRole("button", { name: "🎸" })).toBeTruthy();
    expect(within(emojiDialog).getByRole("button", { name: "🍿" })).toBeTruthy();
    expect(within(emojiDialog).getByRole("button", { name: "🌊" })).toBeTruthy();
    await user.click(within(emojiDialog).getByRole("button", { name: "😀" }));
    expect(screen.getByRole("dialog", { name: "发表情" })).toBeTruthy();
    await user.click(within(screen.getByRole("dialog", { name: "发表情" })).getByRole("button", { name: "🚀" }));
    await flush();

    await user.click(screen.getByRole("button", { name: "彩虹屁" }));
    const rainbowDialog = screen.getByRole("dialog", { name: "彩虹屁" });
    expect(rainbowDialog.className).toContain("interaction-sheet");
    expect(rainbowDialog.querySelector(".interaction-sheet__footer")).toBeTruthy();
    expect(rainbowDialog.querySelectorAll(".interaction-option")).toHaveLength(6);
    await user.clear(within(rainbowDialog).getByLabelText("互动内容"));
    await user.click(within(rainbowDialog).getByRole("button", { name: "随机发送" }));
    await flush();
    expect((within(rainbowDialog).getByLabelText("互动内容") as HTMLTextAreaElement).value).toBe("");
    expect(screen.getByRole("dialog", { name: "彩虹屁" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "神吐槽" }));
    const roastDialog = screen.getByRole("dialog", { name: "神吐槽" });
    expect(roastDialog.querySelectorAll(".interaction-option")).toHaveLength(6);
    await user.clear(within(roastDialog).getByLabelText("互动内容"));
    await user.click(within(roastDialog).getByRole("button", { name: "随机发送" }));
    await flush();
    expect((within(roastDialog).getByLabelText("互动内容") as HTMLTextAreaElement).value).toBe("");
    expect(screen.getByRole("dialog", { name: "神吐槽" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "送祝福" }));
    const blessingDialog = screen.getByRole("dialog", { name: "送祝福" });
    expect(blessingDialog.querySelectorAll(".interaction-option")).toHaveLength(6);
    await user.clear(within(blessingDialog).getByLabelText("互动内容"));
    await user.click(within(blessingDialog).getByRole("button", { name: "随机发送" }));
    await flush();
    expect((within(blessingDialog).getByLabelText("互动内容") as HTMLTextAreaElement).value).toBe("");
    expect(screen.getByRole("dialog", { name: "送祝福" })).toBeTruthy();

    const interactionRequests = requests.filter((request) => request.url === "/rooms/living-room/interactions");
    expect(interactionRequests.map((request) => request.body)).toEqual([
      expect.objectContaining({ deviceId: "mobile-test-uuid", kind: "emoji", message: "😀" }),
      expect.objectContaining({ deviceId: "mobile-test-uuid", kind: "emoji", message: "🚀" }),
      expect.objectContaining({ deviceId: "mobile-test-uuid", kind: "rainbow_praise", message: "这一开嗓，客厅都亮了" }),
      expect.objectContaining({ deviceId: "mobile-test-uuid", kind: "roast", message: "这调跑得很有探索精神" }),
      expect.objectContaining({ deviceId: "mobile-test-uuid", kind: "blessing", message: "祝大家今晚玩得开心" })
    ]);
  });

  it("repeats emoji interactions during a long press and stops after the send window", async () => {
    vi.useFakeTimers();
    const { requests } = installControllerFetchMock({
      restoreResponses: [json(sessionResponse(roomSnapshot()))]
    });
    installWebSocketMock();

    render(<App />);
    await flush();

    fireEvent.click(screen.getByRole("button", { name: "发表情" }));
    const emojiButton = within(screen.getByRole("dialog", { name: "发表情" })).getByRole("button", { name: "🚀" });

    fireEvent.pointerDown(emojiButton, { pointerId: 1 });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(requests.filter((request) => request.url === "/rooms/living-room/interactions")).toHaveLength(0);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(requests.filter((request) => request.url === "/rooms/living-room/interactions")).toHaveLength(5);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000);
    });
    expect(requests.filter((request) => request.url === "/rooms/living-room/interactions")).toHaveLength(25);

    fireEvent.pointerUp(emojiButton, { pointerId: 1 });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(requests.filter((request) => request.url === "/rooms/living-room/interactions")).toHaveLength(25);
  });

  it("opens a search overlay with local history, instant results, and clear history", async () => {
    const user = userEvent.setup();
    localStorage.setItem("home_ktv_search_history_v1", JSON.stringify(["七里香"]));
    installControllerFetchMock({
      restoreResponses: [json(sessionResponse(roomSnapshot()))]
    });
    installWebSocketMock();

    render(<App />);

    await screen.findByRole("button", { name: "打开搜索" });
    await user.click(screen.getByRole("button", { name: "打开搜索" }));

    expect(screen.getByRole("dialog", { name: "搜索歌曲" })).toBeTruthy();
    expect(screen.getByText("最近搜索")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "七里香" }));
    expect(await screen.findByText("现场版", { selector: "strong" })).toBeTruthy();

    const dialog = screen.getByRole("dialog", { name: "搜索歌曲" });
    await user.clear(within(dialog).getByLabelText("搜索关键词"));
    await user.click(screen.getByRole("button", { name: "清空" }));
    expect(localStorage.getItem("home_ktv_search_history_v1")).toBe("[]");
    expect(screen.queryByRole("button", { name: "七里香" })).toBeNull();
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
      sourceType: "nas",
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
      kind: "canonical",
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
      sourceType: "nas",
      assetId: "asset-ready-alt"
    });
  });

  it("requires duplicate confirmation before re-adding a queued NAS asset", async () => {
    const { requests } = installControllerFetchMock({
      restoreResponses: [json(sessionResponse(roomSnapshot()))]
    });
    installWebSocketMock();
    const controller = renderControllerProbe();
    await flush();

    act(() => {
      controller.current?.requestAddNasAsset("ktv-asset-sunny-mkv", "NAS 晴天", "queued");
    });

    expect(controller.current?.duplicateConfirm).toEqual({
      kind: "nas",
      assetId: "ktv-asset-sunny-mkv",
      title: "NAS 晴天"
    });
    expect(requests.some((request) => request.url === "/rooms/living-room/commands/add-queue-entry")).toBe(false);

    await act(async () => {
      await controller.current?.confirmDuplicateAdd();
    });

    expect(controller.current?.duplicateConfirm).toBeNull();
    expect(requests.find((request) => request.url === "/rooms/living-room/commands/add-queue-entry")?.body).toMatchObject({
      sourceType: "nas",
      assetId: "ktv-asset-sunny-mkv"
    });
  });

  it("tries cookie restore before token exchange and removes token after success", async () => {
    window.history.pushState({}, "", "/controller?token=pair-token");
    const { requests } = installControllerFetchMock({
      restoreResponses: [json({ code: "CONTROL_SESSION_REQUIRED" }, 401)],
      createResponses: [json(sessionResponse(roomSnapshot()))]
    });
    installWebSocketMock();

    render(<App />);

    await openControlTab();
    expect(screen.getByText("音量")).toBeTruthy();
    expect(controllerRequests(requests).slice(0, 2)).toEqual([
      "GET /rooms/living-room/control-session?deviceId=mobile-test-uuid",
      "POST /rooms/living-room/control-sessions"
    ]);
    expect(window.location.search).toBe("");
  });

  it("falls back to cookie restore when token exchange returns INVALID_PAIRING_TOKEN", async () => {
    window.history.pushState({}, "", "/controller?token=expired-token");
    const { requests } = installControllerFetchMock({
      restoreResponses: [json({ code: "CONTROL_SESSION_REQUIRED" }, 401), json(sessionResponse(roomSnapshot()))],
      createResponses: [json({ code: "INVALID_PAIRING_TOKEN" }, 401)]
    });
    installWebSocketMock();

    render(<App />);

    await openControlTab();
    expect(screen.getByText("音量")).toBeTruthy();
    expect(controllerRequests(requests).slice(0, 3)).toEqual([
      "GET /rooms/living-room/control-session?deviceId=mobile-test-uuid",
      "POST /rooms/living-room/control-sessions",
      "GET /rooms/living-room/control-session?deviceId=mobile-test-uuid"
    ]);
    expect(window.location.search).toBe("");
  });

  it("auto-pairs from the public room snapshot when opened without a token", async () => {
    const { requests } = installControllerFetchMock({
      restoreResponses: [json({ code: "CONTROL_SESSION_REQUIRED" }, 401)]
    });
    installWebSocketMock();

    render(<App />);

    await waitFor(() => {
      const created = requests.find(
        (request) => request.method === "POST" && request.url === "/rooms/living-room/control-sessions"
      );
      expect(created?.body).toMatchObject({ pairingToken: "public-pairing-token" });
    });
    expect(screen.queryByText("请从电视端二维码重新进入控制端")).toBeNull();
  });

  it("shows pairing guidance instead of raw CONTROL_SESSION_REQUIRED when no token can be resolved", async () => {
    installControllerFetchMock({
      restoreResponses: [json({ code: "CONTROL_SESSION_REQUIRED" }, 401)],
      publicSnapshotResponse: () => json({ code: "ROOM_NOT_FOUND" }, 404)
    });
    installWebSocketMock();

    render(<App />);

    expect(await screen.findByText("请从电视端二维码重新进入控制端")).toBeTruthy();
    expect(screen.queryByText("CONTROL_SESSION_REQUIRED")).toBeNull();
  });

  it("shows reconnect state and polls every 5000ms after WebSocket disconnect", async () => {
    vi.useFakeTimers();
    const { requests } = installControllerFetchMock({
      restoreResponses: [json(sessionResponse(roomSnapshot())), json(sessionResponse(roomSnapshot({ sessionVersion: 2 })))]
    });
    const sockets = installWebSocketMock();

    render(<App />);
    await flush();
    await openControlTab();
    expect(screen.getByText("音量")).toBeTruthy();
    sockets[0]?.emitOpen();
    sockets[0]?.emitClose();

    await flush();
    expect(screen.getByText("连接中断，正在重连")).toBeTruthy();
    await vi.advanceTimersByTimeAsync(fallbackPollingIntervalMs);
    expect(requests.filter((request) => request.url.includes("/control-session")).length).toBeGreaterThanOrEqual(2);
  });

  it("opens a new realtime connection and clears reconnect state after fallback polling succeeds", async () => {
    vi.useFakeTimers();
    const { requests } = installControllerFetchMock({
      restoreResponses: [json(sessionResponse(roomSnapshot())), json(sessionResponse(roomSnapshot({ sessionVersion: 2 })))]
    });
    const sockets = installWebSocketMock();

    render(<App />);
    await flush();
    await openControlTab();
    sockets[0]?.emitOpen();
    sockets[0]?.emitClose();

    await flush();
    expect(screen.getByText("连接中断，正在重连")).toBeTruthy();
    await vi.advanceTimersByTimeAsync(fallbackPollingIntervalMs);
    await flush();
    expect(sockets).toHaveLength(2);
    sockets[1]?.emitOpen();
    await flush();

    expect(screen.queryByText("连接中断，正在重连")).toBeNull();
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
    await openControlTab();
    expect(screen.getByText("音量")).toBeTruthy();
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
    await openControlTab();
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

    await openControlTab();
    await screen.findByText("下一首");
    expect(screen.getByRole("button", { name: "删除" }).className).toContain("danger-button");

    await user.click(screen.getByRole("button", { name: "切歌" }));
    expect(screen.getByRole("button", { name: "确认" }).className).toContain("danger-button");
  });

  it("shuffles the playback queue from the queue panel", async () => {
    const user = userEvent.setup();
    const { requests } = installControllerFetchMock({
      restoreResponses: [json(sessionResponse(roomSnapshot({ queueLength: 3 })))],
      commandResponses: {
        "/rooms/living-room/commands/shuffle-queue": json({
          status: "accepted",
          snapshot: roomSnapshot({ queueLength: 3, sessionVersion: 2 })
        })
      }
    });
    installWebSocketMock();

    render(<App />);

    await openControlTab();
    const queue = await screen.findByRole("region", { name: "播放队列" });
    await user.click(within(queue).getByRole("button", { name: "打乱" }));
    await flush();

    expect(requests.some((request) => request.url === "/rooms/living-room/commands/shuffle-queue")).toBe(true);
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
    await openControlTab();
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
    await openControlTab();
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
        sourceType: "nas",
        songId: "song-original",
        assetId: "asset-original",
        playbackUrl: "http://ktv.local/media/asset-original",
        switchFamily: currentTarget.switchFamily,
        vocalMode: "original"
      },
      switchTarget: {
        sourceType: "nas",
        playbackUrl: "http://ktv.local/media/asset-instrumental",
        queueEntryId: switchTarget.queueEntryId,
        resumePositionMs: switchTarget.resumePositionMs,
        rollbackAssetId: "asset-original",
        roomId: switchTarget.roomId,
        sessionVersion: switchTarget.sessionVersion,
        switchKind: "asset",
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

    await openControlTab();
    expect(screen.getByText("音量")).toBeTruthy();
    expect(screen.getByRole("button", { name: "切到伴唱" })).toBeTruthy();
    expect(screen.queryByLabelText("current-vocal-mode")).toBeNull();

    await user.click(screen.getByRole("button", { name: "切到伴唱" }));
    await flush();

    expect(requests.some((request) => request.url === "/rooms/living-room/commands/switch-vocal-mode")).toBe(true);
    expect(requests.find((request) => request.url === "/rooms/living-room/commands/switch-vocal-mode")?.body).toMatchObject({
      playbackPositionMs: 1234
    });
  });

  it("omits the dedicated current mode row from the playback panel", async () => {
    const { requests } = installControllerFetchMock({
      restoreResponses: [json(sessionResponse(roomSnapshot()))]
    });
    installWebSocketMock();

    render(<App />);

    await openControlTab();
    expect(requests.some((request) => request.url.includes("/control-session"))).toBe(true);
    expect(screen.queryByLabelText("current-vocal-mode")).toBeNull();
    expect(screen.queryByText("当前模式")).toBeNull();
    expect(screen.getAllByText("伴唱").length).toBeGreaterThan(0);
  });

  it("renders one room volume slider and sends set-volume after adjustment", async () => {
    vi.useFakeTimers();
    const { requests } = installControllerFetchMock({
      restoreResponses: [json(sessionResponse(roomSnapshot({ volumePercent: 70 })))],
      commandResponses: {
        "/rooms/living-room/commands/set-volume": json({
          status: "accepted",
          snapshot: roomSnapshot({ sessionVersion: 2, volumePercent: 65 })
        })
      }
    });
    installWebSocketMock();

    render(<App />);

    await flush();
    await openControlTab();
    expect(screen.getByText("音量")).toBeTruthy();
    expect(screen.getByText("音量")).toBeTruthy();
    expect(screen.getByText("70%")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "音量 -5%" }));
    expect(screen.getByText("65%")).toBeTruthy();
    await vi.advanceTimersByTimeAsync(220);
    await flush();

    expect(requests.find((request) => request.url === "/rooms/living-room/commands/set-volume")?.body).toMatchObject({
      volumePercent: 65
    });
  });

  it("falls back to 50 when the restored snapshot omits volume", async () => {
    const snapshotWithoutVolume = roomSnapshot();
    delete (snapshotWithoutVolume as { volumePercent?: number }).volumePercent;
    installControllerFetchMock({
      restoreResponses: [json(sessionResponse(snapshotWithoutVolume))]
    });
    installWebSocketMock();

    render(<App />);

    await openControlTab();
    expect(screen.getByText("音量")).toBeTruthy();
    expect(screen.getByText("50%")).toBeTruthy();
  });

  it("does not expose raw playback or vocal enum labels in the Chinese controller", async () => {
    installControllerFetchMock({
      restoreResponses: [json(sessionResponse(roomSnapshot()))]
    });
    installWebSocketMock();

    render(<App />);

    await openControlTab();
    expect(screen.getByText("音量")).toBeTruthy();
    expect(screen.getAllByText("伴唱").length).toBeGreaterThan(0);
    expect(screen.queryByText("当前模式")).toBeNull();

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
    expect(screen.getByRole("button", { name: "打开搜索" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "打开搜索" }));
    const dialog = screen.getByRole("dialog", { name: "搜索歌曲" });
    const searchInput = within(dialog).getByLabelText("搜索关键词");
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

  it("renders NAS search results as one-layer compact file rows with selected asset add buttons", async () => {
    const user = userEvent.setup();
    const { requests } = installControllerFetchMock({
      restoreResponses: [json(sessionResponse(roomSnapshot()))]
    });
    installWebSocketMock();

    render(<App />);

    const dialog = await typeSearchQuery(user, "晴天");
    const search = within(dialog);
    const fileRows = await search.findAllByRole("article", { name: /高清版/u });
    expect(fileRows[0]?.classList.contains("compact-version-row")).toBe(true);
    expect(fileRows[0]?.closest(".compact-result-list")).toBeTruthy();
    expect(fileRows[0]?.closest(".compact-song-row")).toBeNull();
    expect(search.getByText("NAS 曲库")).toBeTruthy();
    expect(search.queryByText("周杰伦")).toBeNull();
    expect(search.queryByText("1 个版本")).toBeNull();
    expect(search.queryByText("2 个版本")).toBeNull();
    expect(search.getByText("现场版")).toBeTruthy();

    await user.click(search.getByRole("button", { name: "点歌" }));
    await flush();

    expect(requests.find((request) => request.url === "/rooms/living-room/commands/add-queue-entry")?.body).toMatchObject({
      sourceType: "nas",
      assetId: "asset-sunny-main"
    });
    expect(requests.find((request) => request.url === "/rooms/living-room/commands/add-queue-entry")?.body).not.toHaveProperty(
      "vocalMode"
    );
  });

  it("keeps disabled real MV search results visible without queueing them", async () => {
    const user = userEvent.setup();
    const { requests } = installControllerFetchMock({
      restoreResponses: [json(sessionResponse(roomSnapshot()))],
      songSearchResponse: (query) => ({
        query,
        nas: {
          status: "available",
          message: "找到 NAS 曲库结果",
          results: [
            {
              songId: "song-real-mv-needs-preprocess",
              title: "真实 MV 样本",
              artistName: "样本歌手",
              category: "流行",
              sourceLabel: "NAS曲库",
              matchReason: "title",
              versions: [
                {
                  assetId: "asset-real-mv-needs-preprocess",
                  displayName: "MKV 双声轨",
                  sourceLabel: "NAS曲库",
                  extension: ".mkv",
                  sizeBytes: 60000,
                  audioTrackCount: 2,
                  category: "流行",
                  queueState: "source_missing",
                  canQueue: false,
                  disabledLabel: "需预处理"
                }
              ]
            }
          ]
        },
        online: { status: "disabled", message: "本地未入库，补歌功能后续可用", candidates: [] }
      })
    });
    installWebSocketMock();

    render(<App />);

    const dialog = await typeSearchQuery(user, "真实 MV 样本");
    const search = within(dialog);
    await search.findByText("MKV 双声轨", { selector: "strong" });
    expect(search.getAllByText("需预处理").length).toBeGreaterThanOrEqual(1);
    const disabledButton = search.getByRole("button", { name: "需预处理" }) as HTMLButtonElement;
    expect(disabledButton.disabled).toBe(true);
    await user.click(disabledButton);

    expect(requests.some((request) => request.url === "/rooms/living-room/commands/add-queue-entry")).toBe(false);
  });

  it("queues ige8 discovery songs from the artist browse view", async () => {
    const user = userEvent.setup();
    const { requests } = installControllerFetchMock({
      restoreResponses: [json(sessionResponse(roomSnapshot()))],
      songDiscoveryResponse: (seed) => ({
        seed,
        recommended: [],
        artists: [{ artistId: "1066", artistName: "周杰伦", songCount: 0, songs: [] }],
        genres: [{ genre: "流行", songCount: 0, songs: [] }]
      }),
      discoveryArtistSongsResponse: () => ({
        songs: [
          {
            source: "online",
            songId: "online:igeba:20039643",
            providerSongNumber: "20039643",
            title: "晴天",
            artistName: "周杰伦",
            language: "mandarin",
            matchReason: "default",
            queueState: "not_queued",
            artistId: "1066",
            genre: [],
            playCount: 0,
            recommendationWeight: 0,
            versions: []
          }
        ],
        nextOffset: null
      })
    });
    installWebSocketMock();

    render(<App />);

    await user.click(await screen.findByRole("button", { name: /歌手点歌/u }));
    await user.click(await screen.findByRole("button", { name: /周杰伦/u }));
    const addButton = await screen.findByRole("button", { name: "点歌 晴天" });
    await user.click(addButton);

    await waitFor(() =>
      expect(
        requests.some(
          (request) =>
            request.url === "/rooms/living-room/online/queue" &&
            request.method === "POST" &&
            (request.body as { songNumber?: string } | undefined)?.songNumber === "20039643"
        )
      ).toBe(true)
    );
  });

  it("queues online catalog candidates through the online queue endpoint", async () => {
    const user = userEvent.setup();
    const { requests } = installControllerFetchMock({
      restoreResponses: [json(sessionResponse(roomSnapshot()))],
      songSearchResponse: (query) => ({
        query,
        nas: { status: "unavailable", message: "未找到 NAS 曲库结果", results: [] },
        online: {
          status: "available",
          message: "找到 1 首在线曲库结果",
          requestSupplement: { visible: false, label: "请求补歌" },
          candidates: [
            {
              provider: "igeba",
              providerCandidateId: "20039643",
              title: "孤勇者",
              artistName: "陈奕迅",
              sourceLabel: "在线曲库",
              durationMs: 269000,
              candidateType: "mv",
              reliabilityLabel: "medium",
              riskLabel: "normal",
              taskState: "discovered",
              taskId: null
            }
          ]
        }
      })
    });
    installWebSocketMock();

    render(<App />);

    const dialog = await typeSearchQuery(user, "孤勇者");
    const search = within(dialog);
    await search.findByText("孤勇者", { selector: "strong" });
    await user.click(search.getByRole("button", { name: "点歌" }));

    await waitFor(() =>
      expect(
        requests.some(
          (request) =>
            request.url === "/rooms/living-room/online/queue" &&
            request.method === "POST" &&
            (request.body as { songNumber?: string } | undefined)?.songNumber === "20039643"
        )
      ).toBe(true)
    );
    await search.findByRole("button", { name: "已点" });
  });

  it("queues NAS search versions with source asset identity and inline pending state", async () => {
    const user = userEvent.setup();
    const indexedCommand = deferred<Response>();
    const nasPathPrefix = ["/m", "nt", "/n", "as"].join("");
    const rawCamelPathKey = ["file", "Path"].join("");
    const rawSnakePathKey = ["file", "_", "path"].join("");
    const { requests } = installControllerFetchMock({
      restoreResponses: [json(sessionResponse(roomSnapshot()))],
      commandResponses: {
        "/rooms/living-room/commands/add-queue-entry": indexedCommand.promise
      },
      songSearchResponse: (query) => ({
        query,
        nas: {
          status: "available",
          message: "找到 NAS 曲库结果",
          results: [
            {
              songId: "ktv-song-sunny",
              title: "NAS 晴天",
              artistName: "周杰伦",
              category: "流行",
              sourceLabel: "NAS曲库",
              matchReason: "title",
              versions: [
                {
                  assetId: "ktv-asset-sunny-mkv",
                  displayName: "NAS 晴天.mkv",
                  sourceLabel: "NAS曲库",
                  extension: ".mkv",
                  sizeBytes: 734003200,
                  audioTrackCount: 1,
                  category: "流行",
                  queueState: "not_queued",
                  canQueue: true,
                  disabledLabel: null,
                  [rawCamelPathKey]: `${nasPathPrefix}/KTV歌曲/NAS 晴天.mkv`
                },
                {
                  assetId: "ktv-asset-sunny-mpg",
                  displayName: "NAS 晴天.mpg",
                  sourceLabel: "NAS曲库",
                  extension: ".mpg",
                  sizeBytes: null,
                  category: "流行",
                  queueState: "queued",
                  canQueue: true,
                  disabledLabel: null,
                  [rawSnakePathKey]: `${nasPathPrefix}/KTV歌曲/NAS 晴天.mpg`
                }
              ]
            }
          ]
        },
        online: { status: "disabled", message: "本地未入库，补歌功能后续可用", candidates: [] }
      })
    });
    installWebSocketMock();

    render(<App />);

    const dialog = await typeSearchQuery(user, "NAS 晴天");
    const search = within(dialog);
    expect(await search.findByText("NAS 曲库")).toBeTruthy();
    expect(search.queryByText("NAS 晴天")).toBeNull();
    expect(search.getByText("NAS 晴天.mkv").closest(".compact-version-row")).toBeTruthy();
    expect(search.queryByText("2 个版本")).toBeNull();
    expect(search.getByText("单音轨歌曲源")).toBeTruthy();
    expect(search.getByText("未知大小")).toBeTruthy();
    const addButton = search.getByRole("button", { name: "点歌" }) as HTMLButtonElement;
    expect(addButton.disabled).toBe(false);
    expect(search.getByRole("button", { name: "已点" })).toBeTruthy();
    const historyRequestsBeforeAdd = requests.filter((request) => request.url === "/controller/me/song-history").length;

    await user.click(addButton);

    const pendingButton = await search.findByRole("button", { name: "正在加入..." });
    expect((pendingButton as HTMLButtonElement).disabled).toBe(true);
    const body = requests.find((request) => request.url === "/rooms/living-room/commands/add-queue-entry")
      ?.body as Record<string, unknown>;
    expect(body).toMatchObject({ sourceType: "nas", assetId: "ktv-asset-sunny-mkv" });
    expect(body).not.toHaveProperty("indexedAssetId");
    expect(body).not.toHaveProperty("songId");
    expect(JSON.stringify(body)).not.toContain(nasPathPrefix);
    expect(JSON.stringify(body)).not.toContain(rawCamelPathKey);
    expect(JSON.stringify(body)).not.toContain(rawSnakePathKey);
    const searchPanelText = dialog.textContent ?? "";
    expect(searchPanelText).not.toContain(nasPathPrefix);
    expect(searchPanelText).not.toContain(rawCamelPathKey);
    expect(searchPanelText).not.toContain(rawSnakePathKey);

    indexedCommand.resolve(
      json({
        status: "accepted",
        commandId: "mobile-command-test",
        sessionVersion: 2,
        snapshot: roomSnapshot({ sessionVersion: 2 })
      })
    );
    await flush();
    await waitFor(() => {
      expect(requests.filter((request) => request.url === "/controller/me/song-history").length).toBeGreaterThan(
        historyRequestsBeforeAdd
      );
    });
  });

  it("opens duplicate confirmation from a queued NAS search version before sending source asset identity", async () => {
    const user = userEvent.setup();
    const { requests } = installControllerFetchMock({
      restoreResponses: [json(sessionResponse(roomSnapshot()))],
      songSearchResponse: (query) => ({
        query,
        nas: {
          status: "available",
          message: "找到 NAS 曲库结果",
          results: [
            {
              songId: "ktv-song-sunny",
              title: "NAS 晴天",
              artistName: "周杰伦",
              category: "流行",
              sourceLabel: "NAS曲库",
              matchReason: "title",
              versions: [
                {
                  assetId: "ktv-asset-sunny-mpg",
                  displayName: "NAS 晴天.mpg",
                  sourceLabel: "NAS曲库",
                  extension: ".mpg",
                  sizeBytes: 734003200,
                  category: "流行",
                  queueState: "queued",
                  canQueue: true,
                  disabledLabel: null
                }
              ]
            }
          ]
        },
        online: { status: "disabled", message: "本地未入库，补歌功能后续可用", candidates: [] }
      })
    });
    installWebSocketMock();

    render(<App />);

    const dialog = await typeSearchQuery(user, "NAS 晴天");
    const search = within(dialog);
    await search.findByText("NAS 晴天.mpg");
    await user.click(search.getByRole("button", { name: "已点" }));

    expect(screen.getByRole("dialog", { name: "重复点歌" })).toBeTruthy();
    expect(requests.some((request) => request.url === "/rooms/living-room/commands/add-queue-entry")).toBe(false);

    await user.click(screen.getByRole("button", { name: "确认加点" }));
    await flush();

    expect(requests.find((request) => request.url === "/rooms/living-room/commands/add-queue-entry")?.body).toMatchObject({
      sourceType: "nas",
      assetId: "ktv-asset-sunny-mpg"
    });
  });

  it("keeps disabled NAS states visible with explicit labels", async () => {
    installControllerFetchMock({
      restoreResponses: [json(sessionResponse(roomSnapshot()))],
      songSearchResponse: (query) => ({
        query,
        nas: {
          status: "available",
          message: "找到 NAS 曲库结果",
          results: [
            {
              songId: "ktv-song-disabled",
              title: "NAS 失效歌曲",
              artistName: "样本歌手",
              category: "流行",
              sourceLabel: "NAS曲库",
              matchReason: "title",
              versions: [
                {
                  assetId: "ktv-asset-stale",
                  displayName: "NAS 失效.mkv",
                  sourceLabel: "NAS曲库",
                  extension: ".mkv",
                  sizeBytes: 1024,
                  category: "流行",
                  queueState: "source_missing",
                  canQueue: false,
                  disabledLabel: "索引已失效"
                },
                {
                  assetId: "ktv-asset-unreadable",
                  displayName: "不可读.mpg",
                  sourceLabel: "NAS曲库",
                  extension: ".mpg",
                  sizeBytes: 2048,
                  category: "流行",
                  queueState: "file_unreadable",
                  canQueue: false,
                  disabledLabel: "文件不可读"
                }
              ]
            }
          ]
        },
        online: { status: "disabled", message: "本地未入库，补歌功能后续可用", candidates: [] }
      })
    });
    installWebSocketMock();

    render(<App />);

    await typeSearchQuery(userEvent.setup(), "索引失效");
    expect(await screen.findByRole("button", { name: "索引已失效" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "文件不可读" })).toBeTruthy();
    expect((screen.getByRole("button", { name: "索引已失效" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "文件不可读" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("falls back to a short disabled real MV search label", async () => {
    installControllerFetchMock({
      restoreResponses: [json(sessionResponse(roomSnapshot()))],
      songSearchResponse: (query) => ({
        query,
        nas: {
          status: "available",
          message: "找到 NAS 曲库结果",
          results: [
            {
              songId: "song-real-mv-disabled",
              title: "暂不可播 MV",
              artistName: "样本歌手",
              category: "流行",
              sourceLabel: "NAS曲库",
              matchReason: "title",
              versions: [
                {
                  assetId: "asset-real-mv-disabled",
                  displayName: "MPG 双声轨",
                  sourceLabel: "NAS曲库",
                  extension: ".mpg",
                  sizeBytes: 60000,
                  audioTrackCount: 2,
                  category: "流行",
                  queueState: "file_unreadable",
                  canQueue: false,
                  disabledLabel: null
                }
              ]
            }
          ]
        },
        online: { status: "disabled", message: "本地未入库，补歌功能后续可用", candidates: [] }
      })
    });
    installWebSocketMock();

    render(<App />);

    const dialog = await typeSearchQuery(userEvent.setup(), "暂不可播 MV");
    const search = within(dialog);
    await search.findByText("MPG 双声轨", { selector: "strong" });
    expect(search.getByRole("button", { name: "文件不可读" })).toBeTruthy();
  });

  it("confirms queued multi-version duplicate add before sending the selected assetId", async () => {
    const user = userEvent.setup();
    const { requests } = installControllerFetchMock({
      restoreResponses: [json(sessionResponse(roomSnapshot()))]
    });
    installWebSocketMock();

    render(<App />);
    await typeSearchQuery(user, "七里香");
    const versionButtons = screen.getAllByRole("button", { name: "已点" });

    await user.click(versionButtons[1]!);

    expect(screen.getByRole("dialog", { name: "重复点歌" })).toBeTruthy();
    expect(requests.some((request) => request.url === "/rooms/living-room/commands/add-queue-entry")).toBe(false);
    await user.click(screen.getByRole("button", { name: "确认加点" }));
    await flush();

    expect(requests.find((request) => request.url === "/rooms/living-room/commands/add-queue-entry")?.body).toMatchObject({
      sourceType: "nas",
      assetId: "asset-qlx-live"
    });
  });

  it("keeps real MV vocal switching available when the source asset has no switch family", async () => {
    const user = userEvent.setup();
    const realMvSnapshot = realMvControlSnapshot();
    const { requests } = installControllerFetchMock({
      restoreResponses: [json(sessionResponse(realMvSnapshot))],
      commandResponses: {
        "/rooms/living-room/commands/switch-vocal-mode": json({
          status: "accepted",
          snapshot: {
            ...realMvSnapshot,
            sessionVersion: 2
          }
        })
      }
    });
    installWebSocketMock();

    render(<App />);

    await openControlTab();
    const switchButton = screen.getByRole("button", { name: "切到原唱" }) as HTMLButtonElement;
    expect(switchButton.disabled).toBe(false);
    await user.click(switchButton);
    await flush();

    expect(requests.some((request) => request.url === "/rooms/living-room/commands/switch-vocal-mode")).toBe(true);
  });

  it("shows a Chinese switch unavailable error without permanently disabling the switch", async () => {
    const user = userEvent.setup();
    const realMvSnapshot = realMvControlSnapshot();
    installControllerFetchMock({
      restoreResponses: [json(sessionResponse(realMvSnapshot))],
      commandResponses: {
        "/rooms/living-room/commands/switch-vocal-mode": json({ code: "SWITCH_TARGET_NOT_AVAILABLE" }, 409)
      }
    });
    installWebSocketMock();

    render(<App />);

    await openControlTab();
    const switchButton = (await screen.findByRole("button", { name: "切到原唱" })) as HTMLButtonElement;
    await user.click(switchButton);

    expect(await screen.findByText("当前歌曲暂不支持切换原唱/伴唱")).toBeTruthy();
    expect(switchButton.disabled).toBe(false);
  });

  it("renders switch failure notices from the room snapshot", async () => {
    installControllerFetchMock({
      restoreResponses: [
        json(
          sessionResponse({
            ...roomSnapshot(),
            notice: {
              kind: "switch_failed_reverted",
              message: "原唱/伴唱切换失败，已保持当前播放。"
            }
          })
        )
      ]
    });
    installWebSocketMock();

    render(<App />);

    expect(await screen.findByText("原唱/伴唱切换失败，已保持当前播放。")).toBeTruthy();
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

async function openControlTab() {
  await waitForControllerHome();
  fireEvent.click(screen.getByRole("button", { name: /歌单|Playlist/u }));
  await flush();
  return screen.getByRole("region", { name: /播放队列|Queue/u });
}

async function openSearchOverlay(user: ReturnType<typeof userEvent.setup>) {
  await waitForControllerHome();
  await user.click(screen.getByRole("button", { name: "打开搜索" }));
  return screen.getByRole("dialog", { name: "搜索歌曲" });
}

async function waitForControllerHome() {
  if (screen.queryByRole("button", { name: "打开搜索" })) {
    return;
  }
  await screen.findByRole("button", { name: "打开搜索" });
}

function controllerRequests(requests: RequestRecord[]) {
  return requests
    .filter((request) => !request.url.startsWith("/controller/auth/"))
    .filter((request) => !request.url.startsWith("/controller/me/"))
    .map((request) => `${request.method} ${request.url}`);
}

async function typeSearchQuery(user: ReturnType<typeof userEvent.setup>, query: string) {
  const dialog = await openSearchOverlay(user);
  const input = within(dialog).getByLabelText("搜索关键词");
  await user.clear(input);
  await user.type(input, query);
  return dialog;
}

function installControllerFetchMock(options: {
  authMeResponse?: Response;
  loginResponse?: Response;
  registerResponse?: Response;
  logoutResponse?: Response;
  profileResponse?: Response;
  restoreResponses?: Response[];
  createResponses?: Response[];
  commandResponses?: Record<string, MockResponse | MockResponse[]>;
  controllerHistoryResponse?: unknown;
  songSearchResponse?: (query: string) => unknown;
  onlineQueueResponse?: unknown;
  onlineAssetResponse?: (assetId: string) => unknown;
  publicSnapshotResponse?: () => unknown;
  songDiscoveryResponse?: (seed: string) => unknown;
  discoveryArtistSongsResponse?: (artistId: string, offset: number, limit: number) => unknown;
  discoveryGenreSongsResponse?: (genre: string, offset: number, limit: number) => unknown;
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

      if (method === "GET" && requestUrl.pathname === "/controller/auth/me") {
        return options.authMeResponse ?? json({ user: controllerUser() });
      }

      if (method === "POST" && requestUrl.pathname === "/controller/auth/login") {
        return options.loginResponse ?? json({ user: controllerUser() });
      }

      if (method === "POST" && requestUrl.pathname === "/controller/auth/register") {
        return options.registerResponse ?? json({ user: controllerUser() });
      }

      if (method === "POST" && requestUrl.pathname === "/controller/auth/logout") {
        return options.logoutResponse ?? new Response(null, { status: 204 });
      }

      if (method === "PATCH" && requestUrl.pathname === "/controller/auth/profile") {
        return options.profileResponse ?? json({ user: controllerUser({ displayName: body?.displayName ?? "阿飞" }) });
      }

      if (method === "GET" && requestUrl.pathname === "/controller/me/song-history") {
        return json(options.controllerHistoryResponse ?? { songs: [] });
      }

      if (method === "POST" && requestUrl.pathname === "/rooms/living-room/online/queue") {
        return json(
          options.onlineQueueResponse ?? {
            assetId: "online-asset-1",
            songNumber: body?.songNumber ?? "",
            status: "ready",
            cached: true,
            queued: true,
            queueEntryId: "queue-entry-online"
          }
        );
      }

      if (method === "GET" && requestUrl.pathname.startsWith("/rooms/living-room/online/assets/")) {
        const assetId = requestUrl.pathname.split("/").pop() ?? "";
        return json(
          options.onlineAssetResponse?.(assetId) ?? {
            asset: { id: assetId, provider: "igeba", providerAssetId: "20039643", status: "ready", catalogSongId: null, durationMs: null, cacheBytes: null, audioTrackCount: null, errorReason: null },
            playbackUrl: null
          }
        );
      }

      if (method === "GET" && requestUrl.pathname === "/rooms/living-room/snapshot") {
        return options.publicSnapshotResponse
          ? options.publicSnapshotResponse()
          : json({
              pairing: {
                roomSlug: "living-room",
                token: "public-pairing-token",
                tokenExpiresAt: "2026-05-28T10:05:00.000Z",
                controllerUrl: "/controller?token=public-pairing-token",
                qrPayload: "/controller?token=public-pairing-token"
              }
            });
      }

      if (method === "GET" && requestUrl.pathname.endsWith("/control-session")) {
        return restoreResponses.shift() ?? json(sessionResponse(roomSnapshot()));
      }

      if (method === "POST" && requestUrl.pathname.endsWith("/control-sessions")) {
        return createResponses.shift() ?? json(sessionResponse(roomSnapshot()));
      }

      if (method === "GET" && requestUrl.pathname.endsWith("/songs/search")) {
        const query = requestUrl.searchParams.get("q") ?? "";
        return json((options.songSearchResponse ?? songSearchResponse)(query));
      }

      if (method === "GET" && requestUrl.pathname.endsWith("/songs/discovery")) {
        const seed = requestUrl.searchParams.get("seed") ?? "";
        return json((options.songDiscoveryResponse ?? songDiscoveryResponse)(seed));
      }

      const artistSongsMatch = requestUrl.pathname.match(/\/songs\/discovery\/artists\/([^/]+)\/songs$/u);
      if (method === "GET" && artistSongsMatch) {
        const artistId = decodeURIComponent(artistSongsMatch[1] ?? "");
        const offset = Number.parseInt(requestUrl.searchParams.get("offset") ?? "0", 10);
        const limit = Number.parseInt(requestUrl.searchParams.get("limit") ?? "60", 10);
        return json((options.discoveryArtistSongsResponse ?? discoveryArtistSongsResponse)(artistId, offset, limit));
      }

      if (method === "GET" && requestUrl.pathname.endsWith("/songs/discovery/genres/songs")) {
        const genre = requestUrl.searchParams.get("genre") ?? "";
        const offset = Number.parseInt(requestUrl.searchParams.get("offset") ?? "0", 10);
        const limit = Number.parseInt(requestUrl.searchParams.get("limit") ?? "60", 10);
        return json((options.discoveryGenreSongsResponse ?? discoveryGenreSongsResponse)(genre, offset, limit));
      }

      if (method === "POST" && requestUrl.pathname.endsWith("/interactions")) {
        return json({
          status: "accepted",
          interaction: {
            id: "interaction-test",
            roomId: "living-room",
            roomSlug: "living-room",
            kind: body?.kind,
            message: body?.message,
            senderDeviceId: body?.deviceId,
            senderName: "Phone",
            createdAt: "2026-05-27T10:00:00.000Z",
            expiresAt: "2026-05-27T10:00:07.000Z"
          }
        });
      }

      const commandResponse = commandResponses[requestUrl.pathname];
      if (method === "POST" && commandResponse) {
        return Array.isArray(commandResponse) ? commandResponse.shift() ?? json({ code: "NOT_FOUND" }, 404) : commandResponse;
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
      userPhone: "13800138000",
      expiresAt: "2026-05-04T12:00:00.000Z",
      lastSeenAt: "2026-05-04T10:00:00.000Z"
    },
    snapshot
  };
}

function songSearchResponse(query: string) {
  return {
    query,
    nas: {
      status: "available",
      message: "找到 NAS 曲库结果",
      results: [
        {
          songId: "song-sunny",
          title: "晴天",
          artistName: "周杰伦",
          category: "流行",
          sourceLabel: "NAS曲库",
          matchReason: query ? "initials" : "default",
          versions: [
            {
              assetId: "asset-sunny-main",
              displayName: "高清版",
              sourceLabel: "NAS曲库",
              extension: ".mp4",
              sizeBytes: 734003200,
              audioTrackCount: 2,
              category: "流行",
              queueState: "not_queued",
              canQueue: true,
              disabledLabel: null
            }
          ]
        },
        {
          songId: "song-qlx",
          title: "七里香",
          artistName: "周杰伦",
          category: "流行",
          sourceLabel: "NAS曲库",
          matchReason: query ? "initials" : "default",
          versions: [
            {
              assetId: "asset-qlx-hd",
              displayName: "高清版",
              sourceLabel: "NAS曲库",
              extension: ".mp4",
              sizeBytes: 734003200,
              audioTrackCount: 2,
              category: "流行",
              queueState: "queued",
              canQueue: true,
              disabledLabel: null
            },
            {
              assetId: "asset-qlx-live",
              displayName: "现场版",
              sourceLabel: "NAS曲库",
              extension: ".mp4",
              sizeBytes: 838860800,
              audioTrackCount: 2,
              category: "流行",
              queueState: "queued",
              canQueue: true,
              disabledLabel: null
            }
          ]
        }
      ]
    },
    online: { status: "disabled", message: "本地未入库，补歌功能后续可用", candidates: [] }
  };
}

function songDiscoveryResponse(seed: string): SongDiscoveryResponse {
  const recommended = Array.from({ length: 30 }, (_, index) => {
    const song = {
      songId: `song-recommend-${index + 1}`,
      title: `推荐歌曲${index + 1}`,
      artistId: index % 2 === 0 ? "artist-jay" : "artist-mayday",
      artistName: index % 2 === 0 ? "周杰伦" : "五月天",
      genre: index % 2 === 0 ? ["流行"] : ["摇滚"],
      playCount: 30 - index
    };
    return discoverySong(
      index === 0
        ? {
            ...song,
            coverImageUrl: "https://cover.example/recommend-1.jpg",
            coverThumbnailUrl: "https://cover.example/thumbs/recommend-1.jpg"
          }
        : song
    );
  });

  return {
    seed,
    recommended,
    artists: [
      {
        artistId: "artist-jay",
        artistName: "周杰伦",
        songCount: 2,
        songs: []
      },
      {
        artistId: "artist-mayday",
        artistName: "五月天",
        songCount: 2,
        songs: []
      }
    ],
    genres: [
      {
        genre: "流行",
        songCount: 2,
        songs: []
      },
      {
        genre: "摇滚",
        songCount: 2,
        songs: []
      }
    ]
  };
}

function discoveryArtistSongsResponse(artistId: string) {
  const artistName = artistId === "artist-mayday" ? "五月天" : "周杰伦";
  return {
    songs: [
      discoverySong({
        songId: `${artistId}-detail-song-1`,
        title: `${artistName}详情歌1`,
        artistId,
        artistName,
        genre: ["流行"],
        playCount: 10
      }),
      discoverySong({
        songId: `${artistId}-detail-song-2`,
        title: `${artistName}详情歌2`,
        artistId,
        artistName,
        genre: ["流行"],
        playCount: 9
      })
    ],
    nextOffset: null
  };
}

function discoveryGenreSongsResponse(genre: string) {
  return {
    songs: [
      discoverySong({
        songId: `genre-${genre}-detail-song-1`,
        title: `${genre}详情歌1`,
        artistId: "artist-jay",
        artistName: "周杰伦",
        genre: [genre],
        playCount: 10
      }),
      discoverySong({
        songId: `genre-${genre}-detail-song-2`,
        title: `${genre}详情歌2`,
        artistId: "artist-mayday",
        artistName: "五月天",
        genre: [genre],
        playCount: 9
      })
    ],
    nextOffset: null
  };
}

function nasSongDiscoveryResponse(seed: string): SongDiscoveryResponse {
  const song: SongDiscoverySong = {
    source: "nas",
    songId: "ktv-song-discovery-sunny",
    title: "NAS 晴天",
    artistId: "ktv-index-artist-zhou-jie-lun",
    artistName: "周杰伦",
    language: "mandarin",
    genre: ["流行"],
    matchReason: "default",
    queueState: "not_queued",
    playCount: 0,
    recommendationWeight: 1,
    versions: [
      {
        assetId: "ktv-asset-discovery-sunny",
        displayName: "周杰伦-晴天-国语-流行.mkv",
        sourceLabel: "NAS曲库",
        extension: ".mkv",
        sizeBytes: 123456,
        audioTrackCount: 2,
        styleTags: ["流行"],
        category: "流行",
        queueState: "not_queued",
        canQueue: true,
        disabledLabel: null
      }
    ]
  };

  return {
    seed,
    recommended: [song],
    artists: [
      {
        artistId: "ktv-index-artist-zhou-jie-lun",
        artistName: "周杰伦",
        songCount: 1,
        songs: [song]
      }
    ],
    genres: [
      {
        genre: "流行",
        songCount: 1,
        songs: [song]
      }
    ]
  };
}

function discoverySong(input: {
  songId: string;
  title: string;
  artistId: string;
  artistName: string;
  genre: string[];
  playCount: number;
  coverImageUrl?: string;
  coverThumbnailUrl?: string;
}): SongDiscoverySong {
  return {
    source: "nas",
    songId: input.songId,
    title: input.title,
    artistId: input.artistId,
    artistName: input.artistName,
    language: "mandarin",
    genre: input.genre,
    matchReason: "default",
    queueState: "not_queued",
    playCount: input.playCount,
    recommendationWeight: input.playCount + 1,
    ...(input.coverImageUrl ? { coverImageUrl: input.coverImageUrl } : {}),
    ...(input.coverThumbnailUrl ? { coverThumbnailUrl: input.coverThumbnailUrl } : {}),
    versions: [
      {
        assetId: `asset-${input.songId}`,
        displayName: "高清版",
        sourceLabel: "NAS曲库",
        extension: ".mp4",
        sizeBytes: 734003200,
        audioTrackCount: 2,
        category: input.genre[0] ?? "",
        canQueue: true,
        queueState: "not_queued",
        disabledLabel: null
      }
    ]
  };
}

function emptySongSearchResponse(query: string) {
  return {
    query,
    nas: {
      status: "available",
      message: "找到 NAS 曲库结果",
      results: []
    },
    online: {
      status: "disabled",
      message: "暂不启用线上补歌",
      requestSupplement: { visible: false, label: "请求补歌" },
      candidates: []
    }
  };
}

function realMvControlSnapshot(): RoomControlSnapshot {
  const snapshot = roomSnapshot();
  return {
    ...snapshot,
    currentTarget: {
      ...snapshot.currentTarget!,
      assetId: "asset-real-mv",
      playbackUrl: "http://ktv.local/media/asset-real-mv",
      vocalMode: "instrumental",
      switchFamily: null,
      playbackProfile: {
        kind: "single_file_audio_tracks",
        container: "matroska",
        videoCodec: "mpeg2video",
        audioCodecs: ["aac", "aac"],
        requiresAudioTrackSelection: true
      },
      selectedTrackRef: {
        index: 1,
        id: "0x1101",
        label: "伴唱"
      }
    },
    switchTarget: null
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
  queueLength?: number;
  queueStatus?: "queued" | "removed";
  queueUndoExpiresAt?: string | null;
  sessionVersion?: number;
  tvOnlineCount?: number;
  volumePercent?: number;
} = {}): RoomControlSnapshot {
  const queueStatus = options.queueStatus ?? "queued";
  const queueLength = options.queueLength ?? 1;
  const tvOnlineCount = options.tvOnlineCount ?? 1;
  return {
    type: "room.control.snapshot",
    roomId: "living-room",
    roomSlug: "living-room",
    sessionVersion: options.sessionVersion ?? 1,
    state: "playing",
    volumePercent: options.volumePercent ?? DEFAULT_ROOM_VOLUME_PERCENT,
    pairing: {
      roomSlug: "living-room",
      controllerUrl: "http://ktv.local/controller?token=living-room.test",
      qrPayload: "http://ktv.local/controller?token=living-room.test",
      token: "token",
      tokenExpiresAt: "2026-05-04T10:10:00.000Z"
    },
    tvPresence: {
      online: true,
      deviceName: "TV",
      lastSeenAt: "2026-05-04T10:00:00.000Z",
      onlineCount: tvOnlineCount,
      devices: Array.from({ length: tvOnlineCount }, (_, index) => ({
        deviceId: `tv-${index + 1}`,
        deviceName: `TV ${index + 1}`,
        lastSeenAt: "2026-05-04T10:00:00.000Z"
      })),
      conflict: null
    },
    controllers: { onlineCount: 1 },
    currentTarget: {
      roomId: "living-room",
      sessionVersion: options.sessionVersion ?? 1,
      queueEntryId: "queue-current",
      sourceType: "nas",
      songId: "song-current",
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
      sourceType: "nas",
      switchKind: "asset",
      fromAssetId: "asset-current",
      toAssetId: "asset-original",
      playbackUrl: "http://ktv.local/media/asset-original",
      switchFamily: "family-main",
      vocalMode: "original",
      resumePositionMs: 1234,
      rollbackAssetId: "asset-current"
    },
    queue: Array.from({ length: queueLength }, (_, index) => ({
      queueEntryId: index === 0 ? "queue-next" : `queue-extra-${index + 1}`,
      sourceType: "nas",
      songId: index === 0 ? "song-next" : `song-extra-${index + 1}`,
      assetId: index === 0 ? "asset-next" : `asset-extra-${index + 1}`,
      songTitle: index === 0 ? "下一首" : `新增歌曲 ${index + 1}`,
      artistName: index === 0 ? "歌手" : "新增歌手",
      requestedBy: "phone-1",
      requestedByUserPhone: "13800138000",
      requestedByName: "阿飞",
      queuePosition: index + 2,
      status: queueStatus,
      canPromote: queueStatus === "queued",
      canDelete: queueStatus === "queued",
      undoExpiresAt: index === 0 ? options.queueUndoExpiresAt ?? null : null
    })),
    notice: null,
    generatedAt: "2026-05-04T10:00:00.000Z"
  };
}

function controllerUser(overrides: Partial<{ phone: string; displayName: string }> = {}) {
  return {
    phone: "13800138000",
    displayName: "阿飞",
    ...overrides
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
