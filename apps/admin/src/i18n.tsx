import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type AppLanguage = "en" | "zh";

const languageStorageKey = "home_ktv_language_v2";

const dictionaries: Record<AppLanguage, Record<string, string>> = {
  en: {
    "app.nav.aria": "Admin sections",
    "app.nav.imports": "Imports",
    "app.nav.songs": "Songs",
    "app.nav.rooms": "Rooms",
    "language.aria": "Display language",
    "language.en": "English",
    "language.zh": "中文",
    "common.cancel": "Cancel",
    "common.unknown": "unknown",
    "common.none": "none",
    "common.loading": "Loading...",
    "common.refreshing": "Refreshing...",
    "common.noPayload": "no payload",
    "status.pending": "Pending",
    "status.held": "Held",
    "status.review_required": "Review required",
    "status.conflict": "Conflict",
    "status.ready": "Ready",
    "status.unavailable": "Unavailable",
    "status.failed": "Failed",
    "status.caching": "Caching",
    "status.stale": "Stale",
    "status.selected": "Selected",
    "status.promoted": "Promoted",
    "status.purged": "Purged",
    "status.total": "total",
    "roomState.active": "Active",
    "roomState.inactive": "Inactive",
    "roomState.maintenance": "Maintenance",
    "roomState.unknown": "Unknown",
    "playbackState.idle": "Idle",
    "playbackState.preparing": "Preparing",
    "playbackState.loading": "Loading",
    "playbackState.playing": "Playing",
    "playbackState.paused": "Paused",
    "playbackState.recovering": "Recovering",
    "playbackState.error": "Error",
    "playbackState.conflict": "Conflict",
    "playbackState.unknown": "Unknown",
    "event.player.failed": "Playback failed",
    "event.player.ended": "Playback ended",
    "event.player.loading": "Playback loading",
    "event.player.playing": "Playback started",
    "event.controller.add_queue_entry": "Song queued",
    "event.controller.delete_queue_entry": "Song removed",
    "event.controller.promote_queue_entry": "Song moved up",
    "event.controller.skip_current": "Song skipped",
    "event.system.notice": "System notice",
    "event.unknown": "Unknown event",
    "task.discovered": "Discovered",
    "task.selected": "Selected",
    "task.review_required": "Review required",
    "task.fetching": "Fetching",
    "task.fetched": "Fetched",
    "task.ready": "Ready",
    "task.failed": "Failed",
    "task.stale": "Stale",
    "task.promoted": "Promoted",
    "task.purged": "Purged",
    "task.total": "total",
    "languageName.all": "All languages",
    "languageName.mandarin": "Mandarin",
    "languageName.cantonese": "Cantonese",
    "languageName.other": "Other",
    "vocal.original": "Original",
    "vocal.instrumental": "Instrumental",
    "vocal.dual": "Dual",
    "vocal.unknown": "Unknown",
    "imports.title": "Import review workbench",
    "imports.description": "Review grouped local media candidates before they enter the formal catalog.",
    "imports.scan": "Scan imports",
    "imports.workbenchAria": "Import candidate workbench",
    "imports.queueAria": "Candidate queue",
    "imports.queueTitle": "Candidate queue",
    "imports.statusFiltersAria": "Candidate status filters",
    "imports.groupAria": "{status} candidates",
    "imports.loadingCandidates": "Loading candidates",
    "imports.noCandidates": "No candidates",
    "imports.files": "files",
    "imports.noProbe": "no probe",
    "imports.detailAria": "Candidate detail",
    "candidate.editorAria": "Candidate editor",
    "candidate.emptyTitle": "Select a candidate",
    "candidate.emptyBody": "Metadata and file review controls will appear here.",
    "candidate.hold": "Hold",
    "candidate.approve": "Approve",
    "candidate.rejectDelete": "Reject delete",
    "candidate.holdNote": "Hold keeps files in imports/needs-review for later review.",
    "candidate.title": "Title",
    "candidate.artist": "Artist",
    "candidate.language": "Language",
    "candidate.defaultVocalMode": "Default vocal mode",
    "candidate.genre": "Genre",
    "candidate.tags": "Tags",
    "candidate.year": "Year",
    "candidate.aliases": "Aliases",
    "candidate.searchHints": "Search hints",
    "candidate.sameVersion": "Same version proof confirmed",
    "candidate.fileRoleAria": "File role editing",
    "candidate.useFile": "Use {file}",
    "candidate.vocalRole": "Vocal role for {file}",
    "candidate.saveMetadata": "Save metadata",
    "candidate.fileDetails": "File details",
    "candidate.fileDetailsAria": "Candidate file details",
    "candidate.file": "File",
    "candidate.role": "Role",
    "candidate.root": "Root",
    "candidate.probe": "Probe",
    "candidate.duration": "Duration",
    "candidate.conflictAria": "Conflict resolution",
    "candidate.conflictTitle": "Conflict resolution",
    "candidate.conflictType": "Conflict type",
    "candidate.targetDirectory": "Target directory",
    "candidate.matchedSongId": "Matched song id",
    "candidate.targetSongId": "Target song id",
    "candidate.mergeExisting": "Merge existing",
    "candidate.versionSuffix": "Version suffix",
    "candidate.createVersion": "Create version",
    "candidate.confirmApproveTitle": "Confirm approve",
    "candidate.confirmApproveMessage": "Approve this candidate into the formal library after the backend admission checks pass.",
    "candidate.confirmRejectTitle": "Confirm reject delete",
    "candidate.confirmRejectMessage": "Rejecting this candidate deletes its import files. This cannot be undone.",
    "candidate.realMvPreviewAria": "Real MV scanner preview",
    "candidate.realMvCoverAlt": "MV cover",
    "candidate.noCover": "No cover",
    "candidate.mediaInfo": "Media info",
    "candidate.mediaContainer": "Container",
    "candidate.videoCodec": "Video codec",
    "candidate.resolution": "Resolution",
    "candidate.audioTracks": "Audio tracks",
    "candidate.audioTrackCount": "{count} audio tracks",
    "candidate.rawAudioTracks": "Raw audio tracks",
    "candidate.trackCodec": "Codec",
    "candidate.trackLanguage": "Language",
    "candidate.trackChannels": "Channels",
    "candidate.originalTrackRole": "Original vocal track",
    "candidate.instrumentalTrackRole": "Accompaniment track",
    "candidate.metadataConflicts": "Metadata conflicts",
    "candidate.compatibilityGuidance": "Compatibility guidance",
    "candidate.retryScanGuidance": "Fix sidecars or preprocess media, then scan imports again.",
    "candidate.unsupportedGuidance": "Unsupported in v1.2; preprocess outside the system before approval.",
    "candidate.reviewRequiredGuidance": "Can enter the catalog as review_required after title and artist are complete.",
    "candidate.playableGuidance": "Scanner marked this candidate playable; approval can create ready catalog status.",
    "candidate.titleArtistRequired": "Title and artist are required to approve.",
    "candidate.provenance": "Source",
    "candidate.needsReview": "Needs review",
    "songs.title": "Song catalog",
    "songs.description": "Maintain formal songs, default resources, and switch eligibility.",
    "songs.catalogAria": "Formal song catalog",
    "songs.listAria": "Song list",
    "songs.formalSongs": "Formal songs",
    "songs.status": "Song status",
    "songs.allStatuses": "All statuses",
    "songs.loading": "Loading songs",
    "songs.assets": "assets",
    "songs.detailAria": "Song resource detail",
    "songs.emptyTitle": "Select a song",
    "songs.emptyBody": "Formal song and resource maintenance controls will appear here.",
    "songs.defaultAsset": "Default asset",
    "songs.revalidate": "Revalidate song",
    "songs.validateJson": "Validate song.json",
    "songs.catalogStatus": "Catalog status",
    "songs.saveMetadata": "Save song metadata",
    "songs.defaultAssetAria": "Default asset editor",
    "songs.setDefaultAsset": "Set default asset",
    "songs.revalidationAria": "Revalidation result",
    "songs.revalidation": "Revalidation",
    "songs.validationAria": "song.json validation result",
    "songs.validation": "song.json validation",
    "asset.editorAria": "Asset pair editor",
    "asset.assets": "Assets",
    "asset.vocal": "Vocal",
    "asset.lyric": "Lyric",
    "asset.switchFamily": "Switch family",
    "asset.switchQuality": "Switch quality",
    "asset.summaryAria": "Asset summaries",
    "asset.statusFor": "Status for {asset}",
    "asset.vocalFor": "Vocal mode for {asset}",
    "asset.lyricFor": "Lyric mode for {asset}",
    "asset.switchFamilyFor": "Switch family for {asset}",
    "asset.update": "Update {asset}",
    "asset.confirmTitle": "Confirm catalog change",
    "asset.confirmMessage": "This resource change can alter readiness or vocal switching eligibility and will be revalidated.",
    "asset.confirmApply": "Apply change",
    "rooms.title": "Room status",
    "rooms.description": "Inspect the live control session state and refresh the pairing token.",
    "rooms.refreshState": "Refresh room state",
    "rooms.refreshToken": "Refresh pairing token",
    "rooms.loadFailed": "Failed to load room status",
    "rooms.refreshStateFailed": "Failed to refresh room state",
    "rooms.refreshTokenFailed": "Failed to refresh pairing token",
    "rooms.taskActionFailed": "Failed to {action} task",
    "rooms.retryTaskAria": "Retry task {taskId}",
    "rooms.cleanTaskAria": "Clean task {taskId}",
    "rooms.promoteTaskAria": "Promote task {taskId}",
    "rooms.gridAria": "Room status",
    "rooms.state": "Room state",
    "rooms.tokenExpires": "Token expires",
    "rooms.onlineControllers": "Online controllers",
    "rooms.tvStatus": "TV status",
    "rooms.tvOnline": "Online",
    "rooms.tvOffline": "Offline",
    "rooms.sessionVersion": "Session version",
    "rooms.currentSong": "Current song",
    "rooms.noCurrentSong": "No current song",
    "rooms.queueSummary": "Queue summary",
    "rooms.onlineTasks": "Online tasks",
    "rooms.taskCounts": "Task counts",
    "rooms.event": "event",
    "rooms.retry": "Retry",
    "rooms.clean": "Clean",
    "rooms.promote": "Promote",
    "rooms.recentEvents": "Recent events",
    "rooms.roomFallback": "room"
  },
  zh: {
    "app.nav.aria": "后台分区",
    "app.nav.imports": "导入",
    "app.nav.songs": "歌曲",
    "app.nav.rooms": "房间",
    "language.aria": "界面语言",
    "language.en": "English",
    "language.zh": "中文",
    "common.cancel": "取消",
    "common.unknown": "未知",
    "common.none": "无",
    "common.loading": "加载中...",
    "common.refreshing": "刷新中...",
    "common.noPayload": "无详情",
    "status.pending": "待处理",
    "status.held": "已暂存",
    "status.review_required": "需复核",
    "status.conflict": "冲突",
    "status.ready": "已准备",
    "status.unavailable": "不可用",
    "status.failed": "失败",
    "status.caching": "缓存中",
    "status.stale": "过期",
    "status.selected": "已选择",
    "status.promoted": "已入库",
    "status.purged": "已清理",
    "status.total": "总计",
    "roomState.active": "启用中",
    "roomState.inactive": "未启用",
    "roomState.maintenance": "维护中",
    "roomState.unknown": "未知",
    "playbackState.idle": "待点歌",
    "playbackState.preparing": "准备中",
    "playbackState.loading": "加载中",
    "playbackState.playing": "播放中",
    "playbackState.paused": "已暂停",
    "playbackState.recovering": "恢复中",
    "playbackState.error": "播放异常",
    "playbackState.conflict": "设备冲突",
    "playbackState.unknown": "未知",
    "event.player.failed": "播放失败",
    "event.player.ended": "播放结束",
    "event.player.loading": "开始加载",
    "event.player.playing": "开始播放",
    "event.controller.add_queue_entry": "点歌",
    "event.controller.delete_queue_entry": "删除歌曲",
    "event.controller.promote_queue_entry": "顶歌",
    "event.controller.skip_current": "切歌",
    "event.system.notice": "系统通知",
    "event.unknown": "未知事件",
    "task.discovered": "已发现",
    "task.selected": "已选择",
    "task.review_required": "需复核",
    "task.fetching": "获取中",
    "task.fetched": "已获取",
    "task.ready": "已准备",
    "task.failed": "失败",
    "task.stale": "过期",
    "task.promoted": "已入库",
    "task.purged": "已清理",
    "task.total": "总计",
    "languageName.all": "全部语言",
    "languageName.mandarin": "国语",
    "languageName.cantonese": "粤语",
    "languageName.other": "其它",
    "vocal.original": "原唱",
    "vocal.instrumental": "伴唱",
    "vocal.dual": "双轨",
    "vocal.unknown": "未知",
    "imports.title": "导入审核工作台",
    "imports.description": "在本地媒体进入正式歌库前，集中审核候选文件。",
    "imports.scan": "扫描导入目录",
    "imports.workbenchAria": "导入候选工作台",
    "imports.queueAria": "候选队列",
    "imports.queueTitle": "候选队列",
    "imports.statusFiltersAria": "候选状态筛选",
    "imports.groupAria": "{status}候选",
    "imports.loadingCandidates": "正在加载候选",
    "imports.noCandidates": "暂无候选",
    "imports.files": "个文件",
    "imports.noProbe": "未探测",
    "imports.detailAria": "候选详情",
    "candidate.editorAria": "候选编辑器",
    "candidate.emptyTitle": "选择一个候选",
    "candidate.emptyBody": "这里会显示元数据和文件审核控制项。",
    "candidate.hold": "暂存",
    "candidate.approve": "批准入库",
    "candidate.rejectDelete": "拒绝并删除",
    "candidate.holdNote": "暂存会把文件留在 imports/needs-review，之后再处理。",
    "candidate.title": "歌名",
    "candidate.artist": "歌手",
    "candidate.language": "语言",
    "candidate.defaultVocalMode": "默认声轨",
    "candidate.genre": "流派",
    "candidate.tags": "标签",
    "candidate.year": "年份",
    "candidate.aliases": "别名",
    "candidate.searchHints": "搜索提示",
    "candidate.sameVersion": "已确认同版本证据",
    "candidate.fileRoleAria": "文件角色编辑",
    "candidate.useFile": "使用 {file}",
    "candidate.vocalRole": "{file} 的声轨角色",
    "candidate.saveMetadata": "保存元数据",
    "candidate.fileDetails": "文件详情",
    "candidate.fileDetailsAria": "候选文件详情",
    "candidate.file": "文件",
    "candidate.role": "角色",
    "candidate.root": "根目录",
    "candidate.probe": "探测",
    "candidate.duration": "时长",
    "candidate.conflictAria": "冲突处理",
    "candidate.conflictTitle": "冲突处理",
    "candidate.conflictType": "冲突类型",
    "candidate.targetDirectory": "目标目录",
    "candidate.matchedSongId": "匹配歌曲 ID",
    "candidate.targetSongId": "目标歌曲 ID",
    "candidate.mergeExisting": "合并到现有歌曲",
    "candidate.versionSuffix": "版本后缀",
    "candidate.createVersion": "创建新版本",
    "candidate.confirmApproveTitle": "确认批准入库",
    "candidate.confirmApproveMessage": "后端入库检查通过后，此候选会进入正式歌库。",
    "candidate.confirmRejectTitle": "确认拒绝并删除",
    "candidate.confirmRejectMessage": "拒绝该候选会删除导入文件，此操作不可撤销。",
    "candidate.realMvPreviewAria": "真实 MV 扫描预览",
    "candidate.realMvCoverAlt": "MV 封面",
    "candidate.noCover": "暂无封面",
    "candidate.mediaInfo": "媒体信息",
    "candidate.mediaContainer": "容器",
    "candidate.videoCodec": "视频编码",
    "candidate.resolution": "分辨率",
    "candidate.audioTracks": "音轨",
    "candidate.audioTrackCount": "{count} 条音轨",
    "candidate.rawAudioTracks": "原始音轨",
    "candidate.trackCodec": "编码",
    "candidate.trackLanguage": "语言",
    "candidate.trackChannels": "声道",
    "candidate.originalTrackRole": "原唱声轨",
    "candidate.instrumentalTrackRole": "伴唱声轨",
    "candidate.metadataConflicts": "元数据冲突",
    "candidate.compatibilityGuidance": "兼容性建议",
    "candidate.retryScanGuidance": "修复 song.json/封面或预处理媒体后，点击扫描导入目录重试。",
    "candidate.unsupportedGuidance": "v1.2 不自动转码，请先在系统外预处理后再入库。",
    "candidate.reviewRequiredGuidance": "歌名和歌手完整后可入库为需复核。",
    "candidate.playableGuidance": "扫描器判断可播放，批准后可进入已准备状态。",
    "candidate.titleArtistRequired": "批准入库前必须填写歌名和歌手。",
    "candidate.provenance": "来源",
    "candidate.needsReview": "需要确认",
    "songs.title": "歌曲目录",
    "songs.description": "维护正式歌曲、默认资源和原伴唱切换资格。",
    "songs.catalogAria": "正式歌曲目录",
    "songs.listAria": "歌曲列表",
    "songs.formalSongs": "正式歌曲",
    "songs.status": "歌曲状态",
    "songs.allStatuses": "全部状态",
    "songs.loading": "正在加载歌曲",
    "songs.assets": "个资源",
    "songs.detailAria": "歌曲资源详情",
    "songs.emptyTitle": "选择一首歌曲",
    "songs.emptyBody": "这里会显示正式歌曲和资源维护控制项。",
    "songs.defaultAsset": "默认资源",
    "songs.revalidate": "重新校验歌曲",
    "songs.validateJson": "校验 song.json",
    "songs.catalogStatus": "目录状态",
    "songs.saveMetadata": "保存歌曲元数据",
    "songs.defaultAssetAria": "默认资源编辑器",
    "songs.setDefaultAsset": "设为默认资源",
    "songs.revalidationAria": "重新校验结果",
    "songs.revalidation": "重新校验",
    "songs.validationAria": "song.json 校验结果",
    "songs.validation": "song.json 校验",
    "asset.editorAria": "资源配对编辑器",
    "asset.assets": "资源",
    "asset.vocal": "声轨",
    "asset.lyric": "歌词",
    "asset.switchFamily": "切换组",
    "asset.switchQuality": "切换质量",
    "asset.summaryAria": "资源概览",
    "asset.statusFor": "{asset} 的状态",
    "asset.vocalFor": "{asset} 的声轨",
    "asset.lyricFor": "{asset} 的歌词",
    "asset.switchFamilyFor": "{asset} 的切换组",
    "asset.update": "更新 {asset}",
    "asset.confirmTitle": "确认修改目录资源",
    "asset.confirmMessage": "该资源修改会影响可播状态或原伴唱切换资格，并会重新校验。",
    "asset.confirmApply": "应用修改",
    "rooms.title": "房间状态",
    "rooms.description": "查看实时控制会话状态，并刷新配对 token。",
    "rooms.refreshState": "刷新房间状态",
    "rooms.refreshToken": "刷新配对 token",
    "rooms.loadFailed": "加载房间状态失败",
    "rooms.refreshStateFailed": "刷新房间状态失败",
    "rooms.refreshTokenFailed": "刷新配对 token 失败",
    "rooms.taskActionFailed": "{action}任务失败",
    "rooms.retryTaskAria": "重试任务 {taskId}",
    "rooms.cleanTaskAria": "清理任务 {taskId}",
    "rooms.promoteTaskAria": "入库任务 {taskId}",
    "rooms.gridAria": "房间状态",
    "rooms.state": "房间状态",
    "rooms.tokenExpires": "Token 过期时间",
    "rooms.onlineControllers": "在线控制端",
    "rooms.tvStatus": "电视状态",
    "rooms.tvOnline": "在线",
    "rooms.tvOffline": "离线",
    "rooms.sessionVersion": "会话版本",
    "rooms.currentSong": "当前歌曲",
    "rooms.noCurrentSong": "暂无当前歌曲",
    "rooms.queueSummary": "队列概览",
    "rooms.onlineTasks": "在线补歌任务",
    "rooms.taskCounts": "任务统计",
    "rooms.event": "事件",
    "rooms.retry": "重试",
    "rooms.clean": "清理",
    "rooms.promote": "入库",
    "rooms.recentEvents": "最近事件",
    "rooms.roomFallback": "房间"
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
        const template = dictionaries[language][key] ?? dictionaries.en[key] ?? key;
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
        aria-pressed={language === "en"}
        className={language === "en" ? "language-option active" : "language-option"}
        type="button"
        onClick={() => setLanguage("en")}
      >
        {t("language.en")}
      </button>
      <button
        aria-pressed={language === "zh"}
        className={language === "zh" ? "language-option active" : "language-option"}
        type="button"
        onClick={() => setLanguage("zh")}
      >
        {t("language.zh")}
      </button>
    </div>
  );
}

export function statusText(status: string, t: I18nContextValue["t"]): string {
  return localizedEnum("status", status, "unavailable", t);
}

export function languageName(language: string, t: I18nContextValue["t"]): string {
  return localizedEnum("languageName", language, "other", t);
}

export function vocalModeName(mode: string, t: I18nContextValue["t"]): string {
  return localizedEnum("vocal", mode, "unknown", t);
}

export function roomStateText(status: string, t: I18nContextValue["t"]): string {
  return localizedEnum("roomState", status, "unknown", t);
}

export function playbackStateText(status: string, t: I18nContextValue["t"]): string {
  return localizedEnum("playbackState", status, "unknown", t);
}

export function eventTypeText(eventType: string, t: I18nContextValue["t"]): string {
  return localizedEnum("event", eventType, "unknown", t);
}

export function taskStateText(status: string, t: I18nContextValue["t"]): string {
  return localizedEnum("task", status, "discovered", t);
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

function localizedEnum(prefix: string, value: string | null | undefined, fallback: string, t: I18nContextValue["t"]): string {
  const keyValue = typeof value === "string" && value.length > 0 ? value : fallback;
  const key = `${prefix}.${keyValue}`;
  const text = t(key);
  return text === key ? t(`${prefix}.${fallback}`) : text;
}
