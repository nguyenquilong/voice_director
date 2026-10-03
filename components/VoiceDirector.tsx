'use client';

import { useEffect, useRef, useState } from 'react';
import {
  EMO, LV_VI, STYLES, REGIONS, G_MODELS, G_VOICES, F_VOICES,
  geminiPrompt, fptParams, type Sel,
} from '@/lib/presets';

type Provider = 'google' | 'fpt';
type Settings = {
  provider: Provider; gModel: string; gModelCustom: string; gVoice: string; fVoice: string;
  gKey: string; fKey: string;
};

const DEFAULT_SETTINGS: Settings = {
  provider: 'google', gModel: G_MODELS[0][0], gModelCustom: '', gVoice: 'Kore', fVoice: 'auto', gKey: '', fKey: '',
};
const SAMPLE =
  'Ngày xưa, ở một làng nhỏ ven sông Hậu, có ông lão chèo đò. Chiều nào ổng cũng ngồi nhìn con nước lớn ròng… rồi kể cho tụi nhỏ nghe chuyện của mấy chục năm về trước.';

// file mẫu trong public/examples, emo là chỉ số trong EMO
const EXAMPLES = [
  { file: '/examples/loi-cuon-bac4.wav', emo: 2, lv: 4 },
  { file: '/examples/loi-cuon-bac5.wav', emo: 2, lv: 5 },
  { file: '/examples/lanh-lung-bac5.wav', emo: 6, lv: 5 },
];

const C = 160, RING = 136, LBL = 116;
const pt = (deg: number, r: number): [number, number] => {
  const a = (deg * Math.PI) / 180;
  return [C + r * Math.sin(a), C - r * Math.cos(a)];
};
const rOf = (lv: number) => 14 + lv * 17;
const arc = (i: number) => {
  const [x0, y0] = pt(i * 45 - 20, RING), [x1, y1] = pt(i * 45 + 20, RING);
  return `M${x0} ${y0} A${RING} ${RING} 0 0 1 ${x1} ${y1}`;
};

function load<T>(k: string): Partial<T> {
  try { return JSON.parse(localStorage.getItem(k) || '{}'); } catch { return {}; }
}
function save(k: string, v: unknown) {
  try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* bỏ qua */ }
}

export default function VoiceDirector() {
  const [sel, setSel] = useState<Sel>({ emo: 2, lv: 4, style: 0, region: 2 });
  const [text, setText] = useState(SAMPLE);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [draft, setDraft] = useState<Settings>(DEFAULT_SETTINGS);
  const [serverCfg, setServerCfg] = useState<{ google: boolean; fpt: boolean } | null>(null);
  const [status, setStatus] = useState<{ msg: string; err?: boolean }>({ msg: '' });
  const [busy, setBusy] = useState(false);
  const [download, setDownload] = useState<{ url: string; name: string } | null>(null);
  const [ready, setReady] = useState(false);

  const svgRef = useRef<SVGSVGElement>(null);
  const dlgRef = useRef<HTMLDialogElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const actxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const colorRef = useRef(EMO[2].c);
  const dragging = useRef(false);

  const emo = EMO[sel.emo];
  colorRef.current = emo.c;

  // khôi phục lựa chọn + kiểm tra server đã có key chưa
  useEffect(() => {
    setSel((s) => ({ ...s, ...load<Sel>('vd-sel') }));
    setSettings((s) => ({ ...s, ...load<Settings>('vd-settings') }));
    setReady(true);
    fetch('/api/config').then((r) => r.json()).then(setServerCfg).catch(() => setServerCfg(null));
  }, []);
  useEffect(() => { if (ready) save('vd-sel', sel); }, [sel, ready]);
  useEffect(() => { if (ready) save('vd-settings', settings); }, [settings, ready]);
  useEffect(() => () => { if (download) URL.revokeObjectURL(download.url); }, [download]);

  // waveform
  useEffect(() => {
    let raf = 0;
    const data = new Uint8Array(64);
    const draw = () => {
      const cv = canvasRef.current, au = audioRef.current;
      if (cv) {
        const g = cv.getContext('2d')!;
        const dpr = window.devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight;
        if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
        g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
        const playing = au && !au.paused && analyserRef.current;
        if (playing) analyserRef.current!.getByteFrequencyData(data);
        const n = 48, bw = w / n;
        for (let i = 0; i < n; i++) {
          const v = playing ? data[Math.floor((i * data.length) / n)] / 255 : 0.05 + 0.04 * Math.sin(i * 0.6);
          const bh = Math.max(2, v * h * 0.9);
          g.fillStyle = colorRef.current; g.globalAlpha = 0.35 + v * 0.65;
          g.fillRect(i * bw + bw * 0.25, (h - bh) / 2, bw * 0.5, bh);
        }
        g.globalAlpha = 1;
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  function pick(e: React.PointerEvent<SVGSVGElement>) {
    const b = svgRef.current!.getBoundingClientRect();
    const x = ((e.clientX - b.left) * 320) / b.width - C, y = ((e.clientY - b.top) * 320) / b.height - C;
    const deg = ((Math.atan2(x, -y) * 180) / Math.PI + 360) % 360;
    setSel((s) => ({
      ...s,
      emo: Math.floor(((deg + 22.5) % 360) / 45),
      lv: Math.max(1, Math.min(5, Math.round((Math.hypot(x, y) - 14) / 17))),
    }));
  }
  function onKey(e: React.KeyboardEvent) {
    const map: Record<string, (s: Sel) => Sel> = {
      ArrowRight: (s) => ({ ...s, emo: (s.emo + 1) % 8 }),
      ArrowLeft: (s) => ({ ...s, emo: (s.emo + 7) % 8 }),
      ArrowUp: (s) => ({ ...s, lv: Math.min(5, s.lv + 1) }),
      ArrowDown: (s) => ({ ...s, lv: Math.max(1, s.lv - 1) }),
    };
    if (map[e.key]) { e.preventDefault(); setSel(map[e.key]); }
  }

  const model = settings.gModelCustom.trim() || settings.gModel;
  const fpt = fptParams(sel, text, settings.fVoice);
  const preview = settings.provider === 'google'
    ? geminiPrompt(sel, text)
    : `voice: ${fpt.voice}\nspeed: ${fpt.speed}\n\n${fpt.text}`;

  function ensureGraph() {
    if (actxRef.current || !audioRef.current) return;
    const ctx = new AudioContext();
    const an = ctx.createAnalyser(); an.fftSize = 128;
    ctx.createMediaElementSource(audioRef.current).connect(an);
    an.connect(ctx.destination);
    actxRef.current = ctx; analyserRef.current = an;
  }

  async function generate() {
    if (!text.trim()) { setStatus({ msg: 'Nhập lời thoại trước khi tạo giọng.', err: true }); return; }
    const isG = settings.provider === 'google';
    setBusy(true);
    setStatus({ msg: isG ? 'Đang tạo giọng với Gemini…' : 'Đang tạo giọng với FPT.AI, thường mất 5–20 giây…' });
    try {
      ensureGraph();
      await actxRef.current?.resume();
      const res = await fetch(isG ? '/api/tts/google' : '/api/tts/fpt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isG
          ? { prompt: geminiPrompt(sel, text), model, voice: settings.gVoice, apiKey: settings.gKey.trim() }
          : { text: fpt.text, voice: fpt.voice, speed: fpt.speed, apiKey: settings.fKey.trim() }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `Lỗi ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const au = audioRef.current!;
      au.src = url;
      setDownload({ url, name: `giong-doc-${emo.k}-bac${sel.lv}.${blob.type.includes('mpeg') ? 'mp3' : 'wav'}` });
      await au.play().catch(() => {});
      setStatus({ msg: `Xong · ${emo.k} bậc ${sel.lv} · ${STYLES[sel.style].k} · giọng ${REGIONS[sel.region].k}` });
    } catch (e) {
      setStatus({ msg: e instanceof Error ? e.message : 'Có lỗi xảy ra', err: true });
    } finally {
      setBusy(false);
    }
  }

  function openSettings() { setDraft(settings); dlgRef.current?.showModal(); }
  function saveSettings() {
    setSettings(draft); dlgRef.current?.close();
    setStatus({ msg: `Đã lưu cài đặt · đang dùng ${draft.provider === 'google' ? 'Google Gemini TTS' : 'FPT.AI'}` });
  }

  const [kx, ky] = pt(sel.emo * 45, rOf(sel.lv));
  const hasKey = (s: Settings, p: Provider) => Boolean((p === 'google' ? s.gKey : s.fKey).trim());
  const keyMissing = serverCfg && !serverCfg[settings.provider] && !hasKey(settings, settings.provider);

  return (
    <div className="wrap" style={{ ['--emo' as string]: emo.c }}>
      <header>
        <div className="brand">
          Đạo diễn cảm xúc
          <small>Kéo núm trên vòng tròn để chọn cảm xúc và độ đậm</small>
        </div>
        <button className="icon-btn" onClick={openSettings}>
          ⚙ <span className="provider-pill">{settings.provider === 'google' ? 'Google' : 'FPT.AI'}</span>
        </button>
      </header>

      <div className="stage">
        <svg
          ref={svgRef} id="dial" viewBox="0 0 320 320" role="slider" tabIndex={0}
          aria-label="Vòng chọn cảm xúc" aria-valuetext={`${emo.k}, bậc ${sel.lv}`}
          onPointerDown={(e) => { dragging.current = true; e.currentTarget.setPointerCapture(e.pointerId); pick(e); }}
          onPointerMove={(e) => dragging.current && pick(e)}
          onPointerUp={() => { dragging.current = false; }}
          onKeyDown={onKey}
        >
          <defs>
            <radialGradient id="glow">
              <stop offset="0" stopColor="#fff" stopOpacity=".9" />
              <stop offset=".25" stopColor={emo.c} stopOpacity=".7" />
              <stop offset="1" stopColor={emo.c} stopOpacity="0" />
            </radialGradient>
            <radialGradient id="core">
              <stop offset="0" stopColor={emo.c} stopOpacity=".22" />
              <stop offset="1" stopColor={emo.c} stopOpacity="0" />
            </radialGradient>
          </defs>
          <circle cx={C} cy={C} r={104} fill="url(#core)" />
          <circle cx={C} cy={C} r={106} fill="none" stroke="#3a2e28" />
          {[1, 2, 3, 4, 5].map((lv) => (
            <circle key={lv} cx={C} cy={C} r={rOf(lv)} fill="none" stroke="#3a2e28" strokeDasharray="1 5" />
          ))}
          {EMO.map((e, i) => {
            const [lx, ly] = pt(i * 45, LBL);
            return (
              <g key={e.k}>
                <path d={arc(i)} fill="none" stroke={e.c} strokeLinecap="round"
                  strokeWidth={i === sel.emo ? 12 : 9} opacity={i === sel.emo ? 1 : 0.28} />
                <text x={lx} y={ly} className={i === sel.emo ? 'on' : ''}>{e.k}</text>
              </g>
            );
          })}
          <line x1={C} y1={C} x2={kx} y2={ky} stroke="#f2e6da" strokeOpacity=".5" />
          <circle cx={kx} cy={ky} r={18 + sel.lv * 4} fill="url(#glow)" />
          <circle cx={kx} cy={ky} r={7} fill="#1a1412" stroke="#fff" strokeWidth={2.5} />
          <circle cx={C} cy={C} r={2.5} fill="#a39184" />
        </svg>
      </div>

      <div className="readout">
        <div className="name">{emo.k}</div>
        <div className="lv">Bậc {sel.lv}/5 · {LV_VI[sel.lv - 1]}</div>
      </div>
      <div className="levels" aria-label="Độ đậm cảm xúc">
        {LV_VI.map((_, i) => (
          <button key={i} className={sel.lv === i + 1 ? 'on' : ''} onClick={() => setSel({ ...sel, lv: i + 1 })}>{i + 1}</button>
        ))}
      </div>

      <section>
        <h2>Kiểu đọc</h2>
        <div className="chips">
          {STYLES.map((s, i) => (
            <button key={s.k} className={`chip ${sel.style === i ? 'on' : ''}`} onClick={() => setSel({ ...sel, style: i })}>{s.k}</button>
          ))}
        </div>
      </section>
      <section>
        <h2>Giọng vùng miền</h2>
        <div className="chips">
          {REGIONS.map((r, i) => (
            <button key={r.k} className={`chip ${sel.region === i ? 'on' : ''}`} onClick={() => setSel({ ...sel, region: i })}>{r.k}</button>
          ))}
        </div>
      </section>
      <section>
        <h2>Lời thoại</h2>
        <textarea value={text} onChange={(e) => setText(e.target.value)} />
        <details>
          <summary>Xem lệnh gửi cho AI</summary>
          <pre>{preview}</pre>
        </details>
      </section>

      <button className="go" onClick={generate} disabled={busy}>
        {busy ? 'Đang tạo giọng…' : 'Tạo giọng đọc'}
      </button>
      <div className={`status ${status.err ? 'err' : ''}`}>
        {keyMissing && !status.msg
          ? `Chưa có ${settings.provider === 'google' ? 'GEMINI_API_KEY' : 'FPT_API_KEY'}: thêm vào .env.local hoặc nhập API key trong ⚙ Cài đặt.`
          : status.msg}
      </div>
      <div className="out">
        <canvas ref={canvasRef} />
        <audio ref={audioRef} controls hidden={!download} />
        {download && <a className="dl" href={download.url} download={download.name}>Tải file âm thanh</a>}
      </div>

      <section>
        <h2>Nghe thử ví dụ</h2>
        <div className="examples">
          {EXAMPLES.map((ex) => (
            <div key={ex.file} className="example" style={{ ['--emo' as string]: EMO[ex.emo].c }}>
              <div className="ex-head">
                <span className="ex-name">{EMO[ex.emo].k} · bậc {ex.lv}</span>
                <button className="chip" onClick={() => setSel({ ...sel, emo: ex.emo, lv: ex.lv })}>Dùng cảm xúc này</button>
              </div>
              <audio controls preload="none" src={ex.file} />
            </div>
          ))}
        </div>
      </section>

      <dialog ref={dlgRef}>
        <div className="dlg">
          <h3>Cài đặt giọng đọc</h3>
          <p className="note">Ưu tiên API key trong file .env.local trên server. Nếu server chưa có, app dùng key bạn nhập bên dưới (lưu trong trình duyệt này).</p>
          <div className="seg">
            {(['google', 'fpt'] as Provider[]).map((p) => (
              <button key={p} className={draft.provider === p ? 'on' : ''} onClick={() => setDraft({ ...draft, provider: p })}>
                {p === 'google' ? 'Google Gemini TTS' : 'FPT.AI'}
                {serverCfg && (
                  <span className={`dot ${serverCfg[p] || hasKey(draft, p) ? 'ok' : ''}`}
                    title={serverCfg[p] ? 'Đã có key trên server' : hasKey(draft, p) ? 'Dùng key đã nhập' : 'Chưa có key'} />
                )}
              </button>
            ))}
          </div>

          {draft.provider === 'google' ? (
            <>
              <label htmlFor="gKey">API key Gemini</label>
              <input id="gKey" className="field" type="password" autoComplete="off"
                placeholder={serverCfg?.google ? 'Server đã có GEMINI_API_KEY' : 'Dán key từ Google AI Studio'}
                value={draft.gKey} onChange={(e) => setDraft({ ...draft, gKey: e.target.value })} />
              <label htmlFor="gModel">Model</label>
              <select id="gModel" className="field" value={draft.gModel} onChange={(e) => setDraft({ ...draft, gModel: e.target.value })}>
                {G_MODELS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              <label htmlFor="gModelCustom">Hoặc nhập tên model khác</label>
              <input id="gModelCustom" className="field" placeholder="Để trống nếu dùng model ở trên"
                value={draft.gModelCustom} onChange={(e) => setDraft({ ...draft, gModelCustom: e.target.value })} />
              <label htmlFor="gVoice">Giọng</label>
              <select id="gVoice" className="field" value={draft.gVoice} onChange={(e) => setDraft({ ...draft, gVoice: e.target.value })}>
                {G_VOICES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              <p className="hint">Gemini nhận mô tả cảm xúc bằng lời, nên vòng xoay điều khiển trực tiếp cách đọc.</p>
            </>
          ) : (
            <>
              <label htmlFor="fKey">API key FPT.AI</label>
              <input id="fKey" className="field" type="password" autoComplete="off"
                placeholder={serverCfg?.fpt ? 'Server đã có FPT_API_KEY' : 'Dán key từ console.fpt.ai'}
                value={draft.fKey} onChange={(e) => setDraft({ ...draft, fKey: e.target.value })} />
              <label htmlFor="fVoice">Giọng</label>
              <select id="fVoice" className="field" value={draft.fVoice} onChange={(e) => setDraft({ ...draft, fVoice: e.target.value })}>
                {F_VOICES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              <p className="hint">FPT.AI không có tham số cảm xúc, nên app quy đổi cảm xúc thành tốc độ đọc và chỗ ngắt nghỉ.</p>
            </>
          )}
          {serverCfg && !serverCfg[draft.provider] && !hasKey(draft, draft.provider) && (
            <p className="hint warn">
              Server chưa có {draft.provider === 'google' ? 'GEMINI_API_KEY' : 'FPT_API_KEY'}. Nhập API key ở trên, hoặc thêm vào .env.local rồi khởi động lại app.
            </p>
          )}

          <div className="row">
            <button className="btn" onClick={() => dlgRef.current?.close()}>Đóng</button>
            <button className="btn primary" onClick={saveSettings}>Lưu cài đặt</button>
          </div>
        </div>
      </dialog>
    </div>
  );
}
