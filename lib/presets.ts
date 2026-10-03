export type Sel = { emo: number; lv: number; style: number; region: number };

export const EMO = [
  { k: 'Vui tươi', c: '#f5c542', en: 'cheerful and bright, smiling while speaking', spd: 1 },
  { k: 'Hào hứng', c: '#ff8a3d', en: 'excited and energetic', spd: 1 },
  { k: 'Lôi cuốn', c: '#ff6b5a', en: 'captivating and charismatic, drawing the listener in', spd: 0 },
  { k: 'Da diết', c: '#e0567f', en: 'yearning and heartfelt, deeply emotional', spd: -1 },
  { k: 'Trầm buồn', c: '#a77be0', en: 'melancholic and sad, heavy-hearted', spd: -1 },
  { k: 'Thì thầm', c: '#6b8cf0', en: 'whispering, soft and intimate', spd: -1 },
  { k: 'Lạnh lùng', c: '#4fb8cc', en: 'cold, detached and restrained', spd: 0 },
  { k: 'Tự tin', c: '#72cf7e', en: 'confident, assertive and clear', spd: 0 },
];

export const LV_VI = ['rất nhẹ', 'nhẹ', 'vừa', 'rõ', 'mạnh'];
export const LV_EN = ['very subtle', 'subtle', 'moderate', 'strong', 'very intense'];

export const STYLES = [
  { k: 'Kể chuyện', en: 'a storyteller telling a folk tale, unhurried, with natural dramatic pauses', spd: -1 },
  { k: 'Đọc thơ', en: 'poetry recitation, rhythmic, lingering at the end of each line', spd: -1 },
  { k: 'Trò chuyện', en: 'a casual everyday conversation with a friend', spd: 0 },
  { k: 'Đọc tin', en: 'a news anchor, crisp and articulate', spd: 0 },
  { k: 'Quảng cáo', en: 'a commercial voice-over, warm and persuasive', spd: 1 },
  { k: 'Thuyết minh', en: 'documentary narration, calm and immersive', spd: 0 },
];

export const REGIONS = [
  { k: 'Bắc', en: 'a Northern Vietnamese (Hanoi) accent', fpt: 'banmai' },
  { k: 'Trung', en: 'a Central Vietnamese (Hue) accent', fpt: 'myan' },
  { k: 'Nam', en: 'a Southern Vietnamese (Mekong Delta) accent', fpt: 'lannhi' },
];

export const G_MODELS: [string, string][] = [
  ['gemini-2.5-flash-preview-tts', 'gemini-2.5-flash-preview-tts (nhanh)'],
  ['gemini-2.5-pro-preview-tts', 'gemini-2.5-pro-preview-tts (biểu cảm hơn)'],
];

export const G_VOICES: [string, string][] = [
  ['Kore', 'Kore · nữ, chắc giọng'], ['Aoede', 'Aoede · nữ, nhẹ nhàng'], ['Leda', 'Leda · nữ, trẻ'],
  ['Sulafat', 'Sulafat · nữ, ấm'], ['Achernar', 'Achernar · nữ, mềm'], ['Puck', 'Puck · nam, tươi'],
  ['Charon', 'Charon · nam, rõ ràng'], ['Fenrir', 'Fenrir · nam, sôi nổi'], ['Orus', 'Orus · nam, chắc'],
  ['Gacrux', 'Gacrux · nam, trầm'], ['Enceladus', 'Enceladus · hơi thở'], ['Zephyr', 'Zephyr · sáng'],
];

export const F_VOICES: [string, string][] = [
  ['auto', 'Tự chọn theo vùng miền'],
  ['banmai', 'Ban Mai · nữ Bắc'], ['thuminh', 'Thu Minh · nữ Bắc'], ['leminh', 'Lê Minh · nam Bắc'],
  ['myan', 'Mỹ An · nữ Trung'], ['ngoclam', 'Ngọc Lam · nữ Trung'], ['giahuy', 'Gia Huy · nam Trung'],
  ['lannhi', 'Lan Nhi · nữ Nam'], ['linhsan', 'Linh San · nữ Nam'], ['minhquang', 'Minh Quang · nam Nam'],
];
export const FPT_VOICE_IDS = F_VOICES.map(([v]) => v).filter((v) => v !== 'auto');

export function geminiPrompt(s: Sel, text: string) {
  const e = EMO[s.emo], st = STYLES[s.style], r = REGIONS[s.region];
  return (
    `Read the following Vietnamese text aloud in ${r.en}, in the manner of ${st.en}. ` +
    `Emotion: ${e.en}, at a ${LV_EN[s.lv - 1]} intensity (${s.lv}/5). ` +
    `Breathe and pause naturally like a real human voice actor, never robotic:\n\n${text.trim()}`
  );
}

/** FPT.AI không có tham số cảm xúc: quy đổi sang speed + ngắt nghỉ */
export function fptParams(s: Sel, text: string, voiceChoice: string) {
  const e = EMO[s.emo], st = STYLES[s.style];
  const lvScale = s.lv >= 4 ? 2 : s.lv >= 2 ? 1 : 0;
  const speed = Math.max(-3, Math.min(3, e.spd * lvScale + st.spd));
  let t = text.trim();
  if (e.spd < 0 && s.lv >= 3) t = t.replace(/,\s*/g, '..., ');
  if (st.k === 'Đọc thơ') t = t.replace(/\n+/g, '...\n');
  const voice = voiceChoice === 'auto' ? REGIONS[s.region].fpt : voiceChoice;
  return { speed, text: t, voice };
}
