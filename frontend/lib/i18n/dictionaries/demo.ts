import type { Locale } from "../config";

/**
 * 演示数据与「说出你的旅行」解析用的双语文本。
 *
 *  不放进 zh.ts / en.ts 是因为它们不是页面文案，而是：
 *   1. 离线演示流的业务数据（机场 / 酒店 / 景点 / 餐厅 / 每日主题 / 报价行标签）；
 *   2. 自然语言解析词典（城市别名、偏好关键词、示例句）。
 *  id、机场三字码、价格、时间这些结构化字段两套保持一致，只换展示文案。
 */

// ---------------------------------------------------------------- 城市别名

/** 城市中文名 → 英文名（解析英文输入、下拉框展示时双向查表） */
export const CITY_ALIASES: Record<string, string> = {
  上海: "Shanghai",
  北京: "Beijing",
  广州: "Guangzhou",
  深圳: "Shenzhen",
  香港: "Hong Kong",
  东京: "Tokyo",
  新加坡: "Singapore",
  曼谷: "Bangkok",
};

/** 英文名（小写）→ 中文名 */
export const CITY_ALIASES_REVERSE: Record<string, string> = Object.fromEntries(
  Object.entries(CITY_ALIASES).map(([cn, latin]) => [latin.toLowerCase(), cn])
);

/** 把任意写法的城市名归一到中文名（后端目录用中文） */
export function canonicalCity(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  if (CITY_ALIASES[trimmed]) return trimmed;
  return CITY_ALIASES_REVERSE[trimmed.toLowerCase()] ?? trimmed;
}

/** 把城市名显示成当前语言 */
export function displayCity(value: string, locale: Locale): string {
  const canonical = canonicalCity(value);
  if (locale === "zh") return canonical;
  return CITY_ALIASES[canonical] ?? canonical;
}

/** 规范偏好名（中文）→ 当前语言的展示名 */
export function preferenceDisplay(pref: string, locale: Locale): string {
  return demoText(locale).preferenceDisplay[pref] ?? pref;
}

export type DemoItemKind =
  | "flight"
  | "hotel"
  | "attraction"
  | "dining"
  | "custom";

export interface DemoItem {
  time: string;
  kind: DemoItemKind;
  /** 引用哪个 offer（flight / hotel / attraction / dining） */
  offerRef?: string;
  /** 直给的标题（自定义条目） */
  title?: string;
  /** 标题模板，占位符由 demo-fixture 填充 */
  titleTpl?: string;
  /** 展示在标题下的区域 */
  area?: string;
  /** 直给的备注（自定义条目） */
  note?: string;
  /** 备注模板 */
  noteTpl?: string;
  /** 自定义条目的人均价格 */
  pricePerPax?: number;
  category?: 0 | 1 | 2 | 3;
}

export interface DemoDay {
  theme: string;
  items: DemoItem[];
}

export interface DemoLocale {
  /** 「说出你的旅行」示例句 */
  examples: string[];
  /**
   * 可选城市与偏好统一用「中文规范名」存储（后端目录就是中文），
   * 展示时再经 displayCity / preferenceDisplay 翻成当前语言。
   */
  origins: string[];
  destinations: string[];
  preferences: string[];
  /** 规范偏好名 → 当前语言的展示名 */
  preferenceDisplay: Record<string, string>;
  /** [正则, 规范偏好名]，按顺序匹配 */
  preferenceKeywords: [RegExp, string][];

  city: Record<string, string>;
  airport: Record<string, string>;

  flight: { cabin: string };
  hotel: { name: string; area: string; address: string; roomType: string };
  attraction: Record<string, { name: string; area: string }>;
  dining: Record<string, { name: string; area: string; cuisine: string }>;

  days: DemoDay[];

  /** 备注模板里用到的固定词 */
  words: {
    walk: string;
    reserve: string;
    booking: string;
    free: string;
    sunset: string;
  };

  /** 报价单里的演示行标签 */
  streetFood: string;

  /** agent.status 各阶段标签 */
  status: {
    understanding: string;
    sourcing: string;
    planning: string;
    budgeting: string;
    done: string;
  };

  /** agent.delta 开场白模板 */
  deltaIntro: string;
  /** 偏好等短列表分隔符（中文顿号 / 英文逗号） */
  listSeparator: string;
  /** day.delta 分隔符 */
  daySeparator: string;
}

const zh: DemoLocale = {
  examples: [
    "上海去东京 5 天、两人、预算 8000、想吃好少走路",
    "深圳飞新加坡 4 天、一家三口、预算 12000、想轻松点",
    "北京出发曼谷 6 天、两人、预算 6000、爱逛夜市",
  ],
  origins: ["上海", "北京", "广州", "深圳", "香港"],
  destinations: ["东京", "新加坡", "曼谷"],
  preferences: ["想吃好", "少走路", "亲子", "购物", "夜景", "博物馆", "夜市"],
  preferenceDisplay: {
    想吃好: "想吃好",
    少走路: "少走路",
    亲子: "亲子",
    购物: "购物",
    夜景: "夜景",
    博物馆: "博物馆",
    夜市: "夜市",
  },
  preferenceKeywords: [
    [/吃好|美食/, "想吃好"],
    [/少走路|省力|轻松/, "少走路"],
    [/亲子|带娃|孩子/, "亲子"],
    [/购物|买买买/, "购物"],
    [/夜景|夜生活/, "夜景"],
    [/博物馆|美术馆|展览/, "博物馆"],
    [/夜市/, "夜市"],
  ],

  city: { 上海: "上海", 东京: "东京" },
  airport: { PVG: "浦东国际机场", HND: "羽田机场" },

  flight: { cabin: "经济舱" },
  hotel: {
    name: "新宿格拉斯丽酒店",
    area: "新宿",
    address: "东京都新宿区歌舞伎町1-19-1",
    roomType: "高级双床房 28㎡",
  },
  attraction: {
    "att-teamlab": { name: "teamLab Planets TOKYO", area: "台场" },
    "att-sensoji": { name: "浅草寺 & 仲见世通", area: "浅草" },
    "att-shibuya-sky": { name: "SHIBUYA SKY 展望台", area: "涩谷" },
  },
  dining: {
    "din-sushi-ue": { name: "鮨 うえの（银座）", area: "银座", cuisine: "江户前寿司" },
    "din-tempura": { name: "天ぷら 天源（新宿）", area: "新宿", cuisine: "天妇罗" },
  },

  days: [
    {
      theme: "抵达 · 新宿落脚",
      items: [
        {
          time: "09:25",
          kind: "flight",
          offerRef: "flt-nh959",
          noteTpl: "{carrier} · {aircraft} · {duration}",
        },
        {
          time: "15:00",
          kind: "hotel",
          offerRef: "htl-gracery",
          category: 1,
          titleTpl: "入住 {hotelName}",
          noteTpl: "{roomType} · {nights}",
        },
        {
          time: "19:30",
          kind: "dining",
          offerRef: "din-tempura",
          category: 3,
          noteTpl: "{cuisine} · {walk}",
        },
      ],
    },
    {
      theme: "台场 · 数字艺术与海风",
      items: [
        {
          time: "10:30",
          kind: "attraction",
          offerRef: "att-teamlab",
          category: 2,
          noteTpl: "{booking} · {openHours}",
        },
        {
          time: "14:00",
          kind: "custom",
          title: "台场海滨公园散步",
          note: "少走路方案：园内接驳车 + 室内展馆为主",
        },
        {
          time: "18:30",
          kind: "dining",
          offerRef: "din-sushi-ue",
          category: 3,
          noteTpl: "{cuisine} · {reserve}",
        },
      ],
    },
    {
      theme: "浅草 · 下町慢走",
      items: [
        {
          time: "09:30",
          kind: "attraction",
          offerRef: "att-sensoji",
          category: 2,
          noteTpl: "{free} · {openHours}",
        },
        {
          time: "12:30",
          kind: "custom",
          title: "合羽桥商店街觅食",
          note: "少走路方案：商店街集中在一条街上，边逛边吃",
          pricePerPax: 40,
        },
        {
          time: "16:00",
          kind: "custom",
          title: "隅田川游船",
          note: "坐船代替步行，从浅草直达滨离宫",
          pricePerPax: 22,
        },
      ],
    },
    {
      theme: "涩谷 · 黄昏与夜景",
      items: [
        {
          time: "11:00",
          kind: "custom",
          title: "表参道 · 青山咖啡巡礼",
          note: "想逛就逛，累了随时钻进咖啡馆",
          pricePerPax: 30,
        },
        {
          time: "16:30",
          kind: "attraction",
          offerRef: "att-shibuya-sky",
          category: 2,
          noteTpl: "{sunset} · {openHours}",
        },
        {
          time: "19:30",
          kind: "custom",
          title: "涩谷居酒屋一条街",
          area: "涩谷",
          category: 3,
          pricePerPax: 70,
        },
      ],
    },
    {
      theme: "返程 · 羽田直飞",
      items: [
        {
          time: "10:00",
          kind: "custom",
          title: "新宿御苑晨间散步",
          note: "离酒店步行 12 分钟",
          pricePerPax: 5,
        },
        {
          time: "11:00",
          kind: "custom",
          title: "退房 · 寄存行李",
          category: 1,
          noteTpl: "{checkOut}",
        },
        {
          time: "18:10",
          kind: "flight",
          offerRef: "flt-nh960",
          note: "机场大巴直达，避免换乘搬行李",
        },
      ],
    },
  ],

  words: {
    walk: "步行 6 分钟",
    reserve: "需提前订位",
    booking: "需预约",
    free: "免费参拜",
    sunset: "日落时段入场",
  },

  streetFood: "商店街小吃",

  status: {
    understanding: "正在理解你的需求…",
    sourcing: "正在向 4 家服务商 Agent 询价…",
    planning: "正在编排逐日行程…",
    budgeting: "正在核算预算…",
    done: "行程已就绪，共 {days} 天，总价 ${total} 美元",
  },

  deltaIntro:
    "收到：{origin} 出发去{destination}，{days} 天 {pax} 人，预算 {budget} 美元。偏好是「{preferences}」，我会优先安排少走路、餐食质量高的方案。",
  listSeparator: "、",
  daySeparator: "；",
};

const en: DemoLocale = {
  examples: [
    "Tokyo 5 days from Shanghai, 2 people, budget 8000, good food",
    "Singapore 4 days from Shenzhen, family of 3, budget 12000, relaxed",
    "Bangkok 6 days from Beijing, 2 people, budget 6000, night markets",
  ],
  origins: ["上海", "北京", "广州", "深圳", "香港"],
  destinations: ["东京", "新加坡", "曼谷"],
  preferences: ["想吃好", "少走路", "亲子", "购物", "夜景", "博物馆", "夜市"],
  preferenceDisplay: {
    想吃好: "Good food",
    少走路: "Less walking",
    亲子: "Family",
    购物: "Shopping",
    夜景: "Night views",
    博物馆: "Museums",
    夜市: "Night markets",
  },
  // 中英文写法都收：界面切到英文后，用户仍可能粘贴中文需求
  preferenceKeywords: [
    [/吃好|美食|good food|cuisine|foodie|gourmet/i, "想吃好"],
    [/少走路|省力|轻松|less walking|relaxed|easy pace/i, "少走路"],
    // "family of 3" 说的是人数，不算亲子偏好，所以排除后面跟 of N 的写法
    [/亲子|带娃|孩子|kids|children|family-friendly|\bfamily\b(?!\s*of\s*\d)/i, "亲子"],
    [/购物|买买买|shopping/i, "购物"],
    [/夜景|夜生活|night view|nightlife/i, "夜景"],
    [/博物馆|美术馆|展览|museum|gallery|exhibition/i, "博物馆"],
    [/夜市|night market/i, "夜市"],
  ],

  city: { 上海: "Shanghai", 东京: "Tokyo" },
  airport: { PVG: "Pudong International Airport", HND: "Haneda Airport" },

  flight: { cabin: "Economy" },
  hotel: {
    name: "Hotel Gracery Shinjuku",
    area: "Shinjuku",
    address: "1-19-1 Kabukicho, Shinjuku-ku, Tokyo",
    roomType: "Superior Twin 28㎡",
  },
  attraction: {
    "att-teamlab": { name: "teamLab Planets TOKYO", area: "Odaiba" },
    "att-sensoji": { name: "Senso-ji & Nakamise Street", area: "Asakusa" },
    "att-shibuya-sky": { name: "SHIBUYA SKY Observation Deck", area: "Shibuya" },
  },
  dining: {
    "din-sushi-ue": { name: "Sushi Ueno (Ginza)", area: "Ginza", cuisine: "Edome-style sushi" },
    "din-tempura": { name: "Tempura Tengen (Shinjuku)", area: "Shinjuku", cuisine: "Tempura" },
  },

  days: [
    {
      theme: "Arrival · settling in Shinjuku",
      items: [
        {
          time: "09:25",
          kind: "flight",
          offerRef: "flt-nh959",
          noteTpl: "{carrier} · {aircraft} · {duration}",
        },
        {
          time: "15:00",
          kind: "hotel",
          offerRef: "htl-gracery",
          category: 1,
          titleTpl: "Check in at {hotelName}",
          noteTpl: "{roomType} · {nights}",
        },
        {
          time: "19:30",
          kind: "dining",
          offerRef: "din-tempura",
          category: 3,
          noteTpl: "{cuisine} · {walk}",
        },
      ],
    },
    {
      theme: "Odaiba · digital art and sea breeze",
      items: [
        {
          time: "10:30",
          kind: "attraction",
          offerRef: "att-teamlab",
          category: 2,
          noteTpl: "{booking} · {openHours}",
        },
        {
          time: "14:00",
          kind: "custom",
          title: "Walk at Odaiba Seaside Park",
          note: "Low-walking plan: park shuttle plus indoor pavilions",
        },
        {
          time: "18:30",
          kind: "dining",
          offerRef: "din-sushi-ue",
          category: 3,
          noteTpl: "{cuisine} · {reserve}",
        },
      ],
    },
    {
      theme: "Asakusa · slow old-town walk",
      items: [
        {
          time: "09:30",
          kind: "attraction",
          offerRef: "att-sensoji",
          category: 2,
          noteTpl: "{free} · {openHours}",
        },
        {
          time: "12:30",
          kind: "custom",
          title: "Food crawl at Kappabashi Street",
          note: "Low-walking plan: everything sits on one street — eat as you stroll",
          pricePerPax: 40,
        },
        {
          time: "16:00",
          kind: "custom",
          title: "Sumida River cruise",
          note: "Boat instead of walking — straight from Asakusa to Hamarikyu",
          pricePerPax: 22,
        },
      ],
    },
    {
      theme: "Shibuya · dusk and night views",
      items: [
        {
          time: "11:00",
          kind: "custom",
          title: "Omotesando & Aoyama coffee walk",
          note: "Browse as you like; duck into a café whenever you tire",
          pricePerPax: 30,
        },
        {
          time: "16:30",
          kind: "attraction",
          offerRef: "att-shibuya-sky",
          category: 2,
          noteTpl: "{sunset} · {openHours}",
        },
        {
          time: "19:30",
          kind: "custom",
          title: "Shibuya izakaya alley",
          area: "Shibuya",
          category: 3,
          pricePerPax: 70,
        },
      ],
    },
    {
      theme: "Departure · direct from Haneda",
      items: [
        {
          time: "10:00",
          kind: "custom",
          title: "Morning walk in Shinjuku Gyoen",
          note: "12-minute walk from the hotel",
          pricePerPax: 5,
        },
        {
          time: "11:00",
          kind: "custom",
          title: "Check-out · luggage storage",
          category: 1,
          noteTpl: "{checkOut}",
        },
        {
          time: "18:10",
          kind: "flight",
          offerRef: "flt-nh960",
          note: "Direct airport bus — no transfers with luggage",
        },
      ],
    },
  ],

  words: {
    walk: "6 min walk",
    reserve: "Reservation required",
    booking: "Booking required",
    free: "Free admission",
    sunset: "Sunset entry slot",
  },

  streetFood: "Street food stalls",

  status: {
    understanding: "Understanding your request…",
    sourcing: "Quoting 4 provider Agents…",
    planning: "Building the day-by-day itinerary…",
    budgeting: "Calculating the budget…",
    done: "Itinerary ready — {days} days, total ${total} USD",
  },

  deltaIntro:
    "Got it: {origin} → {destination}, {days} days for {pax} guests, budget {budget} USD. Preferences: “{preferences}” — I'll prioritize less walking and higher-quality meals.",
  listSeparator: ", ",
  daySeparator: "; ",
};

export const DEMO_LOCALES: Record<Locale, DemoLocale> = { zh, en };

export function demoText(locale: Locale): DemoLocale {
  return DEMO_LOCALES[locale] ?? DEMO_LOCALES.zh;
}
