// ============================================================================
// Pandawa Steam — Edge Function "chat"
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
//   GEMINI_MODEL — override nama model (default: gemini-3.8-flash)
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
const GEMINI_MODEL = Deno.env.get("GEMINI_MODEL") ?? "gemini-3.8-flash"
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`

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

function systemPrompt(): string {
  const today = todayJakartaIso()
  return [
    "Anda adalah asisten data Pandawa Steam, aplikasi kasir untuk usaha cuci motor & mobil.",
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

  // Kontrol thinking:
  //   * Model Gemini 3 (mis. gemini-3.8-flash) adalah model REASONING —
  //     thinking selalu ada. Level yang didukung: low | medium | high
  //     ("minimal" TIDAK didukung dan justru melempar error).
  //   * "low" = latensi terendah yang valid, tetap andal untuk function
  //     calling (tool) — pas untuk chat data cepat.
  //   * Token thinking DIHITUNG dalam maxOutputTokens → budget harus besar,
  //     kalau kecil jawaban bisa kosong/terpotong saat model berpikir.
  const post = (withThinking: boolean) =>
    fetch(GEMINI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt() }] },
        contents,
        tools: [TOOL_DECLARATIONS],
        generationConfig: withThinking
          ? {
              temperature: 0.2,
              maxOutputTokens: 8192,
              thinkingConfig: { thinkingLevel: "low" },
            }
          : { temperature: 0.2, maxOutputTokens: 8192 },
      }),
    })

  let res = await post(true)
  let data = (await res.json()) as GeminiPayload

  // Fallback: bila model menolak thinkingConfig (mis. model lama/beda
  // generasi), panggil ulang sekali TANPA field thinkingConfig.
  if (!res.ok && /thinking/i.test(data?.error?.message ?? "")) {
    console.warn(`${GEMINI_MODEL} menolak thinkingConfig — retry tanpa itu.`)
    res = await post(false)
    data = (await res.json()) as GeminiPayload
  }

  if (!res.ok) {
    throw new Error(data?.error?.message ?? `Gemini error (HTTP ${res.status})`)
  }
  return data
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
    return json(
      {
        error:
          err instanceof Error ? err.message : "Terjadi kesalahan tak terduga.",
      },
      500,
    )
  }
})
