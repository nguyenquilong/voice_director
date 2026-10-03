import { FPT_VOICE_IDS } from '@/lib/presets';

export const runtime = 'nodejs';
export const maxDuration = 60;

const err = (msg: string, status: number) => Response.json({ error: msg }, { status });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  // ưu tiên biến môi trường, nếu không có thì dùng key người dùng nhập trong Cài đặt
  const key = process.env.FPT_API_KEY || (typeof body?.apiKey === 'string' ? body.apiKey.trim() : '');
  if (!key) return err('Chưa có FPT_API_KEY: thêm vào .env.local hoặc nhập API key trong Cài đặt', 400);
  const text = body?.text;
  if (typeof text !== 'string' || !text.trim()) return err('Thiếu lời thoại', 400);
  if (text.length > 5000) return err('FPT.AI giới hạn 5.000 ký tự mỗi lần', 400);

  const voice = String(body?.voice || 'banmai');
  if (!FPT_VOICE_IDS.includes(voice)) return err('Giọng FPT không hợp lệ', 400);
  const speed = Math.max(-3, Math.min(3, Math.round(Number(body?.speed) || 0)));

  const endpoint = process.env.FPT_TTS_URL || 'https://api.fpt.ai/hmi/tts/v5';
  const r = await fetch(endpoint, {
    method: 'POST',
    headers: { 'api-key': key, voice, speed: String(speed) },
    body: text,
  }).catch(() => null);
  if (!r) return err('Không kết nối được tới FPT.AI', 502);

  const j = await r.json().catch(() => ({}));
  if (!r.ok || j?.error) return err(`FPT.AI trả lỗi ${r.status}: ${j?.message ?? 'không rõ lý do'}`, 502);

  const url: string | undefined = j?.async;
  if (!url) return err('FPT.AI không trả về link âm thanh', 502);

  // FPT tạo file mp3 bất đồng bộ: server tự chờ tới khi tải được rồi trả thẳng cho client
  const deadline = Date.now() + 50_000;
  while (Date.now() < deadline) {
    const a = await fetch(url, { cache: 'no-store' }).catch(() => null);
    if (a?.ok) {
      const buf = new Uint8Array(await a.arrayBuffer());
      if (buf.length > 1000) {
        return new Response(buf, { headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store' } });
      }
    }
    await sleep(1500);
  }
  return err('FPT.AI xử lý quá lâu, file âm thanh chưa sẵn sàng. Thử lại sau ít phút.', 504);
}
