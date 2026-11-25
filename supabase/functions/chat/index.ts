// ============================================================================
// Mtwo Steam — Edge Function "chat"
// Asisten data admin berbasis Gemini (function calling).
//
// Keamanan:
//   * JWT pemanggil diverifikasi (gateway verify_jwt + auth.getUser di sini).
//   * Hanya admin (public.is_admin()) yang boleh memakai asisten ini.
//   * Tool dieksekusi dengan TOKEN USER (bukan service role) sehingga
//     RLS & grant RPC tetap berlaku — data yang bocor maksimal = data admin.
// Secret (wajib):
//   Dashboard → Edge Functions → Secrets → GEMINI_API_KEY
//   (atau: supabase secrets set GEMINI_API_KEY=...)
// Secret (opsional):
//   GEMINI_MODEL — override nama model (default: gemini-3.5-flash-lite)
//
// PENTAG MENDEPLOY: hapus SELURUH isi editor (Ctrl+A) sebelum menempel
// kode ini — jangan sampai template bawaan dashboard ikut tersisa.
// ============================================================================

import { createClient } from "npm:@supabase/supabase-js@2"

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
}

// Nama model bisa dioverride lewat secret GEMINI_MODEL tanpa edit kode —
// berguna bila Google menghentikan model ini lagi di masa depan
// (Dashboard → Edge Functions → Secrets → GEMINI_MODEL).
//
// Default: gemini-3.5-flash-lite — model paling cepat & murah untuk
// tugas data (per Google: penerus resmi gemini-2.5-flash, thinking
// default "minimal"). Asisten chat kita hanya membaca angka dari RPC,
// bukan menalar berat — model reasoning (3.6/3.8) hanya menambah
// latensi tanpa manfaat. Untuk jawaban yang lebih "cerdas", set secret
// GEMINI_MODEL = gemini-3.8-flash.
const GEMINI_MODEL = (
  Deno.env.get("GEMINI_MODEL") ?? "gemini-3.5-flash-lite"
).trim()

// Model cadangan dipakai otomatis bila model utama terus gagal karena
// high demand / kuota / model dihentikan. Set ke string kosong untuk
// menonaktifkan fallback.
const GEMINI_FALLBACK_MODEL = (
  Deno.env.get("GEMINI_FALLBACK_MODEL") ?? "gemini-2.5-flash"
).trim()

function geminiUrl(model: string): string {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`
}

// Thinking hanya untuk model reasoning (non-lite, mis. gemini-3.8-flash).
// Model "lite" sudah berpikir minimal — field thinkingLevel justru bisa
// ditolak, jadi tidak dikirim.
function shouldSendThinking(model: string): boolean {
  return !model.includes("lite")
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

interface IncomingMessage {
  role: "user" | "assistant"
  content: unknown
}

interface GeminiPart {
  text?: string
  functionCall?: { name: string; args?: Record<string, unknown> }
}

interface GeminiPayload {
  candidates?: Array<{ content?: { parts?: GeminiPart[] } }>
  error?: { message?: string }
}

type UserClient = ReturnType<typeof createClient>

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  })
}

/* ------------------------------------------------------------------ */
/* Tanggal (WIB) untuk prompt sistem                                   */
/* ------------------------------------------------------------------ */

function todayJakartaIso(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
  }).format(new Date())
}

function shiftIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function mondayOf(iso: string): string {
  const dow = new Date(`${iso}T00:00:00Z`).getUTCDay()
  return shiftIso(iso, -((dow + 6) % 7))
}

/* ------------------------------------------------------------------ */
/* Holt-Winters aditif musiman mingguan                                */
/* Port ringkas dari src/lib/forecast.ts agar bisa dijalankan di Deno. */
/* Sengaja ditaruh di file yang sama dengan handler — deploy lewat     */
/* dashboard editor tetap cukup dengan menempel satu index.ts.         */
/* ------------------------------------------------------------------ */

interface ForecastPoint {
  day: string
  revenue: number
  lower: number
  upper: number
}

interface ForecastMetrics {
  alpha: number
  beta: number
  gamma: number
  mape: number | null
  mae: number
  sigma: number
}

interface ForecastResult {
  points: ForecastPoint[]
  metrics: ForecastMetrics
  historyDays: number
}

interface RevenueHistoryPoint {
  day: string
  revenue: number
  transaction_count?: number
}

interface RevenueHistory {
  start_date: string
  end_date: string
  daily: RevenueHistoryPoint[]
}

interface HwParams {
  alpha: number
  beta: number
  gamma: number
}

interface HwFit {
  level: number
  trend: number
  seasonal: number[]
  residuals: number[]
  fittedPoints: number
}

const FORECAST_MIN_DAYS = 21
const FORECAST_WEEK = 7

/** 24 kombinasi parameter yang diuji saat backtest. */
const FORECAST_PARAM_GRID: HwParams[] = (() => {
  const grid: HwParams[] = []
  for (const alpha of [0.1, 0.2, 0.3, 0.5]) {
    for (const beta of [0.01, 0.05, 0.1]) {
      for (const gamma of [0.1, 0.2, 0.3]) {
        grid.push({ alpha, beta, gamma })
      }
    }
  }
  return grid
})()

function forecastAvg(nums: number[]): number {
  return nums.reduce((sum, n) => sum + n, 0) / Math.max(nums.length, 1)
}

/** Fit model; residual satu-langkah dikumpulkan untuk menghitung σ. */
function fitHoltWinters(values: number[], params: HwParams): HwFit {
  const n = values.length
  const firstWeek = values.slice(0, FORECAST_WEEK)
  let level = forecastAvg(firstWeek)
  let trend =
    (forecastAvg(values.slice(FORECAST_WEEK, 2 * FORECAST_WEEK)) - level) /
    FORECAST_WEEK
  const seasonal = firstWeek.map((v) => v - level)
  const residuals: number[] = []

  for (let t = FORECAST_WEEK; t < n; t += 1) {
    const slot = t % FORECAST_WEEK
    residuals.push(values[t] - (level + trend + seasonal[slot]))

    const prevLevel = level
    level =
      params.alpha * (values[t] - seasonal[slot]) +
      (1 - params.alpha) * (level + trend)
    trend = params.beta * (level - prevLevel) + (1 - params.beta) * trend
    seasonal[slot] =
      params.gamma * (values[t] - level) + (1 - params.gamma) * seasonal[slot]
  }

  return { level, trend, seasonal, residuals, fittedPoints: n }
}

/** Proyeksi `steps` hari ke depan (sudah dibatasi ≥ 0). */
function projectHoltWinters(fitResult: HwFit, steps: number): number[] {
  const out: number[] = []
  for (let h = 1; h <= steps; h += 1) {
    const slot = (fitResult.fittedPoints + h - 1) % FORECAST_WEEK
    out.push(
      Math.max(
        0,
        fitResult.level + h * fitResult.trend + fitResult.seasonal[slot],
      ),
    )
  }
  return out
}

/** Backtest 7 hari terakhir: latih tanpa mereka, ukur MAE & MAPE. */
function backtestHoltWinters(
  values: number[],
  params: HwParams,
): { mae: number; mape: number | null } {
  const train = values.slice(0, values.length - FORECAST_WEEK)
  const actual = values.slice(values.length - FORECAST_WEEK)
  const preds = projectHoltWinters(fitHoltWinters(train, params), FORECAST_WEEK)

  let sumAbs = 0
  let sumPct = 0
  let pctCount = 0
  for (let i = 0; i < FORECAST_WEEK; i += 1) {
    const err = Math.abs(actual[i] - preds[i])
    sumAbs += err
    if (actual[i] > 0) {
      sumPct += err / actual[i]
      pctCount += 1
    }
  }
  return {
    mae: sumAbs / FORECAST_WEEK,
    mape: pctCount > 0 ? (sumPct / pctCount) * 100 : null,
  }
}

function computeRevenueForecast(
  history: RevenueHistory,
  horizon: number,
): ForecastResult | null {
  const all = Array.isArray(history?.daily)
    ? history.daily.map((d) => Number(d?.revenue) || 0)
    : []
  const lastDay = history?.end_date
  if (!lastDay || all.length === 0) return null

  // Buang hari "belum buka" sebelum transaksi pertama.
  const firstActive = all.findIndex((v) => v > 0)
  if (firstActive === -1) return null
  const values = all.slice(firstActive)
  if (values.length < FORECAST_MIN_DAYS) return null

  // 1. Parameter terbaik dari backtest 7 hari terakhir.
  let best = FORECAST_PARAM_GRID[0]
  let bestMae = Number.POSITIVE_INFINITY
  for (const params of FORECAST_PARAM_GRID) {
    const { mae } = backtestHoltWinters(values, params)
    if (mae < bestMae) {
      bestMae = mae
      best = params
    }
  }

  // 2. Refit pada seluruh deret aktif, lalu proyeksi.
  const fullFit = fitHoltWinters(values, best)
  const raw = projectHoltWinters(fullFit, horizon)
  const sigma = Math.sqrt(
    fullFit.residuals.reduce((sum, r) => sum + r * r, 0) /
      Math.max(fullFit.residuals.length, 1),
  )

  const points: ForecastPoint[] = raw.map((value, i) => ({
    day: shiftIso(lastDay, i + 1),
    revenue: Math.round(value),
    lower: Math.max(0, Math.round(value - sigma)),
    upper: Math.max(0, Math.round(value + sigma)),
  }))

  const { mape, mae } = backtestHoltWinters(values, best)
  return {
    points,
    metrics: { ...best, mape, mae, sigma: Math.round(sigma) },
    historyDays: values.length,
  }
}

function systemPrompt(): string {
  const today = todayJakartaIso()
  return [
    "Anda adalah asisten data Mtwo Steam, aplikasi kasir untuk usaha cuci motor & mobil.",
    "Tugas: menjawab pertanyaan admin tentang pendapatan, jumlah transaksi, dan komisi karyawan.",
    "",
    "ATURAN WAJIB:",
    "- SELALU panggil tool yang tersedia untuk mendapatkan angka; JANGAN menebak angka.",
    "- Zona waktu Asia/Jakarta (WIB), format tanggal yyyy-mm-dd.",
    `- Hari ini: ${today}.`,
    `- "Minggu ini" = sejak Senin ${mondayOf(today)}.`,
    `- "Bulan ini" = sejak tanggal 1 ${today.slice(0, 7)}-01.`,
    '- Untuk "7 hari terakhir", pakai start = hari ini - 6.',
    "- Jawab dalam Bahasa Indonesia, ringkas dan ramah (maksimal ±120 kata).",
    "- Format rupiah: Rp 15.000 (pemisah ribuan titik).",
    "- Hanya sebut nama layanan/karyawan yang benar-benar muncul di hasil tool.",
    "- Bila tool gagal, katakan data sementara tidak tersedia dan sarankan mencoba lagi.",
    "- Untuk pertanyaan prediksi/proyeksi/perkiraan omzet (\"kira-kira\", \"ke depan\", \"forecast\"), WAJIB panggil tool `prediksi_omzet` — jangan mengarang angka.",
    "- Gunakan `days` default 60 dan `horizon` default 7 bila tidak disebut; bila user menyebut \"bulan depan\" pakai horizon 30.",
    "- Sajikan hasil prediksi apa adanya dari tool (total, kisaran, MAPE/MAE); jangan mengubah angka dari tool.",
  ].join("\n")
}

const TOOL_DECLARATIONS = {
  functionDeclarations: [
    {
      name: "ringkasan_hari_ini",
      description:
        "Ringkasan hari ini (WIB): pendapatan, jumlah transaksi, komisi, motor vs mobil, breakdown metode bayar, dan deret 14 hari terakhir.",
      parameters: { type: "object", properties: {} },
    },
    {
      name: "laporan_periode",
      description:
        "Laporan pendapatan untuk rentang tanggal (WIB): ringkasan, breakdown metode bayar, rekap harian.",
      parameters: {
        type: "object",
        properties: {
          p_start: { type: "string", description: "Tanggal mulai yyyy-mm-dd" },
          p_end: { type: "string", description: "Tanggal selesai yyyy-mm-dd" },
        },
        required: ["p_start", "p_end"],
      },
    },
    {
      name: "komisi_periode",
      description:
        "Laporan komisi karyawan untuk rentang tanggal (WIB): total komisi, rekap per karyawan, rincian transaksi berkomisi.",
      parameters: {
        type: "object",
        properties: {
          p_start: { type: "string", description: "Tanggal mulai yyyy-mm-dd" },
          p_end: { type: "string", description: "Tanggal selesai yyyy-mm-dd" },
        },
        required: ["p_start", "p_end"],
      },
    },
    {
      name: "prediksi_omzet",
      description:
        "Proyeksi omzet harian (WIB) dengan Holt-Winters aditif musiman mingguan. Dipakai untuk pertanyaan prediksi, proyeksi, perkiraan, atau ramalan omzet ke depan. Mengembalikan proyeksi per hari, total, pita ±1σ, serta MAPE/MAE dari backtest.",
      parameters: {
        type: "object",
        properties: {
          days: {
            type: "number",
            description:
              "Jumlah hari histori yang dipakai (21-365, default 60).",
          },
          horizon: {
            type: "number",
            description:
              "Jumlah hari ke depan yang diproyeksikan (1-30, default 7).",
          },
        },
      },
    },
  ],
}

/* ------------------------------------------------------------------ */
/* Eksekusi tool — memakai client token USER (RLS tetap berlaku)       */
/* ------------------------------------------------------------------ */

async function executeTool(
  name: string,
  args: Record<string, unknown>,
  sb: UserClient,
): Promise<Record<string, unknown>> {
  try {
    if (name === "ringkasan_hari_ini") {
      const { data, error } = await sb.rpc("get_dashboard_summary")
      if (error) throw error
      return { summary: data }
    }

    if (name === "laporan_periode" || name === "komisi_periode") {
      const pStart = String(args.p_start ?? "")
      const pEnd = String(args.p_end ?? "")
      if (!DATE_RE.test(pStart) || !DATE_RE.test(pEnd)) {
        return { error: "Format tanggal harus yyyy-mm-dd." }
      }
      const [s, e] = pStart <= pEnd ? [pStart, pEnd] : [pEnd, pStart]
      const rpcName =
        name === "laporan_periode" ? "get_report" : "get_commission_report"
      const { data, error } = await sb.rpc(rpcName, { p_start: s, p_end: e })
      if (error) throw error
      return { report: data }
    }

    if (name === "prediksi_omzet") {
      const rawDays = Number(args.days ?? 60)
      const rawHorizon = Number(args.horizon ?? 7)
      if (!Number.isFinite(rawDays) || !Number.isFinite(rawHorizon)) {
        return { error: "Parameter days dan horizon harus berupa angka." }
      }
      const days = Math.min(Math.max(Math.round(rawDays), 21), 365)
      const horizon = Math.min(Math.max(Math.round(rawHorizon), 1), 30)

      const { data, error } = await sb.rpc("get_revenue_history", {
        p_days: days,
      })
      if (error) throw error

      const forecast = computeRevenueForecast(
        (data ?? {}) as RevenueHistory,
        horizon,
      )
      if (!forecast) {
        return {
          error:
            "Data riwayat belum cukup untuk diprediksi (minimal 21 hari aktif dengan transaksi lunas).",
        }
      }

      const total = forecast.points.reduce((sum, p) => sum + p.revenue, 0)
      const totalLower = forecast.points.reduce((sum, p) => sum + p.lower, 0)
      const totalUpper = forecast.points.reduce((sum, p) => sum + p.upper, 0)

      return {
        ringkasan: {
          horizon,
          hari_data: forecast.historyDays,
          total_proyeksi: total,
          kisaran_total: { bawah: totalLower, atas: totalUpper },
          mape: forecast.metrics.mape,
          mae: forecast.metrics.mae,
          sigma: forecast.metrics.sigma,
          alpha: forecast.metrics.alpha,
          beta: forecast.metrics.beta,
          gamma: forecast.metrics.gamma,
        },
        proyeksi: forecast.points.map((p) => ({
          day: p.day,
          revenue: p.revenue,
        })),
      }
    }

    return { error: `Tool tidak dikenal: ${name}` }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Gagal mengambil data.",
    }
  }
}

/* ------------------------------------------------------------------ */
/* Panggil Gemini                                                      */
/* ------------------------------------------------------------------ */

interface GeminiCallError extends Error {
  status?: number
  overload?: boolean
}

function geminiCallError(
  message: string,
  status?: number,
  overload = false,
): GeminiCallError {
  const err = new Error(message) as GeminiCallError
  err.status = status
  err.overload = overload
  return err
}

function isOverloadResponse(res: Response, data: GeminiPayload): boolean {
  const message = data?.error?.message ?? ""
  return (
    res.status === 429 ||
    /high demand|overload|rate limit|quota|too many requests|temporarily unavailable/i.test(
      message,
    )
  )
}

function waitMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function postGemini(
  model: string,
  apiKey: string,
  contents: Array<{ role: string; parts: unknown[] }>,
  withThinking: boolean,
): Promise<{ res: Response; data: GeminiPayload }> {
  const res = await fetch(geminiUrl(model), {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt() }] },
      contents,
      tools: [TOOL_DECLARATIONS],
      // "low" = latensi terendah yang valid untuk model reasoning;
      // token thinking tetap dihitung dalam maxOutputTokens (8192).
      generationConfig: withThinking
        ? {
            temperature: 0.2,
            maxOutputTokens: 8192,
            thinkingConfig: { thinkingLevel: "low" },
          }
        : { temperature: 0.2, maxOutputTokens: 8192 },
    }),
  })
  return { res, data: (await res.json()) as GeminiPayload }
}

/** Satu model: retry thinkingConfig + retry singkat saat overload. */
async function callGeminiModel(
  model: string,
  apiKey: string,
  contents: Array<{ role: string; parts: unknown[] }>,
): Promise<GeminiPayload> {
  const withThinking = shouldSendThinking(model)
  let attempt = await postGemini(model, apiKey, contents, withThinking)
  let { res, data } = attempt

  // Model lama/beda generasi bisa menolak thinkingConfig — ulangi tanpa itu.
  if (!res.ok && /thinking/i.test(data?.error?.message ?? "")) {
    console.warn(`${model} menolak thinkingConfig — retry tanpa itu.`)
    attempt = await postGemini(model, apiKey, contents, false)
    res = attempt.res
    data = attempt.data
  }

  if (res.ok) return data

  const overload = isOverloadResponse(res, data)
  let last = geminiCallError(
    data?.error?.message ?? `Gemini error (HTTP ${res.status})`,
    res.status,
    overload,
  )

  if (overload) {
    for (const delay of [400, 1200]) {
      console.warn(`${model} sedang sibuk — retry dalam ${delay} ms.`)
      await waitMs(delay)
      let retry = await postGemini(model, apiKey, contents, withThinking)
      if (!retry.res.ok && /thinking/i.test(retry.data?.error?.message ?? "")) {
        retry = await postGemini(model, apiKey, contents, false)
      }
      if (retry.res.ok) return retry.data
      last = geminiCallError(
        retry.data?.error?.message ?? `Gemini error (HTTP ${retry.res.status})`,
        retry.res.status,
        isOverloadResponse(retry.res, retry.data),
      )
    }
  }

  throw last
}

async function callGemini(
  contents: Array<{ role: string; parts: unknown[] }>,
): Promise<GeminiPayload> {
  const apiKey = Deno.env.get("GEMINI_API_KEY")
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY belum diatur pada secret Edge Function. " +
        "Atur lewat Supabase Dashboard (Edge Functions → Secrets).",
    )
  }

  try {
    return await callGeminiModel(GEMINI_MODEL, apiKey, contents)
  } catch (primaryErr) {
    const err = primaryErr as GeminiCallError
    const sameModel =
      GEMINI_FALLBACK_MODEL.length > 0 &&
      GEMINI_FALLBACK_MODEL.toLowerCase() === GEMINI_MODEL.toLowerCase()
    const worthFallback =
      err.overload === true ||
      (err.status !== undefined && err.status >= 500) ||
      /no longer available|not found|unknown model|invalid model|model .* not supported/i.test(
        err.message,
      )

    if (!GEMINI_FALLBACK_MODEL || sameModel || !worthFallback) {
      throw primaryErr
    }

    console.warn(
      `Gemini utama (${GEMINI_MODEL}) gagal — coba fallback ${GEMINI_FALLBACK_MODEL}.`,
    )
    return await callGeminiModel(GEMINI_FALLBACK_MODEL, apiKey, contents)
  }
}

/* ------------------------------------------------------------------ */
/* Handler                                                             */
/* ------------------------------------------------------------------ */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS })
  }
  if (req.method !== "POST") {
    return json({ error: "Metode harus POST." }, 405)
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? ""
    if (!authHeader.startsWith("Bearer ")) {
      return json({ error: "Token sesi tidak ditemukan." }, 401)
    }

    // Client dengan token USER → RLS & RPC invoker tetap berlaku.
    const sb = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    )

    // 1. Verifikasi JWT.
    const { data: userData, error: userError } = await sb.auth.getUser()
    if (userError || !userData?.user) {
      return json({ error: "Sesi tidak valid. Silakan login ulang." }, 401)
    }

    // 2. Verifikasi admin.
    const { data: isAdmin } = await sb.rpc("is_admin")
    if (isAdmin !== true) {
      return json({ error: "Hanya admin yang dapat memakai asisten ini." }, 403)
    }

    // 3. Siapkan riwayat percakapan (maks 10 pesan terakhir).
    //    Gemini hanya menerima role "user" | "model" — "assistant"
    //    dari frontend WAJIB dikonversi, kalau tidak permintaan ditolak 400.
    const body = (await req.json()) as { messages?: IncomingMessage[] }
    const contents = (Array.isArray(body?.messages) ? body.messages : [])
      .filter(
        (m) =>
          (m.role === "user" || m.role === "assistant") &&
          typeof m.content === "string" &&
          m.content.trim().length > 0,
      )
      .slice(-10)
      .map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content as string }],
      }))

    if (contents.length === 0) {
      return json({ error: "Pertanyaan kosong." }, 400)
    }

    // 4. Loop tool (maksimal 2 putaran function calling).
    const requestStart = Date.now()
    let reply: string | null = null
    for (let round = 0; round < 3; round += 1) {
      const roundStart = Date.now()
      const payload = await callGemini(contents)
      console.log(
        `chat: Gemini putaran ${round} selesai dalam ${Date.now() - roundStart} ms`,
      )
      const parts = payload.candidates?.[0]?.content?.parts ?? []
      const calls = parts.filter((p) => p.functionCall)
      const text = parts
        .filter((p) => typeof p.text === "string")
        .map((p) => p.text)
        .join("")
        .trim()

      if (calls.length === 0 || round === 2) {
        reply =
          text.length > 0
            ? text
            : "Maaf, saya belum bisa menjawab pertanyaan itu."
        break
      }

      contents.push({ role: "model", parts })
      const responses = []
      for (const part of calls) {
        const fc = part.functionCall
        if (!fc) continue
        const result = await executeTool(fc.name, fc.args ?? {}, sb)
        responses.push({ functionResponse: { name: fc.name, response: result } })
      }
      contents.push({ role: "user", parts: responses })
    }

    console.log(
      `chat: total ${Date.now() - requestStart} ms, panjang jawaban ${reply?.length ?? 0} karakter`,
    )
    return json({
      reply: reply ?? "Maaf, saya belum bisa menjawab pertanyaan itu.",
    })
  } catch (err) {
    console.error("chat function:", err)
    const raw =
      err instanceof Error ? err.message : "Terjadi kesalahan tak terduga."
    const errLike = err as GeminiCallError
    const overload =
      errLike.overload === true ||
      /high demand|overload|rate limit|quota|too many requests/i.test(raw)
    return json(
      {
        error: overload
          ? "Gemini sedang mengalami lonjakan permintaan. Mohon coba lagi dalam beberapa menit. Sementara itu, prediksi omzet tetap bisa dilihat di halaman Laporan."
          : raw,
      },
      500,
    )
  }
})
