/** 常见五字码 / 简称 → 中文港名（用于卡片展示；未知则原样显示） */
const PORT_ZH: Record<string, string> = {
  CNSHA: "上海",
  CNNBO: "宁波",
  CNQIN: "青岛",
  CNTXG: "天津新港",
  CNYTN: "盐田",
  CNSHK: "蛇口",
  CNNSA: "南沙",
  CNFOC: "福州",
  CNXIAMEN: "厦门",
  CNXMN: "厦门",
  CNHUA: "黄埔",
  CNZOS: "舟山",
  HKHKG: "香港",
  TWKHH: "高雄",
  TWTXG: "台中",
  USLAX: "洛杉矶",
  USLGB: "长滩",
  USNYC: "纽约",
  USSEA: "西雅图",
  USOAK: "奥克兰",
  USHOU: "休斯顿",
  USCHI: "芝加哥",
  USMIA: "迈阿密",
  USORF: "诺福克",
  USATL: "亚特兰大",
  USMEM: "孟菲斯",
  USCHS: "查尔斯顿",
  USMOB: "莫比尔",
  USMOBILE: "莫比尔",
  DEHAM: "汉堡",
  NLRTM: "鹿特丹",
  BEANR: "安特卫普",
  GBFXT: "费利克斯托",
  GBFXS: "费利克斯托",
  FRLEH: "勒阿弗尔",
  ITGOA: "热那亚",
  ESBCN: "巴塞罗那",
  ESVAL: "瓦伦西亚",
  AUMEL: "墨尔本",
  AUSYD: "悉尼",
  AUBNE: "布里斯班",
  JPTYO: "东京",
  JPYOK: "横滨",
  JPOSA: "大阪",
  JPNGO: "名古屋",
  JPFUK: "福冈",
  KRPUS: "釜山",
  KRINC: "仁川",
  SGSIN: "新加坡",
  MYLGK: "巴生",
  MYPKG: "槟城",
  THLCH: "林查班",
  VNSGN: "胡志明",
  VNHPH: "海防",
  IDJKT: "雅加达",
  PHMNL: "马尼拉",
  INNSA: "那瓦舍瓦",
  INMUN: "孟买",
  AEJEA: "杰贝阿里",
  SAJED: "吉达",
  ZADUR: "德班",
  BRSSZ: "桑托斯",
  CLSAI: "圣安东尼奥",
  MXZLO: "曼萨尼约",
  CATORONTO: "多伦多",
  CAVAN: "温哥华",
  CAMTR: "蒙特利尔",
};

/**
 * 返回展示用港口文案：若能映射中文则「中文（原码）」，已有中文则原样。
 */
export function formatPortDisplay(value?: string | null): string {
  if (value == null || String(value).trim() === "") return "—";
  const t = String(value).trim();
  if (/[\u4e00-\u9fff]/.test(t)) return t;
  const key = t.toUpperCase().replace(/\s+/g, "");
  const zh = PORT_ZH[key];
  if (zh) return `${zh}（${t}）`;
  return t;
}
