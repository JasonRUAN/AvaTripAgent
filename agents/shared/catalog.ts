/**
 * 城市目录（Mock 库存种子，中英双语）。
 *
 * 全部使用真实存在的机场三字码、航司二字码、酒店名、景点名，增强演示可信度。
 * 页面固定标注「演示数据 · 非真实可预订库存」。
 *
 * 每个条目同时携带中英文字段（name / nameEn 等）：
 * 规划需求是中文 → 输出中文字段；是英文 → 输出英文字段。
 */

import type { Locale } from "./locale";
import { pick } from "./locale";

export interface Airport {
  code: string;
  name: string;
  nameEn: string;
  terminal: string;
}

export interface HotelSeed {
  id: string;
  name: string;
  nameEn: string;
  stars: number;
  area: string;
  areaEn: string;
  address: string;
  addressEn: string;
  roomType: string;
  roomTypeEn: string;
  basePrice: number;
}

export interface AttractionSeed {
  id: string;
  name: string;
  nameEn: string;
  area: string;
  areaEn: string;
  durationMinutes: number;
  openHours: string;
  needBooking: boolean;
  basePrice: number;
}

export interface DiningSeed {
  id: string;
  name: string;
  nameEn: string;
  area: string;
  areaEn: string;
  cuisine: string;
  cuisineEn: string;
  durationMinutes: number;
  basePrice: number;
}

export interface CityCatalog {
  key: string;
  name: string;
  nameEn: string;
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
    nameEn: "Tokyo",
    flightMinutes: 195,
    airports: [
      { code: "HND", name: "羽田机场", nameEn: "Haneda Airport", terminal: "T3" },
      { code: "NRT", name: "成田国际机场", nameEn: "Narita International Airport", terminal: "T1" },
    ],
    hotels: [
      { id: "ty-h1", name: "新宿格拉斯丽酒店", nameEn: "Hotel Gracery Shinjuku", stars: 4, area: "新宿", areaEn: "Shinjuku", address: "东京都新宿区歌舞伎町1-19-1", addressEn: "1-19-1 Kabukicho, Shinjuku, Tokyo", roomType: "高级双床房 28㎡", roomTypeEn: "Superior Twin 28㎡", basePrice: 168 },
      { id: "ty-h2", name: "东京湾希尔顿酒店", nameEn: "Hilton Tokyo Odaiba", stars: 5, area: "台场", areaEn: "Odaiba", address: "东京都港区台场1-9-1", addressEn: "1-9-1 Daiba, Minato, Tokyo", roomType: "湾景特大床房 42㎡", roomTypeEn: "Bay View King 42㎡", basePrice: 286 },
      { id: "ty-h3", name: "浅草 View 酒店", nameEn: "Asakusa View Hotel", stars: 4, area: "浅草", areaEn: "Asakusa", address: "东京都台东区西浅草3-17-1", addressEn: "3-17-1 Nishi-Asakusa, Taito, Tokyo", roomType: "和洋室 32㎡", roomTypeEn: "Japanese-Western Room 32㎡", basePrice: 152 },
      { id: "ty-h4", name: "涩谷 Excel Hotel Tokyu", nameEn: "Shibuya Excel Hotel Tokyu", stars: 4, area: "涩谷", areaEn: "Shibuya", address: "东京都涩谷区道玄坂1-12-2", addressEn: "1-12-2 Dogenzaka, Shibuya, Tokyo", roomType: "高层城景双床房 30㎡", roomTypeEn: "High-Floor City View Twin 30㎡", basePrice: 198 },
      { id: "ty-h5", name: "银座大仓 Prestige", nameEn: "The Okura Prestige Ginza", stars: 5, area: "银座", areaEn: "Ginza", address: "东京都中央区银座5-6-1", addressEn: "5-6-1 Ginza, Chuo, Tokyo", roomType: "尊享双床房 45㎡", roomTypeEn: "Deluxe Twin 45㎡", basePrice: 342 },
      { id: "ty-h6", name: "上野三井花园酒店", nameEn: "Mitsui Garden Hotel Ueno", stars: 4, area: "上野", areaEn: "Ueno", address: "东京都台东区上野3-19-7", addressEn: "3-19-7 Ueno, Taito, Tokyo", roomType: "高级双床房 26㎡", roomTypeEn: "Superior Twin 26㎡", basePrice: 145 },
      { id: "ty-h7", name: "东京站大丸前 APA", nameEn: "APA Hotel Tokyo Station Marunouchi", stars: 3, area: "丸之内", areaEn: "Marunouchi", address: "东京都中央区八重洲1-2-9", addressEn: "1-2-9 Yaesu, Chuo, Tokyo", roomType: "双床房 20㎡", roomTypeEn: "Twin 20㎡", basePrice: 112 },
      { id: "ty-h8", name: "六本木 Grand Hyatt", nameEn: "Grand Hyatt Tokyo", stars: 5, area: "六本木", areaEn: "Roppongi", address: "东京都港区六本木6-10-3", addressEn: "6-10-3 Roppongi, Minato, Tokyo", roomType: "庭景双床房 48㎡", roomTypeEn: "Garden View Twin 48㎡", basePrice: 405 },
    ],
    attractions: [
      { id: "ty-a1", name: "teamLab Planets TOKYO", nameEn: "teamLab Planets TOKYO", area: "台场", areaEn: "Odaiba", durationMinutes: 120, openHours: "10:00-19:00", needBooking: true, basePrice: 32 },
      { id: "ty-a2", name: "浅草寺 & 仲见世通", nameEn: "Senso-ji & Nakamise Street", area: "浅草", areaEn: "Asakusa", durationMinutes: 90, openHours: "06:00-17:00", needBooking: false, basePrice: 0 },
      { id: "ty-a3", name: "SHIBUYA SKY 展望台", nameEn: "SHIBUYA SKY Observation Deck", area: "涩谷", areaEn: "Shibuya", durationMinutes: 75, openHours: "10:00-22:30", needBooking: true, basePrice: 25 },
      { id: "ty-a4", name: "东京晴空塔展望台", nameEn: "Tokyo Skytree Deck", area: "押上", areaEn: "Oshiage", durationMinutes: 90, openHours: "10:00-21:00", needBooking: true, basePrice: 28 },
      { id: "ty-a5", name: "上野恩赐公园 & 东京国立博物馆", nameEn: "Ueno Park & Tokyo National Museum", area: "上野", areaEn: "Ueno", durationMinutes: 150, openHours: "09:30-17:00", needBooking: false, basePrice: 10 },
      { id: "ty-a6", name: "明治神宫", nameEn: "Meiji Shrine", area: "原宿", areaEn: "Harajuku", durationMinutes: 60, openHours: "06:40-16:20", needBooking: false, basePrice: 0 },
      { id: "ty-a7", name: "新宿御苑", nameEn: "Shinjuku Gyoen", area: "新宿", areaEn: "Shinjuku", durationMinutes: 75, openHours: "09:00-16:00", needBooking: false, basePrice: 5 },
      { id: "ty-a8", name: "筑地场外市场", nameEn: "Tsukiji Outer Market", area: "筑地", areaEn: "Tsukiji", durationMinutes: 60, openHours: "05:00-14:00", needBooking: false, basePrice: 0 },
      { id: "ty-a9", name: "东京迪士尼海洋", nameEn: "Tokyo DisneySea", area: "舞滨", areaEn: "Maihama", durationMinutes: 480, openHours: "09:00-21:00", needBooking: true, basePrice: 76 },
      { id: "ty-a10", name: "六本木森美术馆", nameEn: "Mori Art Museum", area: "六本木", areaEn: "Roppongi", durationMinutes: 120, openHours: "10:00-22:00", needBooking: true, basePrice: 20 },
      { id: "ty-a11", name: "隅田川游船", nameEn: "Sumida River Cruise", area: "浅草", areaEn: "Asakusa", durationMinutes: 40, openHours: "10:00-18:00", needBooking: false, basePrice: 22 },
      { id: "ty-a12", name: "三鹰之森吉卜力美术馆", nameEn: "Ghibli Museum Mitaka", area: "三鹰", areaEn: "Mitaka", durationMinutes: 150, openHours: "10:00-18:00", needBooking: true, basePrice: 15 },
    ],
    restaurants: [
      { id: "ty-d1", name: "鮨 うえの（银座）", nameEn: "Sushi Ueno (Ginza)", area: "银座", areaEn: "Ginza", cuisine: "江户前寿司", cuisineEn: "Edomae Sushi", durationMinutes: 90, basePrice: 180 },
      { id: "ty-d2", name: "天ぷら 天源（新宿）", nameEn: "Tempura Tengen (Shinjuku)", area: "新宿", areaEn: "Shinjuku", cuisine: "天妇罗", cuisineEn: "Tempura", durationMinutes: 75, basePrice: 95 },
      { id: "ty-d3", name: "一兰拉面 本店", nameEn: "Ichiran Ramen", area: "涩谷", areaEn: "Shibuya", cuisine: "豚骨拉面", cuisineEn: "Tonkotsu Ramen", durationMinutes: 45, basePrice: 18 },
      { id: "ty-d4", name: "蟹道乐 新宿本店", nameEn: "Kani Doraku Shinjuku", area: "新宿", areaEn: "Shinjuku", cuisine: "蟹料理", cuisineEn: "Crab Cuisine", durationMinutes: 120, basePrice: 150 },
      { id: "ty-d5", name: "叙叙苑 六本木", nameEn: "Jojoen Roppongi", area: "六本木", areaEn: "Roppongi", cuisine: "烧肉", cuisineEn: "Yakiniku", durationMinutes: 110, basePrice: 130 },
      { id: "ty-d6", name: "鳗鱼饭 川千家", nameEn: "Unagi Kawachoya", area: "浅草", areaEn: "Asakusa", cuisine: "鳗鱼", cuisineEn: "Eel (Unagi)", durationMinutes: 70, basePrice: 88 },
      { id: "ty-d7", name: "Blue Bottle 清澄白河", nameEn: "Blue Bottle Coffee Kiyosumi", area: "清澄白河", areaEn: "Kiyosumi-Shirakawa", cuisine: "精品咖啡", cuisineEn: "Specialty Coffee", durationMinutes: 40, basePrice: 12 },
      { id: "ty-d8", name: "大黑家 天妇罗", nameEn: "Daikokuya Tempura", area: "浅草", areaEn: "Asakusa", cuisine: "天妇罗", cuisineEn: "Tempura", durationMinutes: 60, basePrice: 42 },
      { id: "ty-d9", name: "鸟贵族 涩谷店", nameEn: "Torikizoku Shibuya", area: "涩谷", areaEn: "Shibuya", cuisine: "烤鸡串", cuisineEn: "Yakitori", durationMinutes: 90, basePrice: 32 },
      { id: "ty-d10", name: "afuri 柚子盐拉面", nameEn: "Afuri Yuzu Shio Ramen", area: "惠比寿", areaEn: "Ebisu", cuisine: "柚子盐拉面", cuisineEn: "Yuzu Shio Ramen", durationMinutes: 45, basePrice: 20 },
    ],
  },

  新加坡: {
    key: "singapore",
    name: "新加坡",
    nameEn: "Singapore",
    flightMinutes: 335,
    airports: [
      { code: "SIN", name: "樟宜机场", nameEn: "Changi Airport", terminal: "T3" },
      { code: "XSP", name: "实里达机场", nameEn: "Seletar Airport", terminal: "T1" },
    ],
    hotels: [
      { id: "sg-h1", name: "滨海湾金沙酒店", nameEn: "Marina Bay Sands", stars: 5, area: "滨海湾", areaEn: "Marina Bay", address: "10 Bayfront Ave", addressEn: "10 Bayfront Ave", roomType: "城景双床房 45㎡", roomTypeEn: "City View Twin 45㎡", basePrice: 420 },
      { id: "sg-h2", name: "莱佛士酒店", nameEn: "Raffles Hotel", stars: 5, area: "市政区", areaEn: "Civic District", address: "1 Beach Rd", addressEn: "1 Beach Rd", roomType: "殖民套房 60㎡", roomTypeEn: "Colonial Suite 60㎡", basePrice: 510 },
      { id: "sg-h3", name: "乌节路泛太平洋", nameEn: "Pan Pacific Orchard", stars: 5, area: "乌节路", areaEn: "Orchard Road", address: "10 Claymore Rd", addressEn: "10 Claymore Rd", roomType: "高级双床房 38㎡", roomTypeEn: "Superior Twin 38㎡", basePrice: 245 },
      { id: "sg-h4", name: "圣淘沙香格里拉", nameEn: "Shangri-La Sentosa", stars: 5, area: "圣淘沙", areaEn: "Sentosa", address: "101 Siloso Rd", addressEn: "101 Siloso Rd", roomType: "海景双床房 42㎡", roomTypeEn: "Sea View Twin 42㎡", basePrice: 320 },
      { id: "sg-h5", name: "牛车水 Hotel 1888", nameEn: "Hotel 1888 Chinatown", stars: 4, area: "牛车水", areaEn: "Chinatown", address: "20 Cross St", addressEn: "20 Cross St", roomType: "精品双床房 24㎡", roomTypeEn: "Boutique Twin 24㎡", basePrice: 138 },
      { id: "sg-h6", name: "小印度 Parkroyal", nameEn: "Parkroyal Little India", stars: 4, area: "小印度", areaEn: "Little India", address: "181 Kitchener Rd", addressEn: "181 Kitchener Rd", roomType: "高级双床房 26㎡", roomTypeEn: "Superior Twin 26㎡", basePrice: 126 },
      { id: "sg-h7", name: "克拉码头 M Social", nameEn: "M Social Clarke Quay", stars: 4, area: "克拉码头", areaEn: "Clarke Quay", address: "90 Robertson Quay", addressEn: "90 Robertson Quay", roomType: "Aura 双床房 25㎡", roomTypeEn: "Aura Twin 25㎡", basePrice: 158 },
      { id: "sg-h8", name: "樟宜皇冠假日", nameEn: "Crowne Plaza Changi", stars: 4, area: "樟宜", areaEn: "Changi", address: "75 Airport Blvd", addressEn: "75 Airport Blvd", roomType: "高级双床房 30㎡", roomTypeEn: "Superior Twin 30㎡", basePrice: 172 },
    ],
    attractions: [
      { id: "sg-a1", name: "滨海湾花园 & 空中步道", nameEn: "Gardens by the Bay & Skyway", area: "滨海湾", areaEn: "Marina Bay", durationMinutes: 150, openHours: "09:00-21:00", needBooking: true, basePrice: 28 },
      { id: "sg-a2", name: "新加坡环球影城", nameEn: "Universal Studios Singapore", area: "圣淘沙", areaEn: "Sentosa", durationMinutes: 420, openHours: "10:00-19:00", needBooking: true, basePrice: 82 },
      { id: "sg-a3", name: "鱼尾狮公园", nameEn: "Merlion Park", area: "滨海湾", areaEn: "Marina Bay", durationMinutes: 45, openHours: "全天", needBooking: false, basePrice: 0 },
      { id: "sg-a4", name: "新加坡国家美术馆", nameEn: "National Gallery Singapore", area: "市政区", areaEn: "Civic District", durationMinutes: 120, openHours: "10:00-19:00", needBooking: false, basePrice: 15 },
      { id: "sg-a5", name: "S.E.A. 海洋馆", nameEn: "S.E.A. Aquarium", area: "圣淘沙", areaEn: "Sentosa", durationMinutes: 180, openHours: "10:00-19:00", needBooking: true, basePrice: 38 },
      { id: "sg-a6", name: "新加坡动物园", nameEn: "Singapore Zoo", area: "万礼", areaEn: "Mandai", durationMinutes: 300, openHours: "08:30-18:00", needBooking: true, basePrice: 42 },
      { id: "sg-a7", name: "夜间野生动物园", nameEn: "Night Safari", area: "万礼", areaEn: "Mandai", durationMinutes: 180, openHours: "19:15-24:00", needBooking: true, basePrice: 40 },
      { id: "sg-a8", name: "哈芝巷 & 苏丹回教堂", nameEn: "Haji Lane & Sultan Mosque", area: "甘榜格南", areaEn: "Kampong Glam", durationMinutes: 90, openHours: "10:00-22:00", needBooking: false, basePrice: 0 },
      { id: "sg-a9", name: "新加坡缆车（花柏山线）", nameEn: "Singapore Cable Car (Mount Faber Line)", area: "花柏山", areaEn: "Mount Faber", durationMinutes: 60, openHours: "08:45-22:00", needBooking: false, basePrice: 26 },
      { id: "sg-a10", name: "金沙空中花园观景台", nameEn: "Sands SkyPark Observation Deck", area: "滨海湾", areaEn: "Marina Bay", durationMinutes: 75, openHours: "11:00-21:00", needBooking: true, basePrice: 32 },
      { id: "sg-a11", name: "新加坡植物园", nameEn: "Singapore Botanic Gardens", area: "植物园", areaEn: "Botanic Gardens", durationMinutes: 120, openHours: "05:00-24:00", needBooking: false, basePrice: 0 },
      { id: "sg-a12", name: "艺术科学博物馆", nameEn: "ArtScience Museum", area: "滨海湾", areaEn: "Marina Bay", durationMinutes: 90, openHours: "10:00-19:00", needBooking: true, basePrice: 18 },
    ],
    restaurants: [
      { id: "sg-d1", name: "珍宝海鲜（克拉码头）", nameEn: "Jumbo Seafood (Clarke Quay)", area: "克拉码头", areaEn: "Clarke Quay", cuisine: "辣椒螃蟹", cuisineEn: "Chili Crab", durationMinutes: 110, basePrice: 95 },
      { id: "sg-d2", name: "天天海南鸡饭", nameEn: "Tian Tian Chicken Rice", area: "牛车水", areaEn: "Chinatown", cuisine: "海南鸡饭", cuisineEn: "Hainanese Chicken Rice", durationMinutes: 40, basePrice: 12 },
      { id: "sg-d3", name: "亚坤咖椰吐司", nameEn: "Ya Kun Kaya Toast", area: "全岛", areaEn: "Islandwide", cuisine: "咖椰吐司", cuisineEn: "Kaya Toast", durationMinutes: 30, basePrice: 9 },
      { id: "sg-d4", name: "Odette 法餐厅", nameEn: "Odette", area: "市政区", areaEn: "Civic District", cuisine: "现代法餐", cuisineEn: "Modern French", durationMinutes: 150, basePrice: 260 },
      { id: "sg-d5", name: "松发肉骨茶", nameEn: "Song Fa Bak Kut Teh", area: "牛车水", areaEn: "Chinatown", cuisine: "肉骨茶", cuisineEn: "Bak Kut Teh", durationMinutes: 60, basePrice: 28 },
      { id: "sg-d6", name: "老巴刹沙爹街", nameEn: "Lau Pa Sat Satay Street", area: "中央商务区", areaEn: "CBD", cuisine: "沙爹烧烤", cuisineEn: "Satay BBQ", durationMinutes: 70, basePrice: 32 },
      { id: "sg-d7", name: "Burnt Ends", nameEn: "Burnt Ends", area: "丹戎巴葛", areaEn: "Tanjong Pagar", cuisine: "现代烧烤", cuisineEn: "Modern BBQ", durationMinutes: 120, basePrice: 145 },
      { id: "sg-d8", name: "了凡香港油鸡饭面", nameEn: "Liao Fan Soya Sauce Chicken", area: "牛车水", areaEn: "Chinatown", cuisine: "油鸡饭", cuisineEn: "Soya Sauce Chicken Rice", durationMinutes: 35, basePrice: 10 },
      { id: "sg-d9", name: "Atlas Bar", nameEn: "Atlas Bar", area: "市政区", areaEn: "Civic District", cuisine: "金酒酒吧", cuisineEn: "Gin Bar", durationMinutes: 90, basePrice: 68 },
      { id: "sg-d10", name: "328 加东叻沙", nameEn: "328 Katong Laksa", area: "加东", areaEn: "Katong", cuisine: "叻沙", cuisineEn: "Laksa", durationMinutes: 40, basePrice: 14 },
    ],
  },

  曼谷: {
    key: "bangkok",
    name: "曼谷",
    nameEn: "Bangkok",
    flightMinutes: 250,
    airports: [
      { code: "BKK", name: "素万那普国际机场", nameEn: "Suvarnabhumi Airport", terminal: "T1" },
      { code: "DMK", name: "廊曼国际机场", nameEn: "Don Mueang International Airport", terminal: "T2" },
    ],
    hotels: [
      { id: "bk-h1", name: "曼谷半岛酒店", nameEn: "The Peninsula Bangkok", stars: 5, area: "湄南河畔", areaEn: "Chao Phraya Riverside", address: "333 Charoennakorn Rd", addressEn: "333 Charoennakorn Rd", roomType: "河景双床房 46㎡", roomTypeEn: "River View Twin 46㎡", basePrice: 268 },
      { id: "bk-h2", name: "暹罗凯宾斯基", nameEn: "Siam Kempinski", stars: 5, area: "暹罗", areaEn: "Siam", address: "991/9 Rama I Rd", addressEn: "991/9 Rama I Rd", roomType: "豪华双床房 42㎡", roomTypeEn: "Deluxe Twin 42㎡", basePrice: 232 },
      { id: "bk-h3", name: "素坤逸万豪", nameEn: "Bangkok Marriott Sukhumvit", stars: 5, area: "素坤逸", areaEn: "Sukhumvit", address: "2 Sukhumvit Soi 57", addressEn: "2 Sukhumvit Soi 57", roomType: "行政双床房 40㎡", roomTypeEn: "Executive Twin 40㎡", basePrice: 195 },
      { id: "bk-h4", name: "曼谷文华东方", nameEn: "Mandarin Oriental Bangkok", stars: 5, area: "湄南河畔", areaEn: "Chao Phraya Riverside", address: "48 Oriental Ave", addressEn: "48 Oriental Ave", roomType: "河景套房 55㎡", roomTypeEn: "River View Suite 55㎡", basePrice: 385 },
      { id: "bk-h5", name: "考山路 Buddy Lodge", nameEn: "Buddy Lodge Khaosan", stars: 3, area: "考山路", areaEn: "Khaosan Road", address: "265 Khaosan Rd", addressEn: "265 Khaosan Rd", roomType: "标准双床房 22㎡", roomTypeEn: "Standard Twin 22㎡", basePrice: 68 },
      { id: "bk-h6", name: "素坤逸 11 号 Moxy", nameEn: "Moxy Sukhumvit 11", stars: 4, area: "素坤逸", areaEn: "Sukhumvit", address: "35 Sukhumvit Soi 11", addressEn: "35 Sukhumvit Soi 11", roomType: "趣享双床房 26㎡", roomTypeEn: "Fun Twin 26㎡", basePrice: 96 },
      { id: "bk-h7", name: "暹罗广场 Ibis", nameEn: "Ibis Siam Square", stars: 3, area: "暹罗", areaEn: "Siam", address: "927 Rama I Rd", addressEn: "927 Rama I Rd", roomType: "标准双床房 20㎡", roomTypeEn: "Standard Twin 20㎡", basePrice: 62 },
      { id: "bk-h8", name: "湄南河畔 Anantara", nameEn: "Anantara Riverside", stars: 5, area: "湄南河畔", areaEn: "Chao Phraya Riverside", address: "257 Charoennakorn Rd", addressEn: "257 Charoennakorn Rd", roomType: "河景双床房 44㎡", roomTypeEn: "River View Twin 44㎡", basePrice: 248 },
    ],
    attractions: [
      { id: "bk-a1", name: "大皇宫 & 玉佛寺", nameEn: "Grand Palace & Wat Phra Kaew", area: "拉塔那古岛", areaEn: "Rattanakosin", durationMinutes: 180, openHours: "08:30-15:30", needBooking: false, basePrice: 15 },
      { id: "bk-a2", name: "卧佛寺 Wat Pho", nameEn: "Wat Pho", area: "拉塔那古岛", areaEn: "Rattanakosin", durationMinutes: 90, openHours: "08:00-18:30", needBooking: false, basePrice: 6 },
      { id: "bk-a3", name: "郑王庙 Wat Arun", nameEn: "Wat Arun", area: "吞武里", areaEn: "Thonburi", durationMinutes: 75, openHours: "08:00-18:00", needBooking: false, basePrice: 4 },
      { id: "bk-a4", name: "湄南河游船晚餐", nameEn: "Chao Phraya Dinner Cruise", area: "湄南河", areaEn: "Chao Phraya River", durationMinutes: 120, openHours: "18:00-21:00", needBooking: true, basePrice: 45 },
      { id: "bk-a5", name: "乍都乍周末市场", nameEn: "Chatuchak Weekend Market", area: "乍都乍", areaEn: "Chatuchak", durationMinutes: 240, openHours: "09:00-18:00", needBooking: false, basePrice: 0 },
      { id: "bk-a6", name: "曼谷艺术文化中心", nameEn: "Bangkok Art & Culture Centre", area: "暹罗", areaEn: "Siam", durationMinutes: 90, openHours: "10:00-21:00", needBooking: false, basePrice: 0 },
      { id: "bk-a7", name: "Mahanakhon 天空步道", nameEn: "Mahanakhon SkyWalk", area: "是隆", areaEn: "Silom", durationMinutes: 75, openHours: "10:00-24:00", needBooking: true, basePrice: 30 },
      { id: "bk-a8", name: "丹嫩沙多水上市场", nameEn: "Damnoen Saduak Floating Market", area: "近郊", areaEn: "Outskirts", durationMinutes: 300, openHours: "07:00-17:00", needBooking: true, basePrice: 35 },
      { id: "bk-a9", name: "Asiatique 河滨夜市", nameEn: "Asiatique The Riverfront", area: "湄南河畔", areaEn: "Chao Phraya Riverside", durationMinutes: 150, openHours: "16:00-24:00", needBooking: false, basePrice: 0 },
      { id: "bk-a10", name: "暹罗海洋世界", nameEn: "SEA LIFE Bangkok Ocean World", area: "暹罗", areaEn: "Siam", durationMinutes: 120, openHours: "10:00-20:00", needBooking: true, basePrice: 28 },
      { id: "bk-a11", name: "四面佛 Erawan", nameEn: "Erawan Shrine", area: "拉差帕颂", areaEn: "Ratchaprasong", durationMinutes: 45, openHours: "06:00-22:00", needBooking: false, basePrice: 0 },
      { id: "bk-a12", name: "吉姆汤普森故居", nameEn: "Jim Thompson House", area: "暹罗", areaEn: "Siam", durationMinutes: 75, openHours: "10:00-18:00", needBooking: false, basePrice: 8 },
    ],
    restaurants: [
      { id: "bk-d1", name: "Jay Fai 痣姐热炒", nameEn: "Jay Fai", area: "考山路", areaEn: "Khaosan Road", cuisine: "街头蟹肉蛋", cuisineEn: "Crab Omelette", durationMinutes: 90, basePrice: 72 },
      { id: "bk-d2", name: "Nahm 泰餐厅", nameEn: "Nahm", area: "是隆", areaEn: "Silom", cuisine: "皇室泰餐", cuisineEn: "Royal Thai Cuisine", durationMinutes: 140, basePrice: 165 },
      { id: "bk-d3", name: "建兴酒家（Somboon）", nameEn: "Somboon Seafood", area: "素坤逸", areaEn: "Sukhumvit", cuisine: "咖喱蟹", cuisineEn: "Curry Crab", durationMinutes: 100, basePrice: 58 },
      { id: "bk-d4", name: "Thipsamai 帕泰面", nameEn: "Thipsamai Pad Thai", area: "考山路", areaEn: "Khaosan Road", cuisine: "泰式炒河粉", cuisineEn: "Pad Thai", durationMinutes: 45, basePrice: 14 },
      { id: "bk-d5", name: "Blue Elephant 烹饪学校", nameEn: "Blue Elephant Cooking School", area: "是隆", areaEn: "Silom", cuisine: "泰餐体验", cuisineEn: "Thai Dining Experience", durationMinutes: 210, basePrice: 88 },
      { id: "bk-d6", name: "Or Tor Kor 市场", nameEn: "Or Tor Kor Market", area: "乍都乍", areaEn: "Chatuchak", cuisine: "水果与小吃", cuisineEn: "Fruits & Snacks", durationMinutes: 80, basePrice: 22 },
      { id: "bk-d7", name: "Sirocco 空中餐厅", nameEn: "Sirocco Sky Bar", area: "是隆", areaEn: "Silom", cuisine: "地中海", cuisineEn: "Mediterranean", durationMinutes: 150, basePrice: 210 },
      { id: "bk-d8", name: "Taling Pling 泰北菜", nameEn: "Taling Pling", area: "素坤逸", areaEn: "Sukhumvit", cuisine: "泰北风味", cuisineEn: "Northern Thai", durationMinutes: 80, basePrice: 34 },
      { id: "bk-d9", name: "After You 蜜糖吐司", nameEn: "After You Dessert Cafe", area: "暹罗", areaEn: "Siam", cuisine: "甜品", cuisineEn: "Dessert", durationMinutes: 40, basePrice: 16 },
      { id: "bk-d10", name: "Kuay Jab Mr. Joe", nameEn: "Kuay Jab Mr. Joe", area: "唐人街", areaEn: "Chinatown", cuisine: "胡椒猪杂汤", cuisineEn: "Pepper Pork Soup", durationMinutes: 40, basePrice: 12 },
    ],
  },
};

export const CITY_NAMES = Object.keys(CITIES);

/** 出发城市（表单/解析层统一用中文规范名），英文展示名在这里翻译 */
export const ORIGIN_CITY_EN: Record<string, string> = {
  上海: "Shanghai",
  北京: "Beijing",
  广州: "Guangzhou",
  深圳: "Shenzhen",
  香港: "Hong Kong",
};

export const DEFAULT_ORIGIN = "上海";

export const ORIGIN_AIRPORTS: Record<string, Airport> = {
  上海: { code: "PVG", name: "浦东国际机场", nameEn: "Shanghai Pudong International Airport", terminal: "T2" },
  北京: { code: "PEK", name: "首都国际机场", nameEn: "Beijing Capital International Airport", terminal: "T3" },
  广州: { code: "CAN", name: "白云国际机场", nameEn: "Guangzhou Baiyun International Airport", terminal: "T2" },
  深圳: { code: "SZX", name: "宝安国际机场", nameEn: "Shenzhen Bao'an International Airport", terminal: "T3" },
  香港: { code: "HKG", name: "香港国际机场", nameEn: "Hong Kong International Airport", terminal: "T1" },
};

// ---------------------------------------------------------------- 取值辅助

/** 中文名 / 英文名都能找到城市目录；找不到回退东京 */
export function findCity(name: string): CityCatalog | undefined {
  const target = name.trim().toLowerCase();
  if (!target) return undefined;
  for (const city of Object.values(CITIES)) {
    if (city.name === name || city.nameEn.toLowerCase() === target) return city;
  }
  return undefined;
}

function cityOf(name: string): CityCatalog {
  return findCity(name) ?? CITIES["东京"]!;
}

function originAirport(origin: string) {
  return ORIGIN_AIRPORTS[origin] ?? ORIGIN_AIRPORTS[DEFAULT_ORIGIN]!;
}

/** 城市展示名：出发城市查 ORIGIN_CITY_EN，目的地查目录 nameEn */
export function cityName(name: string, locale: Locale): string {
  if (locale === "en") return ORIGIN_CITY_EN[name] ?? cityOf(name).nameEn;
  return name;
}

/** 出发地机场（按语言取名字） */
export function originAirportOf(origin: string, locale: Locale): Airport {
  const airport = originAirport(origin);
  return locale === "en" ? { ...airport, name: airport.nameEn } : airport;
}

/** 目的地机场（按语言取名字） */
export function cityAirportOf(destination: string, index: number, locale: Locale): Airport {
  const city = cityOf(destination);
  const airport = city.airports[index] ?? city.airports[0]!;
  return locale === "en" ? { ...airport, name: airport.nameEn } : airport;
}

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
