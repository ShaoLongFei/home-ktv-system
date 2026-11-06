import type {
  ControllerSongHistoryEntry,
  OnlineCandidateCard,
  SongDiscoveryArtist,
  SongDiscoveryGenre,
  SongDiscoverySong,
  VocalMode
} from "@home-ktv/domain";
import type { PlaybackTarget, RoomInteractionKind } from "@home-ktv/player-contracts";
import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import {
  fetchDiscoveryArtistSongs,
  fetchDiscoveryArtists,
  fetchDiscoveryGenreSongs,
  requestPlayerPosition
} from "./api/client.js";
import { I18nProvider, LanguageSwitch, useI18n } from "./i18n.js";
import { useRoomController, type RoomControllerState } from "./runtime/use-room-controller.js";

export function App() {
  return (
    <I18nProvider defaultLanguage="zh">
      <ControllerApp />
    </I18nProvider>
  );
}

function ControllerApp() {
  const { t } = useI18n();
  const controller = useRoomController();
  const snapshot = controller.snapshot;
  const current = snapshot?.currentTarget;
  const switchTarget = snapshot?.switchTarget;
  const targetVocalMode =
    switchTarget?.vocalMode ??
    snapshot?.targetVocalMode ??
    (current?.vocalMode === "instrumental" ? "original" : "instrumental");
  const switchLabel = targetVocalMode === "original" ? t("button.switchToOriginal") : t("button.switchToInstrumental");
  const notice = snapshot?.notice ?? null;
  // 服务端给的是英文硬编码，按 kind 换成本地文案
  const noticeMessage =
    notice?.kind === "loading"
      ? t("status.loadingNext")
      : notice?.kind === "recovering"
        ? t("status.recovering")
        : notice?.message;
  const volumePercent = controller.volumePercent;
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchHistory, setSearchHistory] = useState(() => readSearchHistory());
  const [browseStack, setBrowseStack] = useState<BrowseView[]>([]);
  const browseView = browseStack.at(-1) ?? { kind: "home" };
  const [activeTab, setActiveTab] = useState<ControllerTab>("home");
  const [queueDrawerOpen, setQueueDrawerOpen] = useState(false);
  const [mirrorOpen, setMirrorOpen] = useState(false);
  const [interactionComposer, setInteractionComposer] = useState<RoomInteractionKind | null>(null);
  const [queueAddFeedback, setQueueAddFeedback] = useState<QueueAddFeedback | null>(null);
  const [queueToasts, setQueueToasts] = useState<QueueToast[]>([]);
  const queueToastIdRef = useRef(0);
  const pendingToastTitlesRef = useRef<Map<string, string>>(new Map());
  const previousQueueStatusRef = useRef<Record<string, string>>({});
  const pushQueueToast = useCallback((title: string, providerId?: string) => {
    queueToastIdRef.current += 1;
    const toastId = queueToastIdRef.current;
    setQueueToasts((current) => [
      ...current.slice(-2),
      { id: toastId, title, ...(providerId ? { providerId } : {}) }
    ]);
    globalThis.setTimeout(() => {
      setQueueToasts((current) => current.filter((toast) => toast.id !== toastId));
    }, 3000);
  }, []);
  const [optimisticQueueAdds, setOptimisticQueueAdds] = useState<OptimisticQueueAdd[]>([]);
  const queueFeedbackIdRef = useRef(0);
  const queueFeedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previousServerQueueCountRef = useRef(0);
  const discovery = controller.songDiscovery;
  const visibleArtists = discovery?.artists.slice(0, 6) ?? [];
  const visibleGenres = discovery?.genres.slice(0, 6) ?? [];
  const openBrowseView = useCallback((view: Exclude<BrowseView, { kind: "home" }>) => {
    setBrowseStack((current) => [...current, view]);
  }, []);
  const goBackBrowseView = useCallback(() => {
    setBrowseStack((current) => (current.length > 0 ? current.slice(0, -1) : current));
  }, []);
  const serverQueueCount = snapshot?.queue.filter((entry) => entry.status !== "removed").length ?? 0;
  const queueCount = serverQueueCount + optimisticQueueAdds.length;
  const triggerQueueAddFeedback = useCallback(
    (song: { artistName: string; title: string; providerId?: string }) => {
      if (queueFeedbackTimerRef.current) {
        clearTimeout(queueFeedbackTimerRef.current);
      }

      queueFeedbackIdRef.current += 1;
      const feedback = { id: queueFeedbackIdRef.current };
      setQueueAddFeedback(feedback);

      // 右上角状态标签：最多同时三条，每条 3 秒
      if (song.providerId) {
        pendingToastTitlesRef.current.set(song.providerId, song.title);
      }
      pushQueueToast(song.title, song.providerId);

      setOptimisticQueueAdds((current) => [
        ...current,
        {
          artistName: song.artistName,
          id: feedback.id,
          title: song.title
        }
      ]);
      queueFeedbackTimerRef.current = setTimeout(() => {
        setQueueAddFeedback((current) => (current?.id === feedback.id ? null : current));
      }, 900);
    },
    [pushQueueToast]
  );

  // 准备中 → 已点：再提醒一次，让人知道真的排上了
  useEffect(() => {
    const states = controller.onlineQueueState;
    const previous = previousQueueStatusRef.current;
    const next: Record<string, string> = {};

    for (const [providerId, state] of Object.entries(states)) {
      next[providerId] = state.status;
      const before = previous[providerId];
      if (state.status !== "queued" || !before || before === "queued") {
        continue;
      }
      const title = pendingToastTitlesRef.current.get(providerId);
      if (!title) {
        continue;
      }
      pendingToastTitlesRef.current.delete(providerId);
      pushQueueToast(title, providerId);
    }

    previousQueueStatusRef.current = next;
  }, [controller.onlineQueueState, pushQueueToast]);

  useEffect(() => {
    const previousCount = previousServerQueueCountRef.current;
    previousServerQueueCountRef.current = serverQueueCount;
    if (optimisticQueueAdds.length === 0) {
      return;
    }

    if (serverQueueCount > previousCount) {
      const confirmedCount = Math.min(serverQueueCount - previousCount, optimisticQueueAdds.length);
      if (confirmedCount > 0) {
        setOptimisticQueueAdds((current) => current.slice(confirmedCount));
      }
      return;
    }

    if (serverQueueCount < previousCount) {
      setOptimisticQueueAdds([]);
    }
  }, [optimisticQueueAdds.length, serverQueueCount]);

  useEffect(() => {
    if (controller.errorMessage) {
      setOptimisticQueueAdds([]);
    }
  }, [controller.errorMessage]);

  useEffect(() => {
    return () => {
      if (queueFeedbackTimerRef.current) {
        clearTimeout(queueFeedbackTimerRef.current);
      }
    };
  }, []);

  if (controller.authStatus !== "authenticated") {
    return (
      <main className="app-shell auth-shell" aria-label="KTV 控制端登录">
        <AppNotices controller={controller} t={t} />
        <AuthGate controller={controller} />
      </main>
    );
  }

  return (
    <main className={`app-shell app-shell--${activeTab}`} aria-label={t("app.aria")}>
      <AppNotices controller={controller} t={t} />

      {activeTab === "home" ? (
        <HomeScreen
          controller={controller}
          discovery={discovery}
          browseView={browseView}
          onQueueAddFeedback={triggerQueueAddFeedback}
          goBackBrowseView={goBackBrowseView}
          openBrowseView={openBrowseView}
          setInteractionComposer={setInteractionComposer}
          setSearchOpen={setSearchOpen}
          onOpenMirror={() => setMirrorOpen(true)}
          onOpenProfile={() => setActiveTab("my")}
          t={t}
          visibleArtists={visibleArtists}
          visibleGenres={visibleGenres}
        />
      ) : null}

      {activeTab === "my" ? (
        <MyScreen controller={controller} onQueueAddFeedback={triggerQueueAddFeedback} onBack={() => setActiveTab("home")} />
      ) : null}

      {activeTab === "home" ? (
        <MusicConsole
          controller={controller}
          current={current}
          queueCount={queueCount}
          switchLabel={switchLabel}
          t={t}
          volumePercent={volumePercent}
          onOpenQueue={() => setQueueDrawerOpen(true)}
        />
      ) : null}

      <QueueDrawer
        controller={controller}
        open={queueDrawerOpen}
        optimisticQueueAdds={optimisticQueueAdds}
        snapshot={snapshot}
        t={t}
        onClose={() => setQueueDrawerOpen(false)}
      />

      {mirrorOpen ? <TvMirrorOverlay roomSlug={controller.roomSlug} target={current ?? null} t={t} onClose={() => setMirrorOpen(false)} /> : null}
      {searchOpen ? (
        <SearchOverlay
          controller={controller}
          history={searchHistory}
          onQueueAddFeedback={triggerQueueAddFeedback}
          onClose={() => setSearchOpen(false)}
          onClearHistory={() => {
            writeSearchHistory([]);
            setSearchHistory([]);
          }}
          onCommitHistory={(query) => {
            const nextHistory = commitSearchHistory(searchHistory, query);
            writeSearchHistory(nextHistory);
            setSearchHistory(nextHistory);
          }}
          t={t}
        />
      ) : null}

      {interactionComposer ? (
        <InteractionComposer
          controller={controller}
          kind={interactionComposer}
          onClose={() => setInteractionComposer(null)}
          t={t}
        />
      ) : null}

      {controller.skipConfirmOpen ? (
        <div className="modal-backdrop">
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="skip-title">
            <h2 id="skip-title">{t("dialog.skipTitle")}</h2>
            <p>{t("dialog.skipBody", { title: current?.currentQueueEntryPreview.songTitle ?? t("current.eyebrow") })}</p>
            <div className="command-row">
              <button className="secondary-button" type="button" onClick={controller.cancelSkip}>
                {t("button.cancel")}
              </button>
              <button className="danger-button" type="button" onClick={() => void controller.confirmSkip()}>
                {t("button.confirm")}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {controller.duplicateConfirm ? (
        <div className="modal-backdrop">
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="duplicate-title">
            <h2 id="duplicate-title">{t("dialog.duplicateTitle")}</h2>
            <p>{t("dialog.duplicateBody", { title: controller.duplicateConfirm.title })}</p>
            <div className="command-row">
              <button className="secondary-button" type="button" onClick={controller.cancelDuplicateAdd}>
                {t("button.cancel")}
              </button>
              <button className="primary-button" type="button" onClick={() => void controller.confirmDuplicateAdd()}>
                {t("button.confirmAddAgain")}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {queueToasts.length > 0 || noticeMessage ? (
        <div className="queue-toasts" aria-live="polite">
          {noticeMessage ? (
            <div className="queue-toast queue-toast--notice">
              <span className="queue-toast__dot" aria-hidden="true" />
              <span className="queue-toast__title">{noticeMessage}</span>
            </div>
          ) : null}
          {queueToasts.map((toast) => {
            const state = toast.providerId ? controller.onlineQueueState[toast.providerId] : undefined;
            const statusLabel =
              state?.status === "preparing"
                ? t("search.onlinePreparing")
                : state?.status === "failed"
                  ? t("search.onlineFailed")
                  : t("search.onlineQueued");
            return (
              <div className="queue-toast" key={toast.id}>
                <span className="queue-toast__title">{toast.title}</span>
                <span className="queue-toast__state">{statusLabel}</span>
              </div>
            );
          })}
        </div>
      ) : null}

      {queueAddFeedback ? (
        <div className="queue-add-flyer" data-testid="queue-add-flyer" key={queueAddFeedback.id} aria-hidden="true">
          <span>+</span>
        </div>
      ) : null}

    </main>
  );
}

function AuthGate({ controller }: { controller: RoomControllerState }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [pending, setPending] = useState(false);
  const isRegister = mode === "register";
  const canSubmit = phone.trim().length > 0 && password.length >= 5 && (!isRegister || displayName.trim().length > 0);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit || pending) {
      return;
    }

    setPending(true);
    try {
      if (isRegister) {
        await controller.register({ phone: phone.trim(), password, displayName: displayName.trim() });
      } else {
        await controller.login({ phone: phone.trim(), password });
      }
    } finally {
      setPending(false);
    }
  };

  return (
    <section className="auth-panel" aria-label="控制端账号">
      <div className="auth-brand">
        <span className="auth-brand__mark" aria-hidden="true">K</span>
        <div>
          <p>HomeKTV</p>
          <h1>{isRegister ? "注册 KTV 控制端" : "登录 KTV 控制端"}</h1>
        </div>
      </div>
      <form className="auth-form" onSubmit={(event) => void submit(event)}>
        <label>
          <span>手机号</span>
          <input
            autoComplete="tel"
            inputMode="tel"
            name="phone"
            type="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
          />
        </label>
        {isRegister ? (
          <label>
            <span>昵称</span>
            <input
              autoComplete="name"
              name="displayName"
              type="text"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
            />
          </label>
        ) : null}
        <label>
          <span>密码</span>
          <input
            autoComplete={isRegister ? "new-password" : "current-password"}
            name="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        <button className="primary-button auth-submit" type="submit" disabled={!canSubmit || pending}>
          {pending ? "处理中" : isRegister ? "注册并进入" : "登录"}
        </button>
      </form>
      <div className="auth-switch">
        <button className="secondary-button" type="button" onClick={() => setMode(isRegister ? "login" : "register")}>
          {isRegister ? "已有账号，去登录" : "没有账号，去注册"}
        </button>
      </div>
    </section>
  );
}

function AccountPanel({ controller }: { controller: RoomControllerState }) {
  const user = controller.authUser;
  const [editing, setEditing] = useState(false);
  const [displayName, setDisplayName] = useState(user?.displayName ?? "");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    setDisplayName(user?.displayName ?? "");
  }, [user?.displayName]);

  if (!user) {
    return null;
  }

  const save = async () => {
    if (!displayName.trim() || pending) {
      return;
    }
    setPending(true);
    try {
      await controller.updateDisplayName(displayName.trim());
      setEditing(false);
    } finally {
      setPending(false);
    }
  };

  return (
    <section className="account-panel" aria-label="我的账号">
      <div className="account-panel__main">
        <span className="account-avatar" aria-hidden="true">{user.displayName.slice(0, 1).toUpperCase()}</span>
        <div>
          {editing ? (
            <label className="account-edit">
              <span>昵称</span>
              <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
            </label>
          ) : (
            <>
              <strong>{user.displayName}</strong>
              <p>{user.phone}</p>
            </>
          )}
        </div>
      </div>
      <div className="account-panel__actions">
        {editing ? (
          <>
            <button className="primary-button compact-button" type="button" disabled={pending} onClick={() => void save()}>
              保存
            </button>
            <button className="secondary-button compact-button" type="button" onClick={() => setEditing(false)}>
              取消
            </button>
          </>
        ) : (
          <>
            <button className="secondary-button compact-button" type="button" onClick={() => setEditing(true)}>
              改昵称
            </button>
            <button className="secondary-button compact-button" type="button" onClick={() => void controller.logout()}>
              退出
            </button>
          </>
        )}
      </div>
    </section>
  );
}

function MyScreen({
  controller,
  onQueueAddFeedback,
  onBack
}: {
  controller: RoomControllerState;
  onQueueAddFeedback(song: QueueAddFeedbackSong): void;
  onBack(): void;
}) {
  const history = controller.songHistory;
  return (
    <div className="my-screen">
      <header className="top-bar">
        <div className="top-bar__heading">
          <button className="secondary-button compact-button" type="button" onClick={onBack}>
            返回
          </button>
          <h1>我的</h1>
        </div>
      </header>
      <AccountPanel controller={controller} />
      <section className="panel my-history-panel" aria-label="点歌历史">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">我的点歌</p>
            <h2>点歌历史</h2>
          </div>
          <button className="secondary-button compact-button" type="button" onClick={() => void controller.refreshSongHistory()}>
            刷新
          </button>
        </div>
        <div className="my-history-summary">
          <span>点过歌曲</span>
          <strong>{history.length}</strong>
        </div>
        <div className="my-history-list">
          {history.map((song) => (
            <HistorySongRow
              controller={controller}
              key={song.songId}
              onQueueAddFeedback={onQueueAddFeedback}
              song={song}
            />
          ))}
          {controller.songHistoryStatus === "loading" && history.length === 0 ? (
            <p className="empty-state local-empty">正在加载历史</p>
          ) : null}
          {controller.songHistoryStatus !== "loading" && history.length === 0 ? (
            <p className="empty-state local-empty">还没有点过歌</p>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function HistorySongRow({
  controller,
  onQueueAddFeedback,
  song
}: {
  controller: RoomControllerState;
  onQueueAddFeedback(song: QueueAddFeedbackSong): void;
  song: ControllerSongHistoryEntry;
}) {
  const addAgain = () => {
    const queued = controller.requestAddSongVersion(song.songId, song.assetId, song.title, "not_queued");
    if (queued) {
      onQueueAddFeedback(song);
    }
  };

  return (
    <article className="my-history-row" aria-label={`${song.title} ${song.requestCount} 次`}>
      <div className="my-history-row__main">
        <strong>{song.title}</strong>
        <p>{song.artistName || "未知歌手"}</p>
      </div>
      <div className="my-history-row__meta">
        <span className="my-history-count">点过 {song.requestCount} 次</span>
      </div>
      <button className="primary-button compact-button" type="button" onClick={addAgain} aria-label={`再点 ${song.title}`}>
        再点
      </button>
    </article>
  );
}

function AppNotices({ controller, t }: { controller: RoomControllerState; t: TFunction }) {
  return (
    <>
      {controller.connectionStatus === "reconnecting" ? (
        <div className="offline-banner">{t("status.reconnecting")}</div>
      ) : null}
      {controller.errorMessage ? <div className="error-banner">{controller.errorMessage}</div> : null}
    </>
  );
}

function HomeScreen({
  browseView,
  controller,
  discovery,
  onQueueAddFeedback,
  goBackBrowseView,
  openBrowseView,
  setInteractionComposer,
  setSearchOpen,
  onOpenMirror,
  onOpenProfile,
  t,
  visibleArtists,
  visibleGenres
}: {
  browseView: BrowseView;
  controller: RoomControllerState;
  discovery: RoomControllerState["songDiscovery"];
  onQueueAddFeedback(song: QueueAddFeedbackSong): void;
  goBackBrowseView(): void;
  openBrowseView(view: Exclude<BrowseView, { kind: "home" }>): void;
  setInteractionComposer(kind: RoomInteractionKind): void;
  setSearchOpen(open: boolean): void;
  onOpenMirror(): void;
  onOpenProfile(): void;
  t: TFunction;
  visibleArtists: readonly SongDiscoveryArtist[];
  visibleGenres: readonly SongDiscoveryGenre[];
}) {
  if (browseView.kind !== "home") {
    return (
      <DiscoveryBrowseView
        controller={controller}
        discovery={discovery}
        onQueueAddFeedback={onQueueAddFeedback}
        goBackBrowseView={goBackBrowseView}
        openBrowseView={openBrowseView}
        t={t}
        view={browseView}
      />
    );
  }

  return (
    <>
      <section className="home-search-section" aria-label={t("search.aria")}>
        <button className="home-search-button" type="button" aria-label={t("search.openAria")} onClick={() => setSearchOpen(true)}>
          <span className="home-search-icon" aria-hidden="true" />
          <span>{controller.songSearchQuery || t("search.placeholder")}</span>
        </button>
        {controller.songSearchStatus === "loading" ? <span className="search-status">{t("search.loading")}</span> : null}
        <LanguageSwitch />
        <button className="profile-entry" type="button" aria-label={t("nav.my")} onClick={onOpenProfile}>
          {t("nav.my")}
        </button>
      </section>

      <section className="home-category-section" aria-label={t("discovery.categories")}>
        <CategoryCard
          className="category-card--artist"
          label={t("discovery.artists")}
          meta={t("discovery.artistCardHint", { count: discovery?.artists.length ?? 0 })}
          onClick={() => openBrowseView({ kind: "artists" })}
          preview={visibleArtists.map((artist) => artist.artistName)}
        />
        <CategoryCard
          className="category-card--genre"
          label={t("discovery.genres")}
          meta={t("discovery.genreCardHint", { count: discovery?.genres.length ?? 0 })}
          onClick={() => openBrowseView({ kind: "genres" })}
          preview={visibleGenres.map((genre) => genre.genre)}
        />
      </section>

      <section className="home-shortcut-section" aria-label={t("shortcut.aria")}>
        <ShortcutAction className="shortcut-action--emoji" label={t("shortcut.emoji")} icon="emoji" onClick={() => setInteractionComposer("emoji")} />
        <ShortcutAction
          className="shortcut-action--rainbow"
          label={t("shortcut.rainbowPraise")}
          icon="rainbow"
          onClick={() => setInteractionComposer("rainbow_praise")}
        />
        <ShortcutAction className="shortcut-action--roast" label={t("shortcut.roast")} icon="roast" onClick={() => setInteractionComposer("roast")} />
        <ShortcutAction className="shortcut-action--blessing" label={t("shortcut.blessing")} icon="blessing" onClick={() => setInteractionComposer("blessing")} />
        <ShortcutAction className="shortcut-action--mirror" label={t("shortcut.mirror")} icon="mirror" onClick={onOpenMirror} />
      </section>

      <section className="recommendation-panel home-recommendations" aria-label={t("discovery.recommendations")}>
        <div className="panel-heading">
          <h2>{t("discovery.recommendations")}</h2>
          <button className="secondary-button compact-button" type="button" onClick={controller.refreshSongDiscovery}>
            {t("button.refreshRecommendations")}
          </button>
        </div>
        <div className="song-list recommendation-list">
          {discovery?.recommended.map((song) => (
            <DiscoverySongRow
              controller={controller}
              key={song.songId}
              onQueueAddFeedback={onQueueAddFeedback}
              song={song}
              t={t}
            />
          ))}
          {controller.songDiscoveryStatus === "loading" && !discovery ? (
            <p className="empty-state local-empty">{t("discovery.loading")}</p>
          ) : null}
          {discovery && discovery.recommended.length === 0 ? (
            <p className="empty-state local-empty">{t("discovery.emptyRecommendations")}</p>
          ) : null}
        </div>
      </section>
    </>
  );
}

function CategoryCard({
  className,
  label,
  meta,
  onClick,
  preview
}: {
  className: string;
  label: string;
  meta: string;
  onClick(): void;
  preview?: readonly string[];
}) {
  return (
    <button className={`category-card ${className}`} type="button" onClick={onClick}>
      <span className="category-card__label">{label}</span>
      <span className="category-card__meta">{meta}</span>
      {preview && preview.length > 0 ? (
        <span className="category-card__preview">
          {preview.slice(0, 3).map((item) => (
            <span key={item}>{item}</span>
          ))}
        </span>
      ) : null}
    </button>
  );
}

function ShortcutAction({
  className,
  icon,
  label,
  onClick
}: {
  className: string;
  icon: "emoji" | "rainbow" | "roast" | "blessing" | "mirror";
  label: string;
  onClick(): void;
}) {
  return (
    <button className={`shortcut-action ${className}`} type="button" onClick={onClick}>
      <span className={`shortcut-action__icon shortcut-action__icon--${icon}`} aria-hidden="true" />
      <span>{label}</span>
    </button>
  );
}

/** 自动播放被拦、或 jsdom 里 play() 未实现时都不要影响渲染。 */
function playQuietly(video: HTMLVideoElement): void {
  try {
    const result: unknown = video.play();
    if (result && typeof (result as Promise<void>).catch === "function") {
      void (result as Promise<void>).catch(() => {});
    }
  } catch {
    // 忽略：浏览器拒绝自动播放
  }
}

/**
 * 手机端静音预览电视画面。
 *
 * 打开时主动请求电视上报一次当前位置——定时心跳 10 秒一次，等下一次太久，
 * 会明显对不上。拿到新位置前先不 seek，1.5 秒没等到就用快照里的旧值兜底。
 */
function TvMirrorOverlay({
  roomSlug,
  target,
  onClose,
  t
}: {
  roomSlug: string;
  target: PlaybackTarget | null;
  onClose(): void;
  t: TFunction;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const alignedEntryRef = useRef<string | null>(null);
  const reconfirmedEntryRef = useRef<string | null>(null);
  const pendingFreshPositionRef = useRef(true);
  const initialPositionRef = useRef(target?.resumePositionMs ?? null);
  const latestTargetRef = useRef(target);

  useEffect(() => {
    latestTargetRef.current = target;
  }, [target]);

  const applyPosition = useCallback((video: HTMLVideoElement, positionMs: number) => {
    const seconds = Math.max(0, positionMs) / 1000;
    if (Number.isFinite(seconds) && seconds > 0) {
      try {
        video.currentTime = seconds;
      } catch {
        // 极端情况下仍然 seek 不了，退回从头播放
      }
    }
    playQuietly(video);
  }, []);

  const alignToTarget = useCallback(
    (video: HTMLVideoElement) => {
      if (!target) {
        return;
      }
      // metadata 没到之前 seek 会被浏览器直接忽略，等 loadedmetadata 再来
      if (video.readyState < 1) {
        return;
      }

      if (pendingFreshPositionRef.current) {
        // 还在等电视回报新位置；和打开时那份一样就继续等
        if (target.resumePositionMs === initialPositionRef.current) {
          return;
        }
        pendingFreshPositionRef.current = false;
      } else if (alignedEntryRef.current === target.queueEntryId) {
        // 同一首歌已经对齐过，别再被后续快照拖回去
        return;
      }

      alignedEntryRef.current = target.queueEntryId;
      applyPosition(video, target.resumePositionMs);
    },
    [applyPosition, target]
  );

  useEffect(() => {
    void requestPlayerPosition({ roomSlug }).catch(() => {
      pendingFreshPositionRef.current = false;
    });

    const timeoutId = globalThis.setTimeout(() => {
      if (!pendingFreshPositionRef.current) {
        return;
      }
      // 电视没回位置（离线/被拦），用快照里的旧值兜底
      pendingFreshPositionRef.current = false;
      const video = videoRef.current;
      const latest = latestTargetRef.current;
      if (video && latest) {
        alignedEntryRef.current = latest.queueEntryId;
        applyPosition(video, latest.resumePositionMs);
      }
    }, 1500);

    return () => globalThis.clearTimeout(timeoutId);
  }, [applyPosition, roomSlug]);

  useEffect(() => {
    const video = videoRef.current;
    if (video) {
      alignToTarget(video);
    }
  }, [alignToTarget]);

  // 定时 seek 会在播放中途把画面拽回去，看着就像重新播放，所以改成
  // 只在真正开始播放时确认一次；同一首歌不重复动。
  const reconfirmPosition = useCallback((video: HTMLVideoElement) => {
    const latest = latestTargetRef.current;
    if (!latest || reconfirmedEntryRef.current === latest.queueEntryId) {
      return;
    }
    reconfirmedEntryRef.current = latest.queueEntryId;

    const targetSeconds = latest.resumePositionMs / 1000;
    if (targetSeconds <= 0) {
      return;
    }
    if (Math.abs(targetSeconds - video.currentTime) > 3) {
      try {
        video.currentTime = targetSeconds;
      } catch {
        // seek 不了就保持当前进度
      }
    }
  }, []);

  return (
    <div className="mirror-layer" role="dialog" aria-modal="true" aria-label={t("mirror.title")}>
      <div className="mirror-layer__bar">
        <span className="mirror-layer__heading">
          {t("mirror.title")}
          <span className="mirror-layer__hint">{t("mirror.mutedHint")}</span>
        </span>
        <button className="secondary-button compact-button" type="button" onClick={onClose}>
          {t("button.close")}
        </button>
      </div>
      {target ? (
        <video
          autoPlay
          className="mirror-layer__video"
          muted
          onLoadedMetadata={(event) => alignToTarget(event.currentTarget)}
          onPlaying={(event) => reconfirmPosition(event.currentTarget)}
          playsInline
          preload="metadata"
          ref={videoRef}
          src={target.playbackUrl}
        />
      ) : (
        <p className="mirror-layer__empty">{t("mirror.empty")}</p>
      )}
    </div>
  );
}

function InteractionComposer({
  controller,
  kind,
  onClose,
  t
}: {
  controller: RoomControllerState;
  kind: RoomInteractionKind;
  onClose(): void;
  t: TFunction;
}) {
  const presets = interactionPresets(kind, t);
  const visiblePresets = kind === "emoji" ? presets : presets.slice(0, 6);
  const [message, setMessage] = useState(presets[0] ?? "");
  const title = interactionTitle(kind, t);
  const isPending = controller.pendingInteractionKind === kind;
  const maxLength = interactionMaxLength(kind);
  const emojiPressState = useRef<{
    intervalId: number | null;
    repeatActive: boolean;
    startTimeoutId: number | null;
    stopTimeoutId: number | null;
    suppressClick: boolean;
  }>({
    intervalId: null,
    repeatActive: false,
    startTimeoutId: null,
    stopTimeoutId: null,
    suppressClick: false
  });

  const clearEmojiRepeat = useCallback(() => {
    const state = emojiPressState.current;
    if (state.startTimeoutId) {
      clearTimeout(state.startTimeoutId);
      state.startTimeoutId = null;
    }
    if (state.intervalId) {
      clearInterval(state.intervalId);
      state.intervalId = null;
    }
    if (state.stopTimeoutId) {
      clearTimeout(state.stopTimeoutId);
      state.stopTimeoutId = null;
    }
    state.repeatActive = false;
  }, []);

  useEffect(() => clearEmojiRepeat, [clearEmojiRepeat]);

  const submit = useCallback(
    async (value = message, options?: { closeAfterSend?: boolean }) => {
      const normalized = value.trim();
      if (!normalized || isPending) {
        return;
      }
      await controller.sendInteraction(kind, normalized);
      if (options?.closeAfterSend ?? kind !== "emoji") {
        onClose();
      }
    },
    [controller, isPending, kind, message, onClose]
  );

  const sendEmoji = useCallback(
    (emoji: string) => {
      void submit(emoji, { closeAfterSend: false });
    },
    [submit]
  );

  const handleEmojiPressStart = useCallback(
    (emoji: string) => {
      clearEmojiRepeat();
      const state = emojiPressState.current;
      state.suppressClick = false;
      state.startTimeoutId = window.setTimeout(() => {
        const repeatState = emojiPressState.current;
        repeatState.repeatActive = true;
        repeatState.suppressClick = true;
        repeatState.intervalId = window.setInterval(() => {
          sendEmoji(emoji);
        }, 200);
        repeatState.stopTimeoutId = window.setTimeout(() => {
          clearEmojiRepeat();
          repeatState.suppressClick = true;
        }, 5000);
      }, 1000);
    },
    [clearEmojiRepeat, sendEmoji]
  );

  const handleEmojiPressEnd = useCallback(() => {
    const state = emojiPressState.current;
    if (state.startTimeoutId) {
      clearTimeout(state.startTimeoutId);
      state.startTimeoutId = null;
    }
    if (state.repeatActive) {
      state.suppressClick = true;
    }
    if (state.intervalId) {
      clearInterval(state.intervalId);
      state.intervalId = null;
    }
    if (state.stopTimeoutId) {
      clearTimeout(state.stopTimeoutId);
      state.stopTimeoutId = null;
    }
    state.repeatActive = false;
  }, []);

  const handleEmojiClick = useCallback(
    (emoji: string) => {
      const state = emojiPressState.current;
      if (state.suppressClick) {
        state.suppressClick = false;
        return;
      }
      sendEmoji(emoji);
    },
    [sendEmoji]
  );

  const handleEmojiPointerCancel = useCallback(() => {
    handleEmojiPressEnd();
  }, [handleEmojiPressEnd]);

  const handleEmojiPointerLeave = useCallback(() => {
    handleEmojiPressEnd();
  }, [handleEmojiPressEnd]);

  const submitForm = async (value = message) => {
    const normalized = value.trim();
    if (!normalized || isPending) {
      return;
    }
    await submit(normalized, { closeAfterSend: false });
  };

  const sendRandomMessage = useCallback(() => {
    const randomPreset = randomInteractionPreset(presets, "");
    void submit(randomPreset, { closeAfterSend: false });
  }, [presets, submit]);

  return (
    <div className="modal-backdrop modal-backdrop--sheet">
      <section
        className={`modal interaction-sheet interaction-sheet--${kind} interaction-composer`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="interaction-title"
      >
        <div className="interaction-sheet__header">
          <div className="interaction-sheet__title-block">
            <span className="interaction-sheet__mark" aria-hidden="true" />
            <h2 id="interaction-title">{title}</h2>
          </div>
          <button className="secondary-button compact-button" type="button" onClick={onClose}>
            {t("button.close")}
          </button>
        </div>

        <div className="interaction-sheet__body">
          <div className={kind === "emoji" ? "interaction-preset-grid emoji-grid" : "interaction-preset-grid"}>
            {visiblePresets.map((preset) => (
              <button
                className={kind === "emoji" ? "interaction-option interaction-option--emoji" : "interaction-option"}
                key={preset}
                type="button"
                disabled={isPending}
                onClick={() => (kind === "emoji" ? handleEmojiClick(preset) : setMessage(preset))}
                onPointerCancel={kind === "emoji" ? handleEmojiPointerCancel : undefined}
                onPointerDown={kind === "emoji" ? () => handleEmojiPressStart(preset) : undefined}
                onPointerLeave={kind === "emoji" ? handleEmojiPointerLeave : undefined}
                onPointerUp={kind === "emoji" ? handleEmojiPressEnd : undefined}
              >
                {preset}
              </button>
            ))}
          </div>
        </div>

        {kind !== "emoji" ? (
          <form
            className="interaction-sheet__footer interaction-form"
            onSubmit={(event) => {
              event.preventDefault();
              void submitForm();
            }}
          >
            <textarea
              aria-label={t("interaction.inputAria")}
              className="interaction-input"
              maxLength={maxLength}
              rows={2}
              value={message}
              onChange={(event) => setMessage(event.currentTarget.value)}
              placeholder={t("interaction.placeholder")}
            />
            <div className="interaction-form__actions">
              <button className="secondary-button interaction-random-button" type="button" disabled={isPending} onClick={sendRandomMessage}>
                {interactionRandomLabel(kind, t)}
              </button>
              <button className="primary-button" type="submit" disabled={isPending || message.trim().length === 0}>
                {isPending ? t("button.submitting") : t("interaction.send")}
              </button>
            </div>
          </form>
        ) : (
          <footer className="interaction-sheet__footer interaction-sheet__footer--emoji">
            <button className="secondary-button" type="button" onClick={onClose}>
              {t("button.close")}
            </button>
          </footer>
        )}
      </section>
    </div>
  );
}

function interactionTitle(kind: RoomInteractionKind, t: TFunction): string {
  if (kind === "emoji") {
    return t("interaction.emojiTitle");
  }
  if (kind === "bullet") {
    return t("interaction.bulletTitle");
  }
  if (kind === "rainbow_praise") {
    return t("interaction.rainbowPraiseTitle");
  }
  if (kind === "roast") {
    return t("interaction.roastTitle");
  }
  return t("interaction.blessingTitle");
}

function interactionRandomLabel(kind: RoomInteractionKind, t: TFunction): string {
  if (kind === "rainbow_praise") {
    return t("interaction.randomRainbowPraise");
  }
  if (kind === "roast") {
    return t("interaction.randomRoast");
  }
  if (kind === "blessing") {
    return t("interaction.randomBlessing");
  }
  return t("interaction.randomMessage");
}

function interactionMaxLength(kind: RoomInteractionKind): number {
  if (kind === "emoji") {
    return 8;
  }
  if (kind === "bullet") {
    return 60;
  }
  return 80;
}

function interactionPresets(kind: RoomInteractionKind, t: TFunction): string[] {
  if (kind === "emoji") {
    return [
      "😀",
      "😂",
      "😍",
      "🥳",
      "😎",
      "🤯",
      "👏",
      "🙌",
      "👍",
      "🤘",
      "💪",
      "🙏",
      "🎤",
      "🎧",
      "🎸",
      "🥁",
      "🎹",
      "🎶",
      "🎉",
      "🎊",
      "✨",
      "🔥",
      "💥",
      "🌟",
      "🚀",
      "🏆",
      "👑",
      "💎",
      "🪩",
      "📣",
      "🍻",
      "🍰",
      "🍓",
      "☕",
      "🍿",
      "🍭",
      "❤️",
      "💯",
      "✅",
      "⚡",
      "🌀",
      "🔔",
      "🌈",
      "🌙",
      "☀️",
      "🌊",
      "🎈",
      "🎁"
    ];
  }
  if (kind === "bullet") {
    return [t("interaction.bulletPreset1"), t("interaction.bulletPreset2"), t("interaction.bulletPreset3")];
  }
  if (kind === "rainbow_praise") {
    return translatedInteractionPresets("rainbowPraise", 30, t);
  }
  if (kind === "roast") {
    return translatedInteractionPresets("roast", 30, t);
  }
  return translatedInteractionPresets("blessing", 30, t);
}

function translatedInteractionPresets(prefix: "rainbowPraise" | "roast" | "blessing", count: number, t: TFunction): string[] {
  return Array.from({ length: count }, (_, index) => t(`interaction.${prefix}Preset${index + 1}`));
}

function randomInteractionPreset(presets: readonly string[], current: string): string {
  if (presets.length === 0) {
    return current;
  }

  const candidates = presets.filter((preset) => preset !== current);
  const pool = candidates.length > 0 ? candidates : presets;
  return pool[Math.floor(Math.random() * pool.length)] ?? current;
}

function MusicConsole({
  controller,
  current,
  queueCount,
  switchLabel,
  t,
  volumePercent,
  onOpenQueue
}: {
  controller: RoomControllerState;
  current: NonNullable<RoomControllerState["snapshot"]>["currentTarget"] | undefined;
  queueCount: number;
  switchLabel: string;
  t: TFunction;
  volumePercent: number;
  onOpenQueue(): void;
}) {
  const paused = controller.snapshot?.playbackPaused === true;
  const adjustVolume = (delta: number) => {
    const next = Math.min(100, Math.max(0, volumePercent + delta));
    if (next !== volumePercent) {
      controller.setVolumePercent(next);
    }
  };

  return (
    <section className="music-console" aria-label={t("console.aria")}>
      <div className="music-console__head">
        <strong className="music-console__title">
          {current?.currentQueueEntryPreview.songTitle ?? t("current.waiting")}
        </strong>
        <span className="music-console__artist">
          {current?.currentQueueEntryPreview.artistName ?? t("console.idleHint")}
        </span>
      </div>
      <div className="music-console__meta">
        <span>{t("volume.label")}</span>
        <span className="music-console__volume-value">{t("volume.value", { value: volumePercent })}</span>
      </div>
      <div className="music-console__controls">
        <button
          aria-label={t("volume.decrease")}
          className="secondary-button compact-button volume-step volume-step--minus"
          type="button"
          onClick={() => adjustVolume(-5)}
        >
          −
        </button>
        <button
          aria-label={t("volume.increase")}
          className="secondary-button compact-button volume-step volume-step--plus"
          type="button"
          onClick={() => adjustVolume(5)}
        >
          +
        </button>
        <button
          className="secondary-button compact-button"
          disabled={!current}
          type="button"
          onClick={() => void controller.replayCurrent()}
        >
          {t("button.replay")}
        </button>
        <button
          aria-label={switchLabel}
          className="secondary-button compact-button"
          disabled={!current}
          type="button"
          onClick={() => void controller.switchVocalMode()}
        >
          {resolveVocalButtonLabel(current?.vocalMode, controller.snapshot?.targetVocalMode, t)}
        </button>
        <button
          className="secondary-button compact-button"
          disabled={!current}
          type="button"
          onClick={() => void controller.togglePause()}
        >
          {paused ? t("button.resume") : t("button.pause")}
        </button>
        <button
          className="danger-button compact-button"
          disabled={!current}
          type="button"
          onClick={controller.requestSkip}
        >
          {t("button.skip")}
        </button>
        <button className="secondary-button compact-button music-console__playlist" type="button" onClick={onOpenQueue}>
          {t("console.playlist")}
          <span className="music-console__count">{queueCount > 99 ? "99+" : queueCount}</span>
        </button>
      </div>
    </section>
  );
}

function resolveVocalButtonLabel(
  currentMode: VocalMode | undefined,
  targetMode: VocalMode | null | undefined,
  t: TFunction
): string {
  const resolved =
    currentMode === "original" || currentMode === "instrumental"
      ? currentMode
      : targetMode === "original"
        ? "original"
        : "instrumental";
  return resolved === "original" ? t("button.vocalOriginal") : t("button.vocalInstrumental");
}

function QueueDrawer({
  controller,
  open,
  optimisticQueueAdds,
  snapshot,
  t,
  onClose
}: {
  controller: RoomControllerState;
  open: boolean;
  optimisticQueueAdds: readonly OptimisticQueueAdd[];
  snapshot: RoomControllerState["snapshot"];
  t: TFunction;
  onClose(): void;
}) {
  if (!open) {
    return null;
  }

  return (
    <div className="queue-drawer-layer">
      <button aria-label={t("button.close")} className="queue-drawer-backdrop" type="button" onClick={onClose} />
      <aside className="queue-drawer" role="region" aria-label={t("queue.aria")}>
        <div className="queue-drawer__header">
          <h2>{t("queue.title")}</h2>
          <div className="queue-drawer__actions">
            <button
              className="secondary-button compact-button"
              type="button"
              disabled={(snapshot?.queue.length ?? 0) < 2}
              onClick={() => void controller.shuffleQueue()}
            >
              {t("button.shuffle")}
            </button>
            <button className="secondary-button compact-button" type="button" onClick={onClose}>
              {t("button.close")}
            </button>
          </div>
        </div>
        <QueueList controller={controller} optimisticQueueAdds={optimisticQueueAdds} snapshot={snapshot} t={t} />
      </aside>
    </div>
  );
}

function QueueList({
  controller,
  optimisticQueueAdds,
  snapshot,
  t
}: {
  controller: RoomControllerState;
  optimisticQueueAdds: readonly OptimisticQueueAdd[];
  snapshot: RoomControllerState["snapshot"];
  t: TFunction;
}) {
  return (
    <div className="queue-list">
      {snapshot?.queue.length || optimisticQueueAdds.length ? (
        <>
          {snapshot?.queue.map((entry) => {
            const undoExpiresAt =
              entry.undoExpiresAt ??
              (controller.pendingUndo?.queueEntryId === entry.queueEntryId ? controller.pendingUndo.undoExpiresAt : null);
            const requesterLabel = queueRequesterLabel(entry, t);
            const requesterToneClass = queueRequesterToneClass(entry);
            return (
              <article className="queue-row" key={entry.queueEntryId}>
                <div>
                  <strong>{entry.songTitle}</strong>
                  <p className="queue-meta">
                    <span>{entry.artistName}</span>
                    <span aria-hidden="true">·</span>
                    <span className={`queue-requester ${requesterToneClass}`}>{requesterLabel}</span>
                  </p>
                  {undoExpiresAt ? <small>{t("queue.undoUntil", { time: formatTime(undoExpiresAt) })}</small> : null}
                </div>
                <div className="row-actions">
                  <button className="secondary-button" type="button" disabled={!entry.canPromote} onClick={() => void controller.promoteQueueEntry(entry.queueEntryId)}>
                    {t("button.promote")}
                  </button>
                  <button className="danger-button" type="button" disabled={!entry.canDelete} onClick={() => void controller.deleteQueueEntry(entry.queueEntryId)}>
                    {t("button.delete")}
                  </button>
                  {undoExpiresAt ? (
                    <button className="secondary-button" type="button" onClick={() => void controller.undoDelete(entry.queueEntryId)}>
                      {t("button.undo")}
                    </button>
                  ) : null}
                </div>
              </article>
            );
          })}
          {optimisticQueueAdds.map((entry) => (
            <article className="queue-row queue-row--pending" key={`pending-${entry.id}`}>
              <div>
                <strong>{entry.title}</strong>
                <p>{entry.artistName}</p>
                <small>{t("queue.pending")}</small>
              </div>
            </article>
          ))}
        </>
      ) : (
        <p className="empty-state">{t("queue.empty")}</p>
      )}
    </div>
  );
}

type TFunction = ReturnType<typeof useI18n>["t"];

type ControllerTab = "home" | "my";

type QueueAddFeedback = {
  id: number;
};

type QueueAddFeedbackSong = {
  artistName: string;
  title: string;
  /** 在线歌曲用来读实时状态；NAS 歌曲没有 */
  providerId?: string | undefined;
};

/** 点歌后右上角的状态小标签，3 秒自己消失 */
type QueueToast = {
  id: number;
  title: string;
  /** 在线歌曲用来读实时状态；NAS 歌曲没有 */
  providerId?: string | undefined;
};

type OptimisticQueueAdd = {
  artistName: string;
  id: number;
  title: string;
};

type BrowseView =
  | { kind: "home" }
  | { kind: "artists" }
  | { kind: "genres" }
  | { kind: "artist"; item: SongDiscoveryArtist }
  | { kind: "genre"; item: SongDiscoveryGenre };

type DiscoveryDetailView = Extract<BrowseView, { kind: "artist" | "genre" }>;

type DiscoveryDetailState = {
  nextOffset: number | null;
  songs: SongDiscoverySong[];
  status: "loading" | "success" | "error";
};

type ArtistListState = {
  items: SongDiscoveryArtist[];
  nextOffset: number | null;
  status: "idle" | "loading" | "loadingMore" | "success" | "error";
};

const discoveryDetailPageSize = 60;
const discoveryArtistsPageSize = 24;

function isDiscoveryDetailView(view: BrowseView): view is DiscoveryDetailView {
  return view.kind === "artist" || view.kind === "genre";
}

function discoveryDetailKey(view: BrowseView): string | null {
  if (view.kind === "artist") {
    return `artist:${view.item.artistId}`;
  }
  if (view.kind === "genre") {
    return `genre:${view.item.genre}`;
  }
  return null;
}

function SearchOverlay({
  controller,
  history,
  onClearHistory,
  onClose,
  onCommitHistory,
  onQueueAddFeedback,
  t
}: {
  controller: RoomControllerState;
  history: readonly string[];
  onClearHistory(): void;
  onClose(): void;
  onCommitHistory(query: string): void;
  onQueueAddFeedback(song: QueueAddFeedbackSong): void;
  t: TFunction;
}) {
  const hasQuery = controller.songSearchQuery.trim().length > 0;
  const submitSearch = () => {
    const query = controller.songSearchQuery.trim();
    if (query) {
      onCommitHistory(query);
    }
    controller.submitSongSearch();
  };

  return (
    <div className="search-overlay-backdrop">
      <section className="search-overlay" role="dialog" aria-modal="true" aria-label={t("search.title")}>
        {/* 搜索框 + 搜索 + 返回 合成一行，整行吸顶 */}
        <div className="search-overlay__header">
          <form
            role="search"
            className="search-form"
            onSubmit={(event) => {
              event.preventDefault();
              submitSearch();
            }}
          >
            <input
              autoFocus
              aria-label={t("search.inputAria")}
              className="search-input"
              value={controller.songSearchQuery}
              onChange={(event) => controller.setSongSearchQuery(event.currentTarget.value)}
              placeholder={t("search.placeholder")}
            />
            <button className="primary-button" type="submit">{t("search.submit")}</button>
          </form>
          <button className="primary-button search-overlay__back" type="button" onClick={onClose}>
            {t("button.back")}
          </button>
        </div>

        {hasQuery ? (
          <SearchResults
            controller={controller}
            onQueueAddFeedback={onQueueAddFeedback}
            t={t}
          />
        ) : (
          <div className="history-panel">
            <div className="panel-heading">
              <h3>{t("search.historyTitle")}</h3>
            </div>
            <div className="history-list">
              {history.map((query) => (
                <button
                  className="history-chip"
                  key={query}
                  type="button"
                  onClick={() => {
                    controller.setSongSearchQuery(query);
                    onCommitHistory(query);
                    controller.submitSongSearch();
                  }}
                >
                  {query}
                </button>
              ))}
              {history.length === 0 ? <p className="empty-state">{t("search.historyEmpty")}</p> : null}
            </div>
            <div className="history-actions">
              <button className="secondary-button compact-button" type="button" onClick={onClearHistory}>
                {t("button.clear")}
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function SearchResults({
  controller,
  onQueueAddFeedback,
  t
}: {
  controller: RoomControllerState;
  onQueueAddFeedback(song: QueueAddFeedbackSong): void;
  t: TFunction;
}) {
  const online = controller.songSearch?.online ?? null;
  const onlineCandidates = online?.status === "available" ? online.candidates : [];
  const nextOffset = online?.nextOffset ?? null;
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const loadMoreSongSearch = controller.loadMoreSongSearch;

  // 不用 IntersectionObserver：内容不满一屏时根本没有滚动，观察器只在
  // 交叉状态变化时回调，一次都等不到。改成直接量哨兵位置，滚动和每次
  // 加载完都检查一次，凑满一屏就停下来。
  const checkAndLoadMore = useCallback(() => {
    if (nextOffset == null) {
      return;
    }
    const sentinel = sentinelRef.current;
    if (!sentinel) {
      return;
    }
    // 不留提前量：首屏 40 首本来就该停住，哨兵真正进视口才续拉
    if (sentinel.getBoundingClientRect().top > window.innerHeight) {
      return;
    }
    // 不在这里记「已触发」：首次调用时 loadMoreSongSearch 的闭包可能还是旧的
    // （songSearch 尚未更新），一次就 return 掉，标记写死后再也试不了。
    // 并发由内部 songSearchLoadingMoreRef 兜，重复调用是安全的。
    void loadMoreSongSearch();
  }, [loadMoreSongSearch, nextOffset]);

  useEffect(() => {
    // 延后一帧再量：effect 执行时哨兵可能刚挂载、还没参与布局
    const timer = globalThis.setTimeout(checkAndLoadMore, 0);
    // 搜索浮层自己是滚动容器，scroll 事件不冒泡到 window，必须用捕获
    globalThis.addEventListener("scroll", checkAndLoadMore, { passive: true, capture: true });
    return () => {
      globalThis.clearTimeout(timer);
      globalThis.removeEventListener("scroll", checkAndLoadMore, true);
    };
  }, [checkAndLoadMore, onlineCandidates.length]);

  return (
    <div className="search-overlay-results">
      {onlineCandidates.length > 0 ? (
        <section className="indexed-panel" aria-label={t("search.onlineTitle")}>
          <div className="panel-heading">
            <h3>{t("search.onlineTitle")}</h3>
            <span className="search-status available">{t("search.loadedCount", { count: onlineCandidates.length })}</span>
          </div>
          <div className="song-list recommendation-list">
            {onlineCandidates.map((candidate) => (
              <SearchOnlineSongRow
                candidate={candidate}
                controller={controller}
                key={`${candidate.provider}:${candidate.providerCandidateId}`}
                onQueueAddFeedback={onQueueAddFeedback}
                t={t}
              />
            ))}
          </div>
          {nextOffset != null ? (
            <div aria-hidden="true" className="discovery-sentinel" ref={sentinelRef} />
          ) : null}
          {controller.songSearchLoadingMore ? (
            <p className="empty-state local-empty">{t("search.loadingMore")}</p>
          ) : null}
        </section>
      ) : null}

      {onlineCandidates.length === 0 ? (
        <p className="empty-state local-empty">{t("search.onlineEmpty")}</p>
      ) : null}
    </div>
  );
}

function SearchOnlineSongRow({
  candidate,
  controller,
  onQueueAddFeedback,
  t
}: {
  candidate: OnlineCandidateCard;
  controller: RoomControllerState;
  onQueueAddFeedback(song: QueueAddFeedbackSong): void;
  t: TFunction;
}) {
  const state = controller.onlineQueueState[candidate.providerCandidateId];
  const busy = state?.status === "queuing" || state?.status === "preparing" || state?.status === "queued";
  const label =
    state?.status === "queuing"
      ? t("search.onlineQueuing")
      : state?.status === "preparing"
        ? t("search.onlinePreparing")
        : state?.status === "queued"
          ? t("search.onlineQueued")
          : state?.status === "failed"
            ? t("search.onlineFailed")
            : t("search.onlineQueue");

  return (
    <button
      aria-label={`${label} ${candidate.title}`}
      className={`song-row recommendation-row song-row--clickable${busy ? " song-row--busy" : ""}`}
      disabled={busy}
      type="button"
      onClick={() => {
        if (busy) {
          return;
        }
        const accepted = controller.requestAddOnlineSong(
          candidate.providerCandidateId,
          candidate.title,
          candidate.artistName,
          candidate.nasAssetId,
          candidate.nasQueueState
        );
        if (accepted) {
          onQueueAddFeedback({
            artistName: candidate.artistName,
            title: candidate.title,
            providerId: candidate.providerCandidateId
          });
        }
      }}
    >
      <div className="result-main">
        <strong>
          <ScrollingText text={candidate.title} />
        </strong>
        <p>
          <ScrollingText text={candidate.artistName} />
        </p>
      </div>
      {busy || state?.status === "failed" ? <span className="song-row__badge">{label}</span> : null}
    </button>
  );
}

function DiscoveryBrowseView({
  controller,
  discovery,
  onQueueAddFeedback,
  goBackBrowseView,
  openBrowseView,
  t,
  view
}: {
  controller: RoomControllerState;
  discovery: RoomControllerState["songDiscovery"];
  onQueueAddFeedback(song: QueueAddFeedbackSong): void;
  goBackBrowseView(): void;
  openBrowseView(view: Exclude<BrowseView, { kind: "home" }>): void;
  t: TFunction;
  view: BrowseView;
}) {
  const [detailPages, setDetailPages] = useState<Record<string, DiscoveryDetailState>>({});
  const detailPagesRef = useRef<Record<string, DiscoveryDetailState>>({});
  const [artistList, setArtistList] = useState<ArtistListState>({
    items: [],
    nextOffset: null,
    status: "idle"
  });
  const artistSentinelRef = useRef<HTMLDivElement | null>(null);
  const detailSentinelRef = useRef<HTMLDivElement | null>(null);
  // 观察器每次重建都会立刻回调一次（哨兵已在视口内），不记一下就会
  // 对着同一个 offset 反复发请求，把连接槽占满
  const artistTriggerRef = useRef<string | null>(null);
  const detailTriggerRef = useRef<string | null>(null);

  // 歌手点歌从接口按热门分页取，不再用发现页首屏那 16 个
  useEffect(() => {
    if (view.kind !== "artists") {
      return;
    }
    let cancelled = false;
    setArtistList({ items: [], nextOffset: null, status: "loading" });
    fetchDiscoveryArtists({
      roomSlug: controller.roomSlug,
      offset: 0,
      limit: discoveryArtistsPageSize
    })
      .then((response) => {
        if (cancelled) {
          return;
        }
        setArtistList({ items: response.artists, nextOffset: response.nextOffset, status: "success" });
      })
      .catch(() => {
        if (cancelled) {
          return;
        }
        // 在线取不到时退回发现页自带的歌手，至少还能点
        setArtistList({ items: discovery?.artists ?? [], nextOffset: null, status: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [controller.roomSlug, view.kind]);

  const loadMoreArtists = useCallback(async () => {
    const offset = artistList.nextOffset;
    if (offset == null || (artistList.status !== "success" && artistList.status !== "loadingMore")) {
      return;
    }
    if (artistList.status === "loadingMore") {
      return;
    }

    setArtistList((current) => ({ ...current, status: "loadingMore" }));
    try {
      const response = await fetchDiscoveryArtists({
        roomSlug: controller.roomSlug,
        offset,
        limit: discoveryArtistsPageSize
      });
      setArtistList((current) => ({
        items: [...current.items, ...response.artists],
        nextOffset: response.nextOffset,
        status: "success"
      }));
    } catch {
      setArtistList((current) => ({ ...current, status: "error" }));
    }
  }, [artistList.nextOffset, artistList.status, controller.roomSlug]);

  // 滑到底部自动续拉；jsdom 里没有 IntersectionObserver，靠按钮兜底
  useEffect(() => {
    const sentinel = artistSentinelRef.current;
    if (!sentinel || view.kind !== "artists" || artistList.nextOffset == null) {
      return;
    }
    if (typeof IntersectionObserver === "undefined") {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) {
          return;
        }
        const token = String(artistList.nextOffset);
        if (artistTriggerRef.current === token) {
          return;
        }
        artistTriggerRef.current = token;
        void loadMoreArtists();
      },
      { rootMargin: "160px" }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [artistList.nextOffset, loadMoreArtists, view.kind]);
  const detailKey = discoveryDetailKey(view);
  const loadDetailSongs = useCallback(
    async (detailView: DiscoveryDetailView, offset: number) => {
      const key = discoveryDetailKey(detailView);
      if (!key) {
        return;
      }

      setDetailPages((current) => ({
        ...current,
        [key]: {
          nextOffset: current[key]?.nextOffset ?? null,
          songs: current[key]?.songs ?? [],
          status: "loading"
        }
      }));

      try {
        const response =
          detailView.kind === "artist"
            ? await fetchDiscoveryArtistSongs({
                roomSlug: controller.roomSlug,
                artistId: detailView.item.artistId,
                offset,
                limit: discoveryDetailPageSize
              })
            : await fetchDiscoveryGenreSongs({
                roomSlug: controller.roomSlug,
                genre: detailView.item.genre,
                offset,
                limit: discoveryDetailPageSize
              });

        setDetailPages((current) => {
          const previous = current[key];
          return {
            ...current,
            [key]: {
              nextOffset: response.nextOffset,
              songs: offset === 0 ? response.songs : [...(previous?.songs ?? []), ...response.songs],
              status: "success"
            }
          };
        });
      } catch {
        setDetailPages((current) => ({
          ...current,
          [key]: {
            nextOffset: current[key]?.nextOffset ?? null,
            songs: current[key]?.songs ?? [],
            status: "error"
          }
        }));
      }
    },
    [controller.roomSlug]
  );

  useEffect(() => {
    if (!isDiscoveryDetailView(view) || !detailKey || detailPages[detailKey]) {
      return;
    }

    void loadDetailSongs(view, 0);
  }, [detailKey, detailPages, loadDetailSongs, view]);

  useEffect(() => {
    detailPagesRef.current = detailPages;
  }, [detailPages]);

  // 换页时清空触发记录，重新进同一个歌手/风格还能继续续拉
  useEffect(() => {
    artistTriggerRef.current = null;
    detailTriggerRef.current = null;
  }, [detailKey, view]);

  // 详情页（某歌手/某风格）滑到底部自动续拉，不再需要点按钮
  useEffect(() => {
    const sentinel = detailSentinelRef.current;
    if (!sentinel || !isDiscoveryDetailView(view)) {
      return;
    }
    if (typeof IntersectionObserver === "undefined") {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) {
          return;
        }
        const key = discoveryDetailKey(view);
        const nextOffset = key ? detailPagesRef.current[key]?.nextOffset : null;
        if (nextOffset == null) {
          return;
        }
        const token = `${key}:${nextOffset}`;
        if (detailTriggerRef.current === token) {
          return;
        }
        detailTriggerRef.current = token;
        void loadDetailSongs(view, nextOffset);
      },
      { rootMargin: "240px" }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
    // 哨兵要等第一页回来才渲染，detailPages 变化后必须重新挂观察器
  }, [detailPages, loadDetailSongs, view]);

  if (view.kind === "artists" || view.kind === "genres") {
    const isArtists = view.kind === "artists";
    const items = isArtists ? artistList.items : discovery?.genres ?? [];
    return (
      <section className="panel discovery-panel">
        <div className="panel-heading">
          <h2>{isArtists ? t("discovery.allArtists") : t("discovery.allGenres")}</h2>
          <button className="secondary-button compact-button" type="button" onClick={goBackBrowseView}>
            {t("button.back")}
          </button>
        </div>
        <div className="discovery-grid">
          {items.map((item) => {
            const key = isArtists ? (item as SongDiscoveryArtist).artistId : (item as SongDiscoveryGenre).genre;
            const label = isArtists ? (item as SongDiscoveryArtist).artistName : (item as SongDiscoveryGenre).genre;
            const count = isArtists ? (item as SongDiscoveryArtist).songCount : (item as SongDiscoveryGenre).songCount;
            return (
              <button
                className="discovery-tile"
                key={key}
                type="button"
                onClick={() =>
                  openBrowseView(
                    isArtists ? { kind: "artist", item: item as SongDiscoveryArtist } : { kind: "genre", item: item as SongDiscoveryGenre }
                  )
                }
              >
                <strong>{label}</strong>
                {count > 0 ? <span>{t("discovery.songCount", { count })}</span> : null}
              </button>
            );
          })}
        </div>
        {isArtists && artistList.status === "loading" ? (
          <p className="empty-state local-empty">{t("discovery.detailLoading")}</p>
        ) : null}
        {isArtists && artistList.nextOffset != null ? (
          <>
            <div aria-hidden="true" className="discovery-sentinel" ref={artistSentinelRef} />
            <button
              className="secondary-button compact-button discovery-load-more"
              disabled={artistList.status === "loadingMore"}
              type="button"
              onClick={() => void loadMoreArtists()}
            >
              {artistList.status === "loadingMore" ? t("discovery.detailLoading") : t("button.loadMore")}
            </button>
          </>
        ) : null}
      </section>
    );
  }

  if (view.kind === "home") {
    return null;
  }

  const title = view.kind === "artist" ? view.item.artistName : view.item.genre;
  const detailState = detailKey ? detailPages[detailKey] : undefined;
  const songs = detailState?.songs ?? view.item.songs;
  const loading = detailState?.status === "loading";
  return (
    <section className="panel recommendation-panel detail-panel">
      <div className="panel-heading">
        <h2>{title}</h2>
        <button className="secondary-button compact-button" type="button" onClick={goBackBrowseView}>
          {t("button.back")}
        </button>
      </div>
      <div className="song-list recommendation-list">
        {songs.map((song) => (
          <DiscoverySongRow
            controller={controller}
            key={song.songId}
            onQueueAddFeedback={onQueueAddFeedback}
            song={song}
            t={t}
          />
        ))}
        {loading && songs.length === 0 ? <p className="empty-state local-empty">{t("discovery.detailLoading")}</p> : null}
      </div>
      {detailState?.status === "error" ? <p className="empty-state local-empty">{t("discovery.detailError")}</p> : null}
      {/* 滑到这里就自动续拉，不再放按钮 */}
      {isDiscoveryDetailView(view) && detailState?.nextOffset != null ? (
        <div aria-hidden="true" className="discovery-sentinel" ref={detailSentinelRef} />
      ) : null}
      {loading && songs.length > 0 ? <p className="empty-state local-empty">{t("discovery.detailLoading")}</p> : null}
    </section>
  );
}

/**
 * 名字固定一行，宽度不够时横向滚动。
 * 用实测溢出量驱动动画：列宽足够就一直静止，只有真放不下才滚。
 */
function ScrollingText({ text }: { text: string }) {
  const outerRef = useRef<HTMLSpanElement>(null);
  const innerRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) {
      return;
    }

    const measure = () => {
      const distance = inner.scrollWidth - outer.clientWidth;
      if (distance > 2) {
        outer.style.setProperty("--scroll-distance", `${distance}px`);
        // 按距离算时长：固定 6s 时短名字一闪而过、长名字慢得发飘，
        // 统一成 55px/s 左右更稳
        outer.style.setProperty("--scroll-duration", `${Math.max(2.4, distance / 55).toFixed(2)}s`);
        outer.classList.add("scroll-text--running");
        return;
      }
      outer.style.removeProperty("--scroll-distance");
      outer.style.removeProperty("--scroll-duration");
      outer.classList.remove("scroll-text--running");
    };

    measure();
    if (typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver(measure);
    observer.observe(outer);
    return () => observer.disconnect();
  }, [text]);

  return (
    <span className="scroll-text" ref={outerRef}>
      <span className="scroll-text__inner" ref={innerRef}>
        {text}
      </span>
    </span>
  );
}

function DiscoverySongRow({
  controller,
  onQueueAddFeedback,
  song,
  t
}: {
  controller: RoomControllerState;
  onQueueAddFeedback(song: QueueAddFeedbackSong): void;
  song: SongDiscoverySong;
  t: TFunction;
}) {
  const isOnline = song.source === "online";
  const onlineSongNumber = song.providerSongNumber ?? "";
  const onlineState = onlineSongNumber ? controller.onlineQueueState[onlineSongNumber] : undefined;
  const primaryVersion = song.versions[0] ?? null;
  const nasCanQueue = primaryVersion ? primaryVersion.canQueue !== false : false;
  const onlineBusy =
    onlineState?.status === "queuing" || onlineState?.status === "preparing" || onlineState?.status === "queued";
  const canQueue = isOnline ? Boolean(onlineSongNumber) && !onlineBusy : nasCanQueue;
  const addLabel = isOnline
    ? onlineState?.status === "queuing"
      ? t("search.onlineQueuing")
      : onlineState?.status === "preparing"
        ? t("search.onlinePreparing")
        : onlineState?.status === "queued"
          ? t("search.onlineQueued")
          : onlineState?.status === "failed"
            ? t("search.onlineFailed")
            : t("search.onlineQueue")
    : primaryVersion
      ? canQueue
        ? song.queueState === "queued"
          ? t("button.addAgain")
          : t("button.add")
        : disabledVersionLabel(primaryVersion)
      : "暂不可播放";
  return (
    <button
      aria-label={`${addLabel} ${song.title}`}
      className={`song-row recommendation-row song-row--clickable${onlineBusy ? " song-row--busy" : ""}`}
      disabled={!canQueue}
      type="button"
      onClick={() => {
        if (isOnline) {
          if (!onlineSongNumber || onlineBusy) {
            return;
          }
          if (controller.requestAddOnlineSong(onlineSongNumber, song.title, song.artistName)) {
            onQueueAddFeedback({ artistName: song.artistName, title: song.title, providerId: onlineSongNumber });
          }
          return;
        }

        if (!primaryVersion || !nasCanQueue) {
          return;
        }

        if (controller.requestAddNasAsset(primaryVersion.assetId, song.title, primaryVersion.queueState)) {
          onQueueAddFeedback({ artistName: song.artistName, title: song.title });
        }
      }}
    >
      <div className="result-main">
        <strong>
          <ScrollingText text={song.title} />
        </strong>
        <p>
          <ScrollingText text={song.artistName} />
        </p>
      </div>
      {onlineBusy || (isOnline && onlineState?.status === "failed") ? (
        <span className="song-row__badge">{addLabel}</span>
      ) : null}
    </button>
  );
}

const searchHistoryStorageKey = "home_ktv_search_history_v1";

function readSearchHistory(): string[] {
  try {
    const value = localStorage.getItem(searchHistoryStorageKey);
    const parsed = value ? JSON.parse(value) : [];
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string").slice(0, 10) : [];
  } catch {
    return [];
  }
}

function writeSearchHistory(history: readonly string[]): void {
  try {
    localStorage.setItem(searchHistoryStorageKey, JSON.stringify(history));
  } catch {}
}

function commitSearchHistory(history: readonly string[], query: string): string[] {
  const normalized = query.trim();
  if (!normalized) {
    return [...history];
  }
  return [normalized, ...history.filter((item) => item !== normalized)].slice(0, 10);
}

function formatTime(value: string): string {
  return new Date(value).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

function queueRequesterLabel(
  entry: Pick<NonNullable<RoomControllerState["snapshot"]>["queue"][number], "requestedByName" | "requestedByUserPhone" | "requestedBy">,
  t: TFunction
): string {
  const requester =
    entry.requestedByName?.trim() ||
    entry.requestedByUserPhone?.trim() ||
    entry.requestedBy?.trim() ||
    t("queue.unknownRequester");
  return t("queue.requestedBy", { name: requester });
}

function queueRequesterToneClass(
  entry: Pick<NonNullable<RoomControllerState["snapshot"]>["queue"][number], "requestedByName" | "requestedByUserPhone" | "requestedBy">
): string {
  const key = entry.requestedByUserPhone?.trim() || entry.requestedByName?.trim() || entry.requestedBy?.trim() || "unknown";
  let hash = 0;
  for (const char of key) {
    hash = (hash * 31 + char.charCodeAt(0)) % 6;
  }
  return `queue-requester--tone-${hash + 1}`;
}

function disabledVersionLabel(version: { disabledLabel?: string | null }): string {
  return version.disabledLabel ?? "暂不可播放";
}

