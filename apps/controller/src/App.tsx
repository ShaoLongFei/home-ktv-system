import type {
  ControllerSongHistoryEntry,
  OnlineCandidateCard,
  SongDiscoveryArtist,
  SongDiscoveryGenre,
  SongDiscoverySong,
  SongSearchNasResult
} from "@home-ktv/domain";
import type { RoomInteractionKind } from "@home-ktv/player-contracts";
import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { fetchDiscoveryArtistSongs, fetchDiscoveryGenreSongs } from "./api/client.js";
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
  const noticeMessage = snapshot?.notice?.message;
  const volumePercent = controller.volumePercent;
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchHistory, setSearchHistory] = useState(() => readSearchHistory());
  const [browseStack, setBrowseStack] = useState<BrowseView[]>([]);
  const browseView = browseStack.at(-1) ?? { kind: "home" };
  const [activeTab, setActiveTab] = useState<ControllerTab>("home");
  const [queueDrawerOpen, setQueueDrawerOpen] = useState(false);
  const [interactionComposer, setInteractionComposer] = useState<RoomInteractionKind | null>(null);
  const [queueAddFeedback, setQueueAddFeedback] = useState<QueueAddFeedback | null>(null);
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
  const triggerQueueAddFeedback = useCallback((song: Pick<SongDiscoverySong, "artistName" | "title">) => {
    if (queueFeedbackTimerRef.current) {
      clearTimeout(queueFeedbackTimerRef.current);
    }

    queueFeedbackIdRef.current += 1;
    const feedback = { id: queueFeedbackIdRef.current };
    setQueueAddFeedback(feedback);
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
  }, []);

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
        <AppNotices controller={controller} noticeMessage={noticeMessage} t={t} />
        <AuthGate controller={controller} />
      </main>
    );
  }

  return (
    <main className={`app-shell app-shell--${activeTab}`} aria-label={t("app.aria")}>
      <AppNotices controller={controller} noticeMessage={noticeMessage} t={t} />

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

      {searchOpen ? (
        <SearchOverlay
          controller={controller}
          history={searchHistory}
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
  onQueueAddFeedback(song: Pick<SongDiscoverySong, "artistName" | "title">): void;
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
  onQueueAddFeedback(song: Pick<SongDiscoverySong, "artistName" | "title">): void;
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

function AppNotices({
  controller,
  noticeMessage,
  t
}: {
  controller: RoomControllerState;
  noticeMessage: string | undefined;
  t: TFunction;
}) {
  return (
    <>
      {controller.connectionStatus === "reconnecting" ? (
        <div className="offline-banner">{t("status.reconnecting")}</div>
      ) : null}
      {controller.errorMessage ? <div className="error-banner">{controller.errorMessage}</div> : null}
      {noticeMessage ? <div className="error-banner">{noticeMessage}</div> : null}
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
  onOpenProfile,
  t,
  visibleArtists,
  visibleGenres
}: {
  browseView: BrowseView;
  controller: RoomControllerState;
  discovery: RoomControllerState["songDiscovery"];
  onQueueAddFeedback(song: Pick<SongDiscoverySong, "artistName" | "title">): void;
  goBackBrowseView(): void;
  openBrowseView(view: Exclude<BrowseView, { kind: "home" }>): void;
  setInteractionComposer(kind: RoomInteractionKind): void;
  setSearchOpen(open: boolean): void;
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
  icon: "emoji" | "rainbow" | "roast" | "blessing";
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
      <div className="music-console__track">
        <strong>{current?.currentQueueEntryPreview.songTitle ?? t("current.waiting")}</strong>
        <span className="music-console__subline">
          <span>{current?.currentQueueEntryPreview.artistName ?? t("console.idleHint")}</span>
          <span aria-hidden="true">·</span>
          <span>{t("volume.label")}</span>
          <span>{t("volume.value", { value: volumePercent })}</span>
        </span>
      </div>
      <button
        aria-label={t("volume.increase")}
        className="volume-step volume-step--plus"
        type="button"
        onClick={() => adjustVolume(5)}
      >
        +
      </button>
      <button
        aria-label={t("volume.decrease")}
        className="volume-step volume-step--minus"
        type="button"
        onClick={() => adjustVolume(-5)}
      >
        −
      </button>
      <button className="secondary-button compact-button music-console__replay" disabled={!current} type="button" onClick={() => void controller.replayCurrent()}>
        {t("button.replay")}
      </button>
      <button
        aria-label={switchLabel}
        className="secondary-button compact-button music-console__vocal"
        disabled={!current}
        type="button"
        onClick={() => void controller.switchVocalMode()}
      >
        {current?.vocalMode === "original"
          ? t("button.vocalOriginal")
          : current?.vocalMode === "instrumental"
            ? t("button.vocalInstrumental")
            : t("button.vocalUnknown")}
      </button>
      <button className="secondary-button compact-button music-console__pause" disabled={!current} type="button" onClick={() => void controller.togglePause()}>
        {paused ? t("button.resume") : t("button.pause")}
      </button>
      <button className="danger-button compact-button music-console__skip" disabled={!current} type="button" onClick={controller.requestSkip}>
        {t("button.skip")}
      </button>
      <span aria-hidden="true" className="music-console__spacer" />
      <button className="secondary-button compact-button music-console__playlist" type="button" onClick={onOpenQueue}>
        {t("console.playlist")}
        <span className="music-console__count">{queueCount > 99 ? "99+" : queueCount}</span>
      </button>
    </section>
  );
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

const discoveryDetailPageSize = 60;

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
  t
}: {
  controller: RoomControllerState;
  history: readonly string[];
  onClearHistory(): void;
  onClose(): void;
  onCommitHistory(query: string): void;
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
      <section className="search-overlay" role="dialog" aria-modal="true" aria-labelledby="search-overlay-title">
        <div className="search-overlay__header">
          <h2 id="search-overlay-title">{t("search.title")}</h2>
          <button className="secondary-button compact-button" type="button" onClick={onClose}>
            {t("button.close")}
          </button>
        </div>
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

        {hasQuery ? (
          <SearchResults
            controller={controller}
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
  t
}: {
  controller: RoomControllerState;
  t: TFunction;
}) {
  const nas = controller.songSearch?.nas ?? null;
  const online = controller.songSearch?.online ?? null;
  const onlineCandidates = online?.status === "available" ? online.candidates : [];
  const hasNasResults = (nas?.results.length ?? 0) > 0;

  return (
    <div className="song-list search-overlay-results">
      {nas ? (
        <section className="indexed-panel" aria-label={t("search.indexedTitle")}>
          <div className="panel-heading">
            <h3>{t("search.indexedTitle")}</h3>
            <span className={`search-status ${nas.status}`}>{nas.message}</span>
          </div>

          {nas.results.length > 0 ? (
            <div className="indexed-result-list compact-result-list">
              {nas.results.map((result) => (
                <SearchNasSongRows controller={controller} key={result.songId} result={result} t={t} />
              ))}
            </div>
          ) : (
            <p className="empty-state indexed-empty">{t("search.indexedEmpty")}</p>
          )}
        </section>
      ) : null}

      {onlineCandidates.length > 0 ? (
        <section className="indexed-panel" aria-label={t("search.onlineTitle")}>
          <div className="panel-heading">
            <h3>{t("search.onlineTitle")}</h3>
            <span className="search-status available">{online?.message ?? ""}</span>
          </div>
          <div className="indexed-result-list compact-result-list">
            {onlineCandidates.map((candidate) => (
              <SearchOnlineSongRow
                candidate={candidate}
                controller={controller}
                key={`${candidate.provider}:${candidate.providerCandidateId}`}
                t={t}
              />
            ))}
          </div>
        </section>
      ) : null}

      {!hasNasResults && onlineCandidates.length === 0 ? (
        <p className="empty-state local-empty">{t("search.localEmpty")}</p>
      ) : null}
    </div>
  );
}

function SearchOnlineSongRow({
  candidate,
  controller,
  t
}: {
  candidate: OnlineCandidateCard;
  controller: RoomControllerState;
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
    <article
      className="song-row indexed-version-row compact-version-row"
      aria-label={`${candidate.title} - ${candidate.artistName}`}
    >
      <div className="compact-version-main">
        <strong>{candidate.title}</strong>
        <div className="compact-version-meta">
          <span>{candidate.artistName}</span>
          <span>{candidate.sourceLabel}</span>
          {state?.status === "failed" && state.message ? <span>{state.message}</span> : null}
        </div>
      </div>
      <button
        className="primary-button compact-queue-button"
        type="button"
        disabled={busy}
        onClick={() =>
          controller.requestAddOnlineSong(candidate.providerCandidateId, candidate.title, candidate.artistName)
        }
      >
        {label}
      </button>
    </article>
  );
}

function SearchNasSongRows({
  controller,
  result,
  t
}: {
  controller: RoomControllerState;
  result: SongSearchNasResult;
  t: TFunction;
}) {
  return (
    <>
      {result.versions.map((version) => {
        const isPending = controller.pendingNasAssetId === version.assetId;
        const buttonLabel = indexedVersionButtonLabel(version, isPending, t);
        const canClick = version.canQueue && !isPending;

        return (
          <article className="song-row indexed-version-row compact-version-row" aria-label={version.displayName} key={version.assetId}>
            <div className="compact-version-main">
              <strong>{version.displayName}</strong>
              <div className="compact-version-meta">
                <span>{version.extension}</span>
                <span>{version.sizeBytes == null ? t("search.unknownSize") : formatFileSize(version.sizeBytes)}</span>
                {version.audioTrackCount === 1 ? (
                  <span className="single-track-badge">{t("search.singleAudioTrackSource")}</span>
                ) : null}
              </div>
            </div>
            <button
              className="primary-button compact-queue-button"
              type="button"
              disabled={!canClick}
              onClick={() => (canClick ? controller.requestAddNasAsset(version.assetId, result.title, version.queueState) : undefined)}
            >
              {buttonLabel}
            </button>
          </article>
        );
      })}
    </>
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
  onQueueAddFeedback(song: Pick<SongDiscoverySong, "artistName" | "title">): void;
  goBackBrowseView(): void;
  openBrowseView(view: Exclude<BrowseView, { kind: "home" }>): void;
  t: TFunction;
  view: BrowseView;
}) {
  const [detailPages, setDetailPages] = useState<Record<string, DiscoveryDetailState>>({});
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

  if (view.kind === "artists" || view.kind === "genres") {
    const isArtists = view.kind === "artists";
    const items = isArtists ? discovery?.artists ?? [] : discovery?.genres ?? [];
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
    <section className="panel recommendation-panel">
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
        {detailState?.status === "error" ? <p className="empty-state local-empty">{t("discovery.detailError")}</p> : null}
        {isDiscoveryDetailView(view) && detailState?.nextOffset != null ? (
          <button
            className="secondary-button compact-button discovery-load-more"
            disabled={loading}
            type="button"
            onClick={() => void loadDetailSongs(view, detailState.nextOffset ?? 0)}
          >
            {loading ? t("discovery.detailLoading") : t("button.loadMore")}
          </button>
        ) : null}
      </div>
    </section>
  );
}

function DiscoverySongRow({
  controller,
  onQueueAddFeedback,
  song,
  t
}: {
  controller: RoomControllerState;
  onQueueAddFeedback(song: Pick<SongDiscoverySong, "artistName" | "title">): void;
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
  const [coverUrl, setCoverUrl] = useState(song.coverThumbnailUrl ?? song.coverImageUrl ?? "");
  const showCover = Boolean(coverUrl);

  useEffect(() => {
    setCoverUrl(song.coverThumbnailUrl ?? song.coverImageUrl ?? "");
  }, [song.coverImageUrl, song.coverThumbnailUrl]);

  return (
    <article className="song-row recommendation-row">
      <div className={`song-art ${showCover ? "song-art--image" : "song-art--fallback"}`} aria-hidden="true">
        {showCover ? (
          <img
            alt=""
            decoding="async"
            draggable={false}
            height={40}
            loading="lazy"
            referrerPolicy="no-referrer"
            src={coverUrl}
            width={40}
            onError={() => {
              if (coverUrl === song.coverThumbnailUrl && song.coverImageUrl && song.coverImageUrl !== song.coverThumbnailUrl) {
                setCoverUrl(song.coverImageUrl);
                return;
              }
              setCoverUrl("");
            }}
          />
        ) : (
          <span>{song.title.trim().slice(0, 1) || "K"}</span>
        )}
      </div>
      <div className="result-main">
        <strong>{song.title}</strong>
        <p>{song.artistName}</p>
      </div>
      <button
        className="primary-button add-circle-button"
        aria-label={`${addLabel} ${song.title}`}
        disabled={!canQueue && !isOnline}
        type="button"
        onClick={() => {
          if (isOnline) {
            if (!onlineSongNumber || onlineBusy) {
              return;
            }
            if (controller.requestAddOnlineSong(onlineSongNumber, song.title, song.artistName)) {
              onQueueAddFeedback(song);
            }
            return;
          }

          if (!primaryVersion || !nasCanQueue) {
            return;
          }

          if (controller.requestAddNasAsset(primaryVersion.assetId, song.title, primaryVersion.queueState)) {
            onQueueAddFeedback(song);
          }
        }}
      >
        {canQueue || isOnline ? "+" : "·"}
      </button>
    </article>
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

function formatFileSize(sizeBytes: number | null): string {
  if (sizeBytes == null) {
    return "未知大小";
  }

  const units = ["B", "KB", "MB", "GB"] as const;
  let value = Math.max(0, sizeBytes);
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const fractionDigits = value >= 10 || unitIndex === 0 ? 0 : 1;
  return `${value.toFixed(fractionDigits)} ${units[unitIndex]}`;
}

function disabledVersionLabel(version: { disabledLabel?: string | null }): string {
  return version.disabledLabel ?? "暂不可播放";
}

function indexedVersionButtonLabel(
  version: { queueState: string; canQueue: boolean; disabledLabel?: string | null },
  isPending: boolean,
  t: ReturnType<typeof useI18n>["t"]
): string {
  if (isPending) {
    return t("button.addingIndexed");
  }
  if (version.queueState === "queued") {
    return t("search.indexedQueued");
  }
  if (version.canQueue) {
    return t("button.addIndexed");
  }
  if (version.queueState === "source_missing") {
    return version.disabledLabel ?? t("search.indexedStale");
  }
  if (version.queueState === "file_unreadable") {
    return version.disabledLabel ?? t("search.indexedUnreadable");
  }
  return version.disabledLabel ?? t("search.indexedStale");
}
