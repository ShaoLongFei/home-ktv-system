import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type AppLanguage = "en" | "zh";

const languageStorageKey = "home_ktv_language_v2";

const dictionaries: Record<AppLanguage, Record<string, string>> = {
  en: {
    "app.aria": "Home KTV controller",
    "language.aria": "Display language",
    "language.en": "English",
    "language.zh": "中文",
    "header.title": "KTV controller",
    "status.tvOnline": "TV online",
    "status.tvOffline": "TV offline",
    "status.reconnecting": "Connection interrupted. Reconnecting",
    "current.aria": "Current playback",
    "current.eyebrow": "Now playing",
    "current.waiting": "Waiting for song",
    "current.emptyQueue": "Queue is empty",
    "current.connecting": "Connecting...",
    "current.currentMode": "Current mode",
    "current.modeAria": "current-vocal-mode",
    "queue.aria": "Queue",
    "queue.title": "Queue",
    "queue.empty": "No queued songs",
    "queue.undoUntil": "Undo until {time}",
    "search.aria": "Song search",
    "search.title": "Search songs",
    "search.loading": "Searching",
    "search.inputAria": "Search keyword",
    "search.placeholder": "Title / artist / pinyin / initials",
    "search.submit": "Search",
    "search.localPlayable": "Local",
    "search.queued": "Queued",
    "search.versionCount": "{count} versions",
    "search.recommended": "Recommended",
    "search.localEmpty": "No local result",
    "online.aria": "Online supplement",
    "online.title": "Online supplement",
    "online.emptyTitle": "No online supplement candidates",
    "online.emptyBody": "There are no online candidates to request right now. Try a different keyword or search again later.",
    "button.switchToOriginal": "Switch to vocal",
    "button.switchToInstrumental": "Switch to instrumental",
    "button.skip": "Skip",
    "button.promote": "Move up",
    "button.delete": "Delete",
    "button.undo": "Undo",
    "button.add": "Add",
    "button.addAgain": "Add again",
    "button.addVersion": "Add this version",
    "button.requestSupplement": "Request supplement",
    "button.submitting": "Submitting",
    "button.ready": "Ready",
    "button.cancel": "Cancel",
    "button.confirm": "Confirm",
    "button.confirmAddAgain": "Confirm add",
    "dialog.skipTitle": "Confirm skip",
    "dialog.skipBody": "{title} will stop playing.",
    "dialog.duplicateTitle": "Duplicate song",
    "dialog.duplicateBody": "{title} is already in the queue. Add it again?",
    "vocal.original": "Vocal",
    "vocal.instrumental": "Instrumental",
    "vocal.dual": "Dual",
    "vocal.unknown": "Unknown",
    "playbackState.idle": "Idle",
    "playbackState.preparing": "Preparing",
    "playbackState.loading": "Loading",
    "playbackState.playing": "Playing",
    "playbackState.paused": "Paused",
    "playbackState.recovering": "Recovering",
    "playbackState.error": "Error",
    "playbackState.conflict": "Conflict",
    "playbackState.unknown": "Unknown",
    "onlineTask.discovered": "Discovered",
    "onlineTask.selected": "Selected",
    "onlineTask.review_required": "Review required",
    "onlineTask.fetching": "Fetching",
    "onlineTask.fetched": "Fetched",
    "onlineTask.ready": "Ready",
    "onlineTask.failed": "Failed",
    "onlineTask.stale": "Stale",
    "onlineTask.promoted": "Promoted",
    "onlineTask.purged": "Purged",
    "candidateType.mv": "MV",
    "candidateType.karaoke": "KTV",
    "candidateType.audio": "Audio",
    "candidateType.unknown": "Unknown",
    "reliability.high": "High reliability",
    "reliability.medium": "Medium reliability",
    "reliability.low": "Low reliability",
    "reliability.unknown": "Unknown reliability",
    "risk.normal": "Normal risk",
    "risk.review": "Needs review",
    "risk.high": "High risk",
    "risk.unknown": "Unknown risk"
  },
  zh: {
    "app.aria": "Home KTV 点歌控制台",
    "language.aria": "界面语言",
    "language.en": "English",
    "language.zh": "中文",
    "header.title": "点歌控制台",
    "status.tvOnline": "电视在线",
    "status.tvOffline": "电视离线",
    "status.reconnecting": "连接中断，正在重连",
    "current.aria": "当前播放",
    "current.eyebrow": "正在播放",
    "current.waiting": "等待点歌",
    "current.emptyQueue": "队列为空",
    "current.connecting": "连接中",
    "current.currentMode": "当前模式",
    "current.modeAria": "current-vocal-mode",
    "queue.aria": "播放队列",
    "queue.title": "播放队列",
    "queue.empty": "暂无排队歌曲",
    "queue.undoUntil": "可撤销至 {time}",
    "search.aria": "搜索歌曲",
    "search.title": "搜索歌曲",
    "search.loading": "搜索中",
    "search.inputAria": "搜索关键词",
    "search.placeholder": "歌名 / 歌手 / 拼音 / 首字母",
    "search.submit": "搜索",
    "search.localPlayable": "本地可播",
    "search.queued": "已点 / 队列中",
    "search.versionCount": "{count} 个版本",
    "search.recommended": "推荐",
    "search.localEmpty": "本地未找到",
    "online.aria": "在线补歌",
    "online.title": "在线补歌",
    "online.emptyTitle": "暂未找到在线补歌候选",
    "online.emptyBody": "当前没有可请求的在线候选，可以换关键词或稍后重试。",
    "button.switchToOriginal": "切到原唱",
    "button.switchToInstrumental": "切到伴唱",
    "button.skip": "切歌",
    "button.promote": "顶歌",
    "button.delete": "删除",
    "button.undo": "撤销",
    "button.add": "点歌",
    "button.addAgain": "加点",
    "button.addVersion": "点这个版本",
    "button.requestSupplement": "请求补歌",
    "button.submitting": "提交中",
    "button.ready": "已准备",
    "button.cancel": "取消",
    "button.confirm": "确认",
    "button.confirmAddAgain": "确认加点",
    "dialog.skipTitle": "确认切歌",
    "dialog.skipBody": "{title} 将结束播放。",
    "dialog.duplicateTitle": "重复点歌",
    "dialog.duplicateBody": "{title} 已在队列中，仍要再点一次吗？",
    "vocal.original": "原唱",
    "vocal.instrumental": "伴唱",
    "vocal.dual": "双轨",
    "vocal.unknown": "未知",
    "playbackState.idle": "待点歌",
    "playbackState.preparing": "准备中",
    "playbackState.loading": "加载中",
    "playbackState.playing": "播放中",
    "playbackState.paused": "已暂停",
    "playbackState.recovering": "恢复中",
    "playbackState.error": "播放异常",
    "playbackState.conflict": "设备冲突",
    "playbackState.unknown": "未知",
    "onlineTask.discovered": "已发现",
    "onlineTask.selected": "已选择",
    "onlineTask.review_required": "需复核",
    "onlineTask.fetching": "获取中",
    "onlineTask.fetched": "已获取",
    "onlineTask.ready": "已准备",
    "onlineTask.failed": "失败",
    "onlineTask.stale": "过期",
    "onlineTask.promoted": "已入库",
    "onlineTask.purged": "已清理",
    "candidateType.mv": "MV",
    "candidateType.karaoke": "KTV",
    "candidateType.audio": "音频",
    "candidateType.unknown": "未知类型",
    "reliability.high": "高可靠",
    "reliability.medium": "中等可靠",
    "reliability.low": "低可靠",
    "reliability.unknown": "可靠度未知",
    "risk.normal": "普通风险",
    "risk.review": "需复核",
    "risk.high": "高风险",
    "risk.unknown": "风险未知"
  }
};

interface I18nContextValue {
  language: AppLanguage;
  setLanguage(language: AppLanguage): void;
  t(key: string, replacements?: Record<string, string | number>): string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({
  children,
  defaultLanguage = "zh"
}: {
  children: ReactNode;
  defaultLanguage?: AppLanguage;
}) {
  const [language, setLanguageState] = useState<AppLanguage>(() => readStoredLanguage(defaultLanguage));

  useEffect(() => {
    document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
  }, [language]);

  const value = useMemo<I18nContextValue>(
    () => ({
      language,
      setLanguage(nextLanguage) {
        setLanguageState(nextLanguage);
        writeStoredLanguage(nextLanguage);
      },
      t(key, replacements) {
        const template = dictionaries[language][key] ?? dictionaries.zh[key] ?? key;
        return applyReplacements(template, replacements);
      }
    }),
    [language]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const value = useContext(I18nContext);
  if (!value) {
    throw new Error("useI18n must be used inside I18nProvider");
  }
  return value;
}

export function LanguageSwitch() {
  const { language, setLanguage, t } = useI18n();
  return (
    <div className="language-switch" aria-label={t("language.aria")} role="group">
      <button
        aria-pressed={language === "zh"}
        className={language === "zh" ? "language-option active" : "language-option"}
        type="button"
        onClick={() => setLanguage("zh")}
      >
        {t("language.zh")}
      </button>
      <button
        aria-pressed={language === "en"}
        className={language === "en" ? "language-option active" : "language-option"}
        type="button"
        onClick={() => setLanguage("en")}
      >
        {t("language.en")}
      </button>
    </div>
  );
}

export function vocalModeName(mode: string, t: I18nContextValue["t"]): string {
  return localizedEnum("vocal", mode, "unknown", t);
}

export function playbackStateName(state: string | null | undefined, t: I18nContextValue["t"]): string {
  return localizedEnum("playbackState", state, "unknown", t);
}

export function onlineTaskStateName(state: string | null | undefined, t: I18nContextValue["t"]): string {
  return localizedEnum("onlineTask", state, "discovered", t);
}

export function candidateTypeName(type: string | null | undefined, t: I18nContextValue["t"]): string {
  return localizedEnum("candidateType", type, "unknown", t);
}

export function reliabilityName(value: string | null | undefined, t: I18nContextValue["t"]): string {
  return localizedEnum("reliability", value, "unknown", t);
}

export function riskName(value: string | null | undefined, t: I18nContextValue["t"]): string {
  return localizedEnum("risk", value, "unknown", t);
}

function readStoredLanguage(defaultLanguage: AppLanguage): AppLanguage {
  try {
    const value = localStorage.getItem(languageStorageKey);
    return value === "en" || value === "zh" ? value : defaultLanguage;
  } catch {
    return defaultLanguage;
  }
}

function writeStoredLanguage(language: AppLanguage): void {
  try {
    localStorage.setItem(languageStorageKey, language);
  } catch {}
}

function applyReplacements(template: string, replacements: Record<string, string | number> | undefined): string {
  if (!replacements) {
    return template;
  }
  return Object.entries(replacements).reduce(
    (text, [key, value]) => text.replaceAll(`{${key}}`, String(value)),
    template
  );
}

function localizedEnum(
  prefix: string,
  value: string | null | undefined,
  fallback: string,
  t: I18nContextValue["t"]
): string {
  const keyValue = typeof value === "string" && value.length > 0 ? value : fallback;
  const key = `${prefix}.${keyValue}`;
  const text = t(key);
  return text === key ? t(`${prefix}.${fallback}`) : text;
}
