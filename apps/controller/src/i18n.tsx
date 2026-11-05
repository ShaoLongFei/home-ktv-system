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
    "nav.aria": "Controller navigation",
    "nav.home": "Home",
    "nav.control": "Control",
    "nav.my": "My",
    "shortcut.aria": "Party shortcuts",
    "shortcut.emoji": "Send emoji",
    "shortcut.bullet": "Send comment",
    "shortcut.rainbowPraise": "Praise",
    "shortcut.roast": "Roast",
    "shortcut.blessing": "Send blessing",
    "shortcut.mirror": "Mirror TV",
    "mirror.title": "TV screen",
    "mirror.mutedHint": "Muted preview",
    "mirror.empty": "Nothing is playing on the TV",
    "interaction.emojiTitle": "Send emoji",
    "interaction.bulletTitle": "Send comment",
    "interaction.rainbowPraiseTitle": "Send praise",
    "interaction.roastTitle": "Send roast",
    "interaction.blessingTitle": "Send blessing",
    "interaction.inputAria": "Interaction message",
    "interaction.placeholder": "Type a message",
    "interaction.send": "Send",
    "interaction.randomMessage": "Random send",
    "interaction.randomRainbowPraise": "Random send",
    "interaction.randomRoast": "Random send",
    "interaction.randomBlessing": "Random send",
    "interaction.bulletPreset1": "Nice song!",
    "interaction.bulletPreset2": "Sing it!",
    "interaction.bulletPreset3": "One more!",
    "interaction.rainbowPraisePreset1": "That note just lit up the room",
    "interaction.rainbowPraisePreset2": "This voice deserves the center stage",
    "interaction.rainbowPraisePreset3": "The vibe is officially upgraded",
    "interaction.rainbowPraisePreset4": "Every line sounds like a highlight",
    "interaction.rainbowPraisePreset5": "Tonight's best singer has appeared",
    "interaction.rainbowPraisePreset6": "The chorus landed perfectly",
    "interaction.rainbowPraisePreset7": "This performance has real star energy",
    "interaction.rainbowPraisePreset8": "The living room just turned into a concert",
    "interaction.rainbowPraisePreset9": "The mic just got promoted to VIP",
    "interaction.rainbowPraisePreset10": "This chorus deserves a replay button",
    "interaction.rainbowPraisePreset11": "The neighbors are getting premium vocals",
    "interaction.rainbowPraisePreset12": "The room is entering concert mode",
    "interaction.rainbowPraisePreset13": "That high note paid rent tonight",
    "interaction.rainbowPraisePreset14": "Someone call the fan club",
    "interaction.rainbowPraisePreset15": "The playlist found its final boss",
    "interaction.rainbowPraisePreset16": "This performance has main character energy",
    "interaction.rainbowPraisePreset17": "The sofa audience is emotionally booked",
    "interaction.rainbowPraisePreset18": "This song just got a luxury upgrade",
    "interaction.rainbowPraisePreset19": "The melody is wearing a crown now",
    "interaction.rainbowPraisePreset20": "Full marks, no notes, only applause",
    "interaction.rainbowPraisePreset21": "The room temperature rose three degrees",
    "interaction.rainbowPraisePreset22": "That line hit like a festival headline",
    "interaction.rainbowPraisePreset23": "The mic is blushing",
    "interaction.rainbowPraisePreset24": "Tonight's KTV stock just went limit up",
    "interaction.rainbowPraisePreset25": "The vibe is carrying the whole building",
    "interaction.rainbowPraisePreset26": "This voice needs its own spotlight",
    "interaction.rainbowPraisePreset27": "The chorus landed like fireworks",
    "interaction.rainbowPraisePreset28": "The remote audience is standing up",
    "interaction.rainbowPraisePreset29": "The song unlocked hidden DLC",
    "interaction.rainbowPraisePreset30": "This is the family concert headline",
    "interaction.roastPreset1": "The key is brave, the heart is braver",
    "interaction.roastPreset2": "This pitch has its own travel plan",
    "interaction.roastPreset3": "The original singer may need a moment",
    "interaction.roastPreset4": "Confidence is already full marks",
    "interaction.roastPreset5": "The mic is working very hard tonight",
    "interaction.roastPreset6": "A bold remix no one expected",
    "interaction.roastPreset7": "The beat almost caught up",
    "interaction.roastPreset8": "This version is hard to copy",
    "interaction.roastPreset9": "The pitch took the scenic route",
    "interaction.roastPreset10": "The beat filed a missing person report",
    "interaction.roastPreset11": "This version comes with surprise turns",
    "interaction.roastPreset12": "The original singer is buffering",
    "interaction.roastPreset13": "That key change had plot twists",
    "interaction.roastPreset14": "Confidence is loud, GPS is offline",
    "interaction.roastPreset15": "The melody just did parkour",
    "interaction.roastPreset16": "The mic is asking for hazard pay",
    "interaction.roastPreset17": "The rhythm tried its best",
    "interaction.roastPreset18": "A legendary remix nobody rehearsed",
    "interaction.roastPreset19": "The note left and came back evolved",
    "interaction.roastPreset20": "This song entered free solo mode",
    "interaction.roastPreset21": "The chorus is still catching up",
    "interaction.roastPreset22": "The audience needs subtitles for the key",
    "interaction.roastPreset23": "That ending was an open world game",
    "interaction.roastPreset24": "The tempo went to buy milk",
    "interaction.roastPreset25": "Original edition? We do multiverse here",
    "interaction.roastPreset26": "This pitch has independent thinking",
    "interaction.roastPreset27": "The backing track looks confused",
    "interaction.roastPreset28": "The melody took annual leave",
    "interaction.roastPreset29": "A brave artistic experiment",
    "interaction.roastPreset30": "The mic has seen things",
    "interaction.blessingPreset1": "Hope everyone has a great night",
    "interaction.blessingPreset2": "Best wishes to the whole family",
    "interaction.blessingPreset3": "May every song be a hit",
    "interaction.blessingPreset4": "May the house be filled with laughter",
    "interaction.blessingPreset5": "Cheers to a relaxed and happy night",
    "interaction.blessingPreset6": "May every wish arrive with the music",
    "interaction.blessingPreset7": "Wishing everyone health and good luck",
    "interaction.blessingPreset8": "May the next song bring more joy",
    "interaction.blessingPreset9": "May every chorus bring a fresh smile",
    "interaction.blessingPreset10": "May tonight's joy stay on repeat",
    "interaction.blessingPreset11": "May every duet land on the same beat",
    "interaction.blessingPreset12": "Wishing the whole room health and peace",
    "interaction.blessingPreset13": "May good luck arrive before the next song",
    "interaction.blessingPreset14": "May every ordinary night become a highlight",
    "interaction.blessingPreset15": "Wishing everyone a full battery of happiness",
    "interaction.blessingPreset16": "May the applause be loud and the worries quiet",
    "interaction.blessingPreset17": "May tomorrow borrow tonight's good mood",
    "interaction.blessingPreset18": "Wishing every singer a perfect chorus",
    "interaction.blessingPreset19": "May laughter, music, and luck all stay",
    "interaction.blessingPreset20": "May the family playlist never run out",
    "interaction.blessingPreset21": "Wishing everyone bright days and easy nights",
    "interaction.blessingPreset22": "May the next song unlock more good news",
    "interaction.blessingPreset23": "May every wish find the right rhythm",
    "interaction.blessingPreset24": "Wishing this room endless songs and smiles",
    "interaction.blessingPreset25": "May joy keep adding itself to the queue",
    "interaction.blessingPreset26": "Wishing everyone peace, luck, and full volume",
    "interaction.blessingPreset27": "May happy moments never go offline",
    "interaction.blessingPreset28": "May every note carry a little blessing",
    "interaction.blessingPreset29": "Wishing tonight's warmth a long encore",
    "interaction.blessingPreset30": "May this home always have music and laughter",
    "status.tvOnline": "TV online",
    "status.tvOnlineCount": "{count} TVs online",
    "status.tvOffline": "TV offline",
    "status.reconnecting": "Connection interrupted. Reconnecting",
    "current.aria": "Current playback",
    "current.eyebrow": "Now playing",
    "current.waiting": "Waiting for song",
    "current.emptyQueue": "Queue is empty",
    "current.connecting": "Connecting...",
    "volume.label": "Volume",
    "volume.aria": "Volume",
    "volume.value": "{value}%",
    "queue.aria": "Queue",
    "queue.title": "Queue",
    "queue.empty": "No queued songs",
    "queue.pending": "Adding...",
    "queue.requestedBy": "By {name}",
    "queue.unknownRequester": "Unknown requester",
    "queue.undoUntil": "Undo until {time}",
    "search.aria": "Song search",
    "search.title": "Search songs",
    "search.openAria": "Open search",
    "search.loading": "Searching",
    "search.inputAria": "Search keyword",
    "search.placeholder": "Search artist or song",
    "search.submit": "Search",
    "search.historyTitle": "Recent searches",
    "search.historyEmpty": "No recent search",
    "search.localPlayable": "NAS",
    "search.queued": "Queued",
    "search.versionCount": "{count} versions",
    "search.recommended": "Recommended",
    "search.localEmpty": "No NAS result",
    "search.loadingMore": "Loading more...",
    "search.onlineEmpty": "No online result",
    "search.indexedTitle": "NAS library",
    "search.indexedEmpty": "No NAS result",
    "search.indexedVersionCount": "{count} versions",
    "search.indexedQueued": "Queued",
    "search.indexedStale": "Source missing",
    "search.indexedUnreadable": "File unreadable",
    "search.unknownSize": "Unknown size",
    "search.singleAudioTrackSource": "Single-track source",
    "search.onlineTitle": "Online catalog",
    "search.onlineQueue": "Sing",
    "search.onlineQueuing": "Queuing",
    "search.onlinePreparing": "Preparing",
    "search.onlineQueued": "Queued",
    "search.onlineFailed": "Retry",

    "discovery.artists": "Artists",
    "discovery.genres": "Genres",
    "discovery.categories": "Song categories",
    "discovery.artistCardHint": "{count} artists",
    "discovery.genreCardHint": "{count} genres",
    "discovery.recommendations": "Recommended",
    "discovery.emptyRecommendations": "No recommendations yet",
    "discovery.loading": "Loading recommendations",
    "discovery.allArtists": "All artists",
    "discovery.allGenres": "All genres",
    "discovery.songCount": "{count} songs",
    "discovery.playCount": "{count} plays",
    "discovery.detailLoading": "Loading songs",
    "discovery.detailError": "Failed to load songs",
    "button.switchToOriginal": "Switch to vocal",
    "button.switchToInstrumental": "Switch to instrumental",
    "button.skip": "Skip",
    "rooms.current": "Room {room}",
    "console.aria": "Music console",
    "console.idleHint": "Waiting for requests",
    "console.playlist": "Playlist",
    "button.vocalOriginal": "Original",
    "button.vocalInstrumental": "Instrumental",
    "button.vocalUnknown": "Vocal",
    "volume.decrease": "Volume -5%",
    "volume.increase": "Volume +5%",
    "button.switchVocal": "Vocal",
    "rooms.switch": "Switch room",
    "rooms.joined": "Joined rooms",
    "rooms.join": "Enter",
    "rooms.joinPlaceholder": "Room code or link",
    "button.replay": "Replay",
    "button.pause": "Pause",
    "button.resume": "Resume",
    "button.promote": "Move up",
    "button.delete": "Delete",
    "button.undo": "Undo",
    "button.add": "Add",
    "button.shuffle": "Shuffle",
    "button.addAgain": "Add again",
    "button.addVersion": "Add this version",
    "button.addIndexed": "Add",
    "button.addingIndexed": "Adding...",
    "button.submitting": "Submitting",
    "button.cancel": "Cancel",
    "button.close": "Close",
    "button.confirm": "Confirm",
    "button.confirmAddAgain": "Confirm add",
    "button.refreshRecommendations": "Refresh",
    "button.loadMore": "Load more",
    "button.more": "More",
    "button.back": "Back",
    "button.clear": "Clear",
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
    "nav.aria": "控制端导航",
    "nav.home": "首页",
    "nav.control": "操控",
    "nav.my": "我的",
    "shortcut.aria": "互动快捷操作",
    "shortcut.emoji": "发表情",
    "shortcut.bullet": "发弹幕",
    "shortcut.rainbowPraise": "彩虹屁",
    "shortcut.roast": "神吐槽",
    "shortcut.blessing": "送祝福",
    "shortcut.mirror": "同步画面",
    "mirror.title": "电视画面",
    "mirror.mutedHint": "静音预览",
    "mirror.empty": "电视当前没有播放内容",
    "interaction.emojiTitle": "发表情",
    "interaction.bulletTitle": "发弹幕",
    "interaction.rainbowPraiseTitle": "彩虹屁",
    "interaction.roastTitle": "神吐槽",
    "interaction.blessingTitle": "送祝福",
    "interaction.inputAria": "互动内容",
    "interaction.placeholder": "输入要发送到电视的内容",
    "interaction.send": "发送",
    "interaction.randomMessage": "随机发送",
    "interaction.randomRainbowPraise": "随机发送",
    "interaction.randomRoast": "随机发送",
    "interaction.randomBlessing": "随机发送",
    "interaction.bulletPreset1": "这首好听！",
    "interaction.bulletPreset2": "唱得太好了",
    "interaction.bulletPreset3": "再来一首！",
    "interaction.rainbowPraisePreset1": "这一开嗓，客厅都亮了",
    "interaction.rainbowPraisePreset2": "今晚最佳舞台已经出现",
    "interaction.rainbowPraisePreset3": "这句唱得比原唱还上头",
    "interaction.rainbowPraisePreset4": "麦克风都在为你发光",
    "interaction.rainbowPraisePreset5": "这气息稳得像专业现场",
    "interaction.rainbowPraisePreset6": "副歌一出，全场直接沦陷",
    "interaction.rainbowPraisePreset7": "这首歌被你唱出高光时刻",
    "interaction.rainbowPraisePreset8": "家庭演唱会的主唱就是你",
    "interaction.rainbowPraisePreset9": "这一嗓子，楼下都想递报名表",
    "interaction.rainbowPraisePreset10": "KTV 顶流申请出战成功",
    "interaction.rainbowPraisePreset11": "这不是唱歌，这是给耳朵开会员",
    "interaction.rainbowPraisePreset12": "高音一出来，天花板都自觉升高",
    "interaction.rainbowPraisePreset13": "全场起立，麦霸之光降临",
    "interaction.rainbowPraisePreset14": "这首歌被你唱出了限定皮肤",
    "interaction.rainbowPraisePreset15": "一句封神，今晚 MVP 没悬念",
    "interaction.rainbowPraisePreset16": "这气场，遥控器都想打 call",
    "interaction.rainbowPraisePreset17": "原唱听了都想点个收藏",
    "interaction.rainbowPraisePreset18": "客厅秒变万人演唱会内场",
    "interaction.rainbowPraisePreset19": "这一段值一个热搜爆字",
    "interaction.rainbowPraisePreset20": "声音一出来，快乐直接满格",
    "interaction.rainbowPraisePreset21": "唱得太稳，像开了自动修音",
    "interaction.rainbowPraisePreset22": "这不是副歌，这是快乐核弹",
    "interaction.rainbowPraisePreset23": "家人们谁懂啊，这也太会唱了",
    "interaction.rainbowPraisePreset24": "今晚的星光被你承包了",
    "interaction.rainbowPraisePreset25": "这嗓音，路过的音符都排队点赞",
    "interaction.rainbowPraisePreset26": "一开口就是王炸，直接拿捏",
    "interaction.rainbowPraisePreset27": "这首歌遇到你算是熬出头了",
    "interaction.rainbowPraisePreset28": "麦克风表示：跟对人了",
    "interaction.rainbowPraisePreset29": "这个舞台感，沙发都想挥荧光棒",
    "interaction.rainbowPraisePreset30": "唱得我想把客厅改名鸟巢",
    "interaction.roastPreset1": "这调跑得很有探索精神",
    "interaction.roastPreset2": "原唱听了都要重新学一遍",
    "interaction.roastPreset3": "麦克风今晚承受了很多",
    "interaction.roastPreset4": "自信满分，音准随缘",
    "interaction.roastPreset5": "这版本主打一个无法复刻",
    "interaction.roastPreset6": "节奏差点就追上你了",
    "interaction.roastPreset7": "感情很满，音程很自由",
    "interaction.roastPreset8": "这一句成功唱出了悬念",
    "interaction.roastPreset9": "这调跑得导航都沉默了",
    "interaction.roastPreset10": "节奏：我追不上，但我尊重",
    "interaction.roastPreset11": "原唱听完连夜发来问号",
    "interaction.roastPreset12": "这一句，音准选择了自由",
    "interaction.roastPreset13": "麦克风：今天也是加班的一天",
    "interaction.roastPreset14": "伴奏努力营业，你努力创新",
    "interaction.roastPreset15": "这不是跑调，是调在跑你",
    "interaction.roastPreset16": "旋律刚想回来，又被你带走了",
    "interaction.roastPreset17": "高音没上去，但勇气上去了",
    "interaction.roastPreset18": "这版本主打一个剧情反转",
    "interaction.roastPreset19": "听得出来，感情比调更着急",
    "interaction.roastPreset20": "节拍器听了都想请假",
    "interaction.roastPreset21": "这一段唱出了盲盒感",
    "interaction.roastPreset22": "原曲：我当时不是这么想的",
    "interaction.roastPreset23": "这首歌被唱出了平行宇宙",
    "interaction.roastPreset24": "调门很倔强，谁也不服谁",
    "interaction.roastPreset25": "这气息像 Wi-Fi，时强时弱",
    "interaction.roastPreset26": "唱得很好，下次先通知伴奏",
    "interaction.roastPreset27": "副歌还没到，你已经先冲锋了",
    "interaction.roastPreset28": "这一嗓子，空气都愣了一下",
    "interaction.roastPreset29": "音符正在开会讨论归队",
    "interaction.roastPreset30": "今晚最自由的灵魂出现了",
    "interaction.blessingPreset1": "祝大家今晚玩得开心",
    "interaction.blessingPreset2": "祝家人朋友天天开心",
    "interaction.blessingPreset3": "愿每一首都唱到尽兴",
    "interaction.blessingPreset4": "愿笑声和歌声都留在今晚",
    "interaction.blessingPreset5": "祝大家身体健康，万事顺意",
    "interaction.blessingPreset6": "愿每一个愿望都被音乐听见",
    "interaction.blessingPreset7": "祝今晚的快乐一直延续下去",
    "interaction.blessingPreset8": "愿下一首歌带来更多好运",
    "interaction.blessingPreset9": "愿今晚的快乐循环播放",
    "interaction.blessingPreset10": "祝大家唱得开心，笑到缺氧",
    "interaction.blessingPreset11": "愿每一首歌都唱出好心情",
    "interaction.blessingPreset12": "祝麦霸有歌唱，听众有掌声",
    "interaction.blessingPreset13": "愿今晚烦恼全部切歌",
    "interaction.blessingPreset14": "祝家里每天都有高光时刻",
    "interaction.blessingPreset15": "愿好运像副歌一样反复出现",
    "interaction.blessingPreset16": "祝大家吃好喝好唱到尽兴",
    "interaction.blessingPreset17": "愿每一次合唱都刚好同频",
    "interaction.blessingPreset18": "祝今天的快乐明天还能续杯",
    "interaction.blessingPreset19": "愿生活像今晚一样热闹",
    "interaction.blessingPreset20": "祝所有愿望都不跑调",
    "interaction.blessingPreset21": "愿掌声、笑声、歌声全都满格",
    "interaction.blessingPreset22": "祝大家越唱越年轻，越笑越开心",
    "interaction.blessingPreset23": "愿下一首歌带来新的好运",
    "interaction.blessingPreset24": "祝今晚每个人都有主角光环",
    "interaction.blessingPreset25": "愿家人朋友平安顺遂，快乐常在",
    "interaction.blessingPreset26": "祝烦恼退退退，开心进进进",
    "interaction.blessingPreset27": "愿每个平凡日子都能唱出彩",
    "interaction.blessingPreset28": "祝大家嗓子在线，快乐不掉线",
    "interaction.blessingPreset29": "愿今晚的热闹变成明天的能量",
    "interaction.blessingPreset30": "祝这间客厅永远有歌有笑",
    "status.tvOnline": "电视在线",
    "status.tvOnlineCount": "{count} 台电视在线",
    "status.tvOffline": "电视离线",
    "status.reconnecting": "连接中断，正在重连",
    "current.aria": "当前播放",
    "current.eyebrow": "正在播放",
    "current.waiting": "等待点歌",
    "current.emptyQueue": "队列为空",
    "current.connecting": "连接中",
    "volume.label": "音量",
    "volume.aria": "音量",
    "volume.value": "{value}%",
    "queue.aria": "播放队列",
    "queue.title": "播放队列",
    "queue.empty": "暂无排队歌曲",
    "queue.pending": "正在加入队列",
    "queue.requestedBy": "点歌人 {name}",
    "queue.unknownRequester": "未知点歌人",
    "queue.undoUntil": "可撤销至 {time}",
    "search.aria": "搜索歌曲",
    "search.title": "搜索歌曲",
    "search.openAria": "打开搜索",
    "search.loading": "搜索中",
    "search.inputAria": "搜索关键词",
    "search.placeholder": "搜索歌星、歌名",
    "search.submit": "搜索",
    "search.historyTitle": "最近搜索",
    "search.historyEmpty": "暂无最近搜索",
    "search.localPlayable": "NAS 曲库",
    "search.queued": "已点 / 队列中",
    "search.versionCount": "{count} 个版本",
    "search.recommended": "推荐",
    "search.localEmpty": "NAS 曲库未找到",
    "search.loadingMore": "加载更多…",
    "search.onlineEmpty": "在线曲库未找到",
    "search.indexedTitle": "NAS 曲库",
    "search.indexedEmpty": "未找到 NAS 曲库结果",
    "search.indexedVersionCount": "{count} 个版本",
    "search.indexedQueued": "已点",
    "search.indexedStale": "文件已失效",
    "search.indexedUnreadable": "文件不可读",
    "search.unknownSize": "未知大小",
    "search.singleAudioTrackSource": "单音轨歌曲源",
    "search.onlineTitle": "在线曲库",
    "search.onlineQueue": "点歌",
    "search.onlineQueuing": "提交中",
    "search.onlinePreparing": "准备中",
    "search.onlineQueued": "已点",
    "search.onlineFailed": "重试",

    "discovery.artists": "歌手点歌",
    "discovery.genres": "风格点歌",
    "discovery.categories": "点歌分类",
    "discovery.artistCardHint": "{count} 位歌手",
    "discovery.genreCardHint": "{count} 种风格",
    "discovery.recommendations": "推荐歌曲",
    "discovery.emptyRecommendations": "暂无推荐歌曲",
    "discovery.loading": "推荐加载中",
    "discovery.allArtists": "全部歌手",
    "discovery.allGenres": "全部风格",
    "discovery.songCount": "{count} 首歌",
    "discovery.playCount": "{count} 次点歌",
    "discovery.detailLoading": "歌曲加载中",
    "discovery.detailError": "歌曲加载失败",
    "button.switchToOriginal": "切到原唱",
    "button.switchToInstrumental": "切到伴唱",
    "button.skip": "切歌",
    "rooms.current": "房间 {room}",
    "console.aria": "音乐控制台",
    "console.idleHint": "等待点歌",
    "console.playlist": "歌单",
    "button.vocalOriginal": "原唱",
    "button.vocalInstrumental": "伴唱",
    "button.vocalUnknown": "原唱/伴唱",
    "volume.decrease": "音量 -5%",
    "volume.increase": "音量 +5%",
    "button.switchVocal": "原唱/伴唱",
    "rooms.switch": "切换房间",
    "rooms.joined": "已加入的房间",
    "rooms.join": "进入",
    "rooms.joinPlaceholder": "房间号或链接",
    "button.replay": "重唱",
    "button.pause": "暂停",
    "button.resume": "继续",
    "button.promote": "顶歌",
    "button.delete": "删除",
    "button.undo": "撤销",
    "button.add": "点歌",
    "button.shuffle": "打乱",
    "button.addAgain": "加点",
    "button.addVersion": "点这个版本",
    "button.addIndexed": "点歌",
    "button.addingIndexed": "正在加入...",
    "button.submitting": "提交中",
    "button.cancel": "取消",
    "button.close": "关闭",
    "button.confirm": "确认",
    "button.confirmAddAgain": "确认加点",
    "button.refreshRecommendations": "换一批",
    "button.loadMore": "加载更多",
    "button.more": "更多",
    "button.back": "返回",
    "button.clear": "清空",
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
