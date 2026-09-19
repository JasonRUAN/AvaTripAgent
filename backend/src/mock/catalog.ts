/**
 * 城市目录（Mock 库存种子）。
 *
 * 全部使用真实存在的机场三字码、航司二字码、酒店名、景点名，增强演示可信度。
 * 页面固定标注「演示数据 · 非真实可预订库存」。
 */

export interface Airport {
  code: string;
  name: string;
  terminal: string;
}

export interface HotelSeed {
  id: string;
  name: string;
  stars: number;
  area: string;
  address: string;
  roomType: string;
  basePrice: number;
}

export interface AttractionSeed {
  id: string;
  name: string;
  area: string;
  durationMinutes: number;
  openHours: string;
  needBooking: boolean;
  basePrice: number;
}

export interface DiningSeed {
  id: string;
  name: string;
  area: string;
  cuisine: string;
  durationMinutes: number;
  basePrice: number;
}

export interface CityCatalog {
  key: string;
  name: string;
  /** 从上海出发的飞行时长（分钟） */
  flightMinutes: number;
  airports: Airport[];
  hotels: HotelSeed[];
  attractions: AttractionSeed[];
  restaurants: DiningSeed[];
}

export const CITIES: Record<string, CityCatalog> = {
  东京: {
    key: "tokyo",
    name: "东京",
    flightMinutes: 195,
    airports: [
      { code: "HND", name: "羽田机场", terminal: "T3" },
      { code: "NRT", name: "成田国际机场", terminal: "T1" },
    ],
    hotels: [
      { id: "ty-h1", name: "新宿格拉斯丽酒店", stars: 4, area: "新宿", address: "东京都新宿区歌舞伎町1-19-1", roomType: "高级双床房 28㎡", basePrice: 168 },
      { id: "ty-h2", name: "东京湾希尔顿酒店", stars: 5, area: "台场", address: "东京都港区台场1-9-1", roomType: "湾景特大床房 42㎡", basePrice: 286 },
      { id: "ty-h3", name: "浅草 View 酒店", stars: 4, area: "浅草", address: "东京都台东区西浅草3-17-1", roomType: "和洋室 32㎡", basePrice: 152 },
      { id: "ty-h4", name: "涩谷 Excel Hotel Tokyu", stars: 4, area: "涩谷", address: "东京都涩谷区道玄坂1-12-2", roomType: "高层城景双床房 30㎡", basePrice: 198 },
      { id: "ty-h5", name: "银座大仓 Prestige", stars: 5, area: "银座", address: "东京都中央区银座5-6-1", roomType: "尊享双床房 45㎡", basePrice: 342 },
      { id: "ty-h6", name: "上野三井花园酒店", stars: 4, area: "上野", address: "东京都台东区上野3-19-7", roomType: "高级双床房 26㎡", basePrice: 145 },
      { id: "ty-h7", name: "东京站大丸前 APA", stars: 3, area: "丸之内", address: "东京都中央区八重洲1-2-9", roomType: "双床房 20㎡", basePrice: 112 },
      { id: "ty-h8", name: "六本木 Grand Hyatt", stars: 5, area: "六本木", address: "东京都港区六本木6-10-3", roomType: "庭景双床房 48㎡", basePrice: 405 },
    ],
    attractions: [
      { id: "ty-a1", name: "teamLab Planets TOKYO", area: "台场", durationMinutes: 120, openHours: "10:00-19:00", needBooking: true, basePrice: 32 },
      { id: "ty-a2", name: "浅草寺 & 仲见世通", area: "浅草", durationMinutes: 90, openHours: "06:00-17:00", needBooking: false, basePrice: 0 },
      { id: "ty-a3", name: "SHIBUYA SKY 展望台", area: "涩谷", durationMinutes: 75, openHours: "10:00-22:30", needBooking: true, basePrice: 25 },
      { id: "ty-a4", name: "东京晴空塔展望台", area: "押上", durationMinutes: 90, openHours: "10:00-21:00", needBooking: true, basePrice: 28 },
      { id: "ty-a5", name: "上野恩赐公园 & 东京国立博物馆", area: "上野", durationMinutes: 150, openHours: "09:30-17:00", needBooking: false, basePrice: 10 },
      { id: "ty-a6", name: "明治神宫", area: "原宿", durationMinutes: 60, openHours: "06:40-16:20", needBooking: false, basePrice: 0 },
      { id: "ty-a7", name: "新宿御苑", area: "新宿", durationMinutes: 75, openHours: "09:00-16:00", needBooking: false, basePrice: 5 },
      { id: "ty-a8", name: "筑地场外市场", area: "筑地", durationMinutes: 60, openHours: "05:00-14:00", needBooking: false, basePrice: 0 },
      { id: "ty-a9", name: "东京迪士尼海洋", area: "舞滨", durationMinutes: 480, openHours: "09:00-21:00", needBooking: true, basePrice: 76 },
      { id: "ty-a10", name: "六本木森美术馆", area: "六本木", durationMinutes: 120, openHours: "10:00-22:00", needBooking: true, basePrice: 20 },
      { id: "ty-a11", name: "隅田川游船", area: "浅草", durationMinutes: 40, openHours: "10:00-18:00", needBooking: false, basePrice: 22 },
      { id: "ty-a12", name: "三鹰之森吉卜力美术馆", area: "三鹰", durationMinutes: 150, openHours: "10:00-18:00", needBooking: true, basePrice: 15 },
    ],
    restaurants: [
      { id: "ty-d1", name: "鮨 うえの（银座）", area: "银座", cuisine: "江户前寿司", durationMinutes: 90, basePrice: 180 },
      { id: "ty-d2", name: "天ぷら 天源（新宿）", area: "新宿", cuisine: "天妇罗", durationMinutes: 75, basePrice: 95 },
      { id: "ty-d3", name: "一兰拉面 本店", area: "福冈风·涩谷店", cuisine: "豚骨拉面", durationMinutes: 45, basePrice: 18 },
      { id: "ty-d4", name: "蟹道乐 新宿本店", area: "新宿", cuisine: "蟹料理", durationMinutes: 120, basePrice: 150 },
      { id: "ty-d5", name: "叙叙苑 六本木", area: "六本木", cuisine: "烧肉", durationMinutes: 110, basePrice: 130 },
      { id: "ty-d6", name: "鳗鱼饭 川千家", area: "浅草", cuisine: "鳗鱼", durationMinutes: 70, basePrice: 88 },
      { id: "ty-d7", name: "Blue Bottle 清澄白河", area: "清澄白河", cuisine: "精品咖啡", durationMinutes: 40, basePrice: 12 },
      { id: "ty-d8", name: "大黑家 天妇罗", area: "浅草", cuisine: "天妇罗", durationMinutes: 60, basePrice: 42 },
      { id: "ty-d9", name: "鸟贵族 涩谷店", area: "涩谷", cuisine: "烤鸡串", durationMinutes: 90, basePrice: 32 },
      { id: "ty-d10", name: "afuri 柚子盐拉面", area: "惠比寿", cuisine: "柚子盐拉面", durationMinutes: 45, basePrice: 20 },
    ],
  },

  新加坡: {
    key: "singapore",
    name: "新加坡",
    flightMinutes: 335,
    airports: [
      { code: "SIN", name: "樟宜机场", terminal: "T3" },
      { code: "XSP", name: "实里达机场", terminal: "T1" },
    ],
    hotels: [
      { id: "sg-h1", name: "滨海湾金沙酒店", stars: 5, area: "滨海湾", address: "10 Bayfront Ave", roomType: "城景双床房 45㎡", basePrice: 420 },
      { id: "sg-h2", name: "莱佛士酒店", stars: 5, area: "市政区", address: "1 Beach Rd", roomType: "殖民套房 60㎡", basePrice: 510 },
      { id: "sg-h3", name: "乌节路泛太平洋", stars: 5, area: "乌节路", address: "10 Claymore Rd", roomType: "高级双床房 38㎡", basePrice: 245 },
      { id: "sg-h4", name: "圣淘沙香格里拉", stars: 5, area: "圣淘沙", address: "101 Siloso Rd", roomType: "海景双床房 42㎡", basePrice: 320 },
      { id: "sg-h5", name: "牛车水 Hotel 1888", stars: 4, area: "牛车水", address: "20 Cross St", roomType: "精品双床房 24㎡", basePrice: 138 },
      { id: "sg-h6", name: "小印度 Parkroyal", stars: 4, area: "小印度", address: "181 Kitchener Rd", roomType: "高级双床房 26㎡", basePrice: 126 },
      { id: "sg-h7", name: "克拉码头 M Social", stars: 4, area: "克拉码头", address: "90 Robertson Quay", roomType: "Aura 双床房 25㎡", basePrice: 158 },
      { id: "sg-h8", name: "樟宜皇冠假日", stars: 4, area: "樟宜", address: "75 Airport Blvd", roomType: "高级双床房 30㎡", basePrice: 172 },
    ],
    attractions: [
      { id: "sg-a1", name: "滨海湾花园 & 空中步道", area: "滨海湾", durationMinutes: 150, openHours: "09:00-21:00", needBooking: true, basePrice: 28 },
      { id: "sg-a2", name: "新加坡环球影城", area: "圣淘沙", durationMinutes: 420, openHours: "10:00-19:00", needBooking: true, basePrice: 82 },
      { id: "sg-a3", name: "鱼尾狮公园", area: "滨海湾", durationMinutes: 45, openHours: "全天", needBooking: false, basePrice: 0 },
      { id: "sg-a4", name: "新加坡国家美术馆", area: "市政区", durationMinutes: 120, openHours: "10:00-19:00", needBooking: false, basePrice: 15 },
      { id: "sg-a5", name: "S.E.A. 海洋馆", area: "圣淘沙", durationMinutes: 180, openHours: "10:00-19:00", needBooking: true, basePrice: 38 },
      { id: "sg-a6", name: "新加坡动物园", area: "万礼", durationMinutes: 300, openHours: "08:30-18:00", needBooking: true, basePrice: 42 },
      { id: "sg-a7", name: "夜间野生动物园", area: "万礼", durationMinutes: 180, openHours: "19:15-24:00", needBooking: true, basePrice: 40 },
      { id: "sg-a8", name: "哈芝巷 & 苏丹回教堂", area: "甘榜格南", durationMinutes: 90, openHours: "10:00-22:00", needBooking: false, basePrice: 0 },
      { id: "sg-a9", name: "新加坡缆车（花柏山线）", area: "花柏山", durationMinutes: 60, openHours: "08:45-22:00", needBooking: false, basePrice: 26 },
      { id: "sg-a10", name: "金沙空中花园观景台", area: "滨海湾", durationMinutes: 75, openHours: "11:00-21:00", needBooking: true, basePrice: 32 },
      { id: "sg-a11", name: "新加坡植物园", area: "植物园", durationMinutes: 120, openHours: "05:00-24:00", needBooking: false, basePrice: 0 },
      { id: "sg-a12", name: "艺术科学博物馆", area: "滨海湾", durationMinutes: 90, openHours: "10:00-19:00", needBooking: true, basePrice: 18 },
    ],
    restaurants: [
      { id: "sg-d1", name: "珍宝海鲜（克拉码头）", area: "克拉码头", cuisine: "辣椒螃蟹", durationMinutes: 110, basePrice: 95 },
      { id: "sg-d2", name: "天天海南鸡饭", area: "牛车水", cuisine: "海南鸡饭", durationMinutes: 40, basePrice: 12 },
      { id: "sg-d3", name: "亚坤咖椰吐司", area: "全岛", cuisine: "咖椰吐司", durationMinutes: 30, basePrice: 9 },
      { id: "sg-d4", name: "Odette 法餐厅", area: "市政区", cuisine: "现代法餐", durationMinutes: 150, basePrice: 260 },
      { id: "sg-d5", name: "松发肉骨茶", area: "牛车水", cuisine: "肉骨茶", durationMinutes: 60, basePrice: 28 },
      { id: "sg-d6", name: "老巴刹沙爹街", area: "中央商务区", cuisine: "沙爹烧烤", durationMinutes: 70, basePrice: 32 },
      { id: "sg-d7", name: "Burnt Ends", area: "丹戎巴葛", cuisine: "现代烧烤", durationMinutes: 120, basePrice: 145 },
      { id: "sg-d8", name: "了凡香港油鸡饭面", area: "牛车水", cuisine: "油鸡饭", durationMinutes: 35, basePrice: 10 },
      { id: "sg-d9", name: "Atlas Bar", area: "市政区", cuisine: "金酒酒吧", durationMinutes: 90, basePrice: 68 },
      { id: "sg-d10", name: "328 加东叻沙", area: "加东", cuisine: "叻沙", durationMinutes: 40, basePrice: 14 },
    ],
  },

  曼谷: {
    key: "bangkok",
    name: "曼谷",
    flightMinutes: 250,
    airports: [
      { code: "BKK", name: "素万那普国际机场", terminal: "T1" },
      { code: "DMK", name: "廊曼国际机场", terminal: "T2" },
    ],
    hotels: [
      { id: "bk-h1", name: "曼谷半岛酒店", stars: 5, area: "湄南河畔", address: "333 Charoennakorn Rd", roomType: "河景双床房 46㎡", basePrice: 268 },
      { id: "bk-h2", name: "暹罗凯宾斯基", stars: 5, area: "暹罗", address: "991/9 Rama I Rd", roomType: "豪华双床房 42㎡", basePrice: 232 },
      { id: "bk-h3", name: "素坤逸万豪", stars: 5, area: "素坤逸", address: "2 Sukhumvit Soi 57", roomType: "行政双床房 40㎡", basePrice: 195 },
      { id: "bk-h4", name: "曼谷文华东方", stars: 5, area: "湄南河畔", address: "48 Oriental Ave", roomType: "河景套房 55㎡", basePrice: 385 },
      { id: "bk-h5", name: "考山路 Buddy Lodge", stars: 3, area: "考山路", address: "265 Khaosan Rd", roomType: "标准双床房 22㎡", basePrice: 68 },
      { id: "bk-h6", name: "素坤逸 11 号 Moxy", stars: 4, area: "素坤逸", address: "35 Sukhumvit Soi 11", roomType: "趣享双床房 26㎡", basePrice: 96 },
      { id: "bk-h7", name: "暹罗广场 Ibis", stars: 3, area: "暹罗", address: "927 Rama I Rd", roomType: "标准双床房 20㎡", basePrice: 62 },
      { id: "bk-h8", name: "湄南河畔 Anantara", stars: 5, area: "湄南河畔", address: "257 Charoennakorn Rd", roomType: "河景双床房 44㎡", basePrice: 248 },
    ],
    attractions: [
      { id: "bk-a1", name: "大皇宫 & 玉佛寺", area: "拉塔那古岛", durationMinutes: 180, openHours: "08:30-15:30", needBooking: false, basePrice: 15 },
      { id: "bk-a2", name: "卧佛寺 Wat Pho", area: "拉塔那古岛", durationMinutes: 90, openHours: "08:00-18:30", needBooking: false, basePrice: 6 },
      { id: "bk-a3", name: "郑王庙 Wat Arun", area: "吞武里", durationMinutes: 75, openHours: "08:00-18:00", needBooking: false, basePrice: 4 },
      { id: "bk-a4", name: "湄南河游船晚餐", area: "湄南河", durationMinutes: 120, openHours: "18:00-21:00", needBooking: true, basePrice: 45 },
      { id: "bk-a5", name: "乍都乍周末市场", area: "乍都乍", durationMinutes: 240, openHours: "09:00-18:00", needBooking: false, basePrice: 0 },
      { id: "bk-a6", name: "曼谷艺术文化中心", area: "暹罗", durationMinutes: 90, openHours: "10:00-21:00", needBooking: false, basePrice: 0 },
      { id: "bk-a7", name: "Mahanakhon 天空步道", area: "是隆", durationMinutes: 75, openHours: "10:00-24:00", needBooking: true, basePrice: 30 },
      { id: "bk-a8", name: "丹嫩沙多水上市场", area: "近郊", durationMinutes: 300, openHours: "07:00-17:00", needBooking: true, basePrice: 35 },
      { id: "bk-a9", name: "Asiatique 河滨夜市", area: "湄南河畔", durationMinutes: 150, openHours: "16:00-24:00", needBooking: false, basePrice: 0 },
      { id: "bk-a10", name: "暹罗海洋世界", area: "暹罗", durationMinutes: 120, openHours: "10:00-20:00", needBooking: true, basePrice: 28 },
      { id: "bk-a11", name: "四面佛 Erawan", area: "拉差帕颂", durationMinutes: 45, openHours: "06:00-22:00", needBooking: false, basePrice: 0 },
      { id: "bk-a12", name: "吉姆汤普森故居", area: "暹罗", durationMinutes: 75, openHours: "10:00-18:00", needBooking: false, basePrice: 8 },
    ],
    restaurants: [
      { id: "bk-d1", name: "Jay Fai 痣姐热炒", area: "考山路", cuisine: "街头蟹肉蛋", durationMinutes: 90, basePrice: 72 },
      { id: "bk-d2", name: "Nahm 泰餐厅", area: "是隆", cuisine: "皇室泰餐", durationMinutes: 140, basePrice: 165 },
      { id: "bk-d3", name: "建兴酒家（Somboon）", area: "素坤逸", cuisine: "咖喱蟹", durationMinutes: 100, basePrice: 58 },
      { id: "bk-d4", name: "Thipsamai 帕泰面", area: "考山路", cuisine: "泰式炒河粉", durationMinutes: 45, basePrice: 14 },
      { id: "bk-d5", name: "Blue Elephant 烹饪学校", area: "是隆", cuisine: "泰餐体验", durationMinutes: 210, basePrice: 88 },
      { id: "bk-d6", name: "Or Tor Kor 市场", area: "乍都乍", cuisine: "水果与小吃", durationMinutes: 80, basePrice: 22 },
      { id: "bk-d7", name: "Sirocco 空中餐厅", area: "是隆", cuisine: "地中海", durationMinutes: 150, basePrice: 210 },
      { id: "bk-d8", name: "Taling Pling 泰北菜", area: "素坤逸", cuisine: "泰北风味", durationMinutes: 80, basePrice: 34 },
      { id: "bk-d9", name: "After You 蜜糖吐司", area: "暹罗", cuisine: "甜品", durationMinutes: 40, basePrice: 16 },
      { id: "bk-d10", name: "Kuay Jab Mr. Joe", area: "唐人街", cuisine: "胡椒猪杂汤", durationMinutes: 40, basePrice: 12 },
    ],
  },
};

export const CITY_NAMES = Object.keys(CITIES);
export const DEFAULT_ORIGIN = "上海";
export const ORIGIN_AIRPORTS: Record<string, Airport> = {
  上海: { code: "PVG", name: "浦东国际机场", terminal: "T2" },
  北京: { code: "PEK", name: "首都国际机场", terminal: "T3" },
  广州: { code: "CAN", name: "白云国际机场", terminal: "T2" },
  深圳: { code: "SZX", name: "宝安国际机场", terminal: "T3" },
  香港: { code: "HKG", name: "香港国际机场", terminal: "T1" },
};

/** 航线时刻按航班号稳定生成，避免刷新后时刻跳变 */
export function flightTimes(rng: () => number): { depart: string; arrive: string } {
  const hour = 8 + Math.floor(rng() * 10);
  const minute = [5, 10, 25, 35, 45, 55][Math.floor(rng() * 6)]!;
  const depart = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  return { depart, arrive: "" };
}

export function addMinutes(time: string, minutes: number): string {
  const [h = "0", m = "0"] = time.split(":");
  const total = Number(h) * 60 + Number(m) + minutes;
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export function addDays(date: string, days: number): string {
  const base = new Date(`${date}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}
