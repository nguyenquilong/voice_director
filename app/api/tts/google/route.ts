export const runtime = 'nodejs';
export const maxDuration = 60;

const err = (msg: string, status: number) => Response.json({ error: msg }, { status });

function pcmToWav(pcm: Buffer, rate: number) {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8);
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  // ưu tiên biến môi trường, nếu không có thì dùng key người dùng nhập trong Cài đặt
  const key = process.env.GEMINI_API_KEY || (typeof body?.apiKey === 'string' ? body.apiKey.trim() : '');
  if (!key) return err('Chưa có GEMINI_API_KEY: thêm vào .env.local hoặc nhập API key trong Cài đặt', 400);
  const prompt = body?.prompt;
  if (typeof prompt !== 'string' || !prompt.trim()) return err('Thiếu lời thoại', 400);
  if (prompt.length > 6000) return err('Lời thoại quá dài, tối đa khoảng 5.000 ký tự', 400);

  const model = String(body?.model || process.env.GEMINI_TTS_MODEL || 'gemini-2.5-flash-preview-tts');
  if (!/^[\w.\-]+$/.test(model)) return err('Tên model không hợp lệ', 400);
  const voice = String(body?.voice || 'Kore');
  if (!/^[A-Za-z]+$/.test(voice)) return err('Tên giọng không hợp lệ', 400);

  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
        },
      }),
    },
  ).catch(() => null);
  if (!r) return err('Không kết nối được tới Google', 502);

  const j = await r.json().catch(() => ({}));
  if (!r.ok) return err(`Google trả lỗi ${r.status}: ${j?.error?.message ?? 'không rõ lý do'}`, 502);

  const part = j?.candidates?.[0]?.content?.parts?.find((p: { inlineData?: unknown }) => p.inlineData);
  if (!part) return err('Google không trả về âm thanh. Thử đổi model hoặc rút ngắn lời thoại.', 502);

  const mime: string = part.inlineData.mimeType || '';
  const raw = Buffer.from(part.inlineData.data, 'base64');
  const isContainer = /wav|mpeg|mp3|ogg/.test(mime);
  const rate = Number(mime.match(/rate=(\d+)/)?.[1] ?? 24000);
  const audio = isContainer ? raw : pcmToWav(raw, rate);

  return new Response(new Uint8Array(audio), {
    headers: { 'Content-Type': isContainer ? mime : 'audio/wav', 'Cache-Control': 'no-store' },
  });
}
