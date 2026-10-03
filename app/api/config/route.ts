export const dynamic = 'force-dynamic';

/** Cho client biết server đã cấu hình key nào (không lộ key) */
export function GET() {
  return Response.json({
    google: Boolean(process.env.GEMINI_API_KEY),
    fpt: Boolean(process.env.FPT_API_KEY),
  });
}
