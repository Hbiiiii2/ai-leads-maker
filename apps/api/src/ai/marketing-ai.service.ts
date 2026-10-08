import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import OpenAI from "openai";
import { PrismaService } from "../prisma/prisma.service";
import { decryptSecret } from "../settings/encryption.util";

export interface GenerateContentInput {
  businessName: string;
  address?: string;
  industry: string;
  rating?: string;
  hasWebsite?: boolean;
  yourService: string;
  contentStyle: string;
  language: string;
  score: number;
}

export interface MarketingContent {
  email: { subject: string; body: string };
  whatsapp: string;
  instagram: string;
  linkedin: { connectionNote: string };
  coldCall: { opening: string };
}

export interface GenerateWhatsAppInput {
  businessName: string;
  address?: string;
  industry?: string;
  rating?: string;
  hasWebsite?: boolean;
  yourService?: string;
  tone?: string;
  language?: string;
  customPrompt?: string;
}

export interface ResolvedAiConfig {
  apiKey: string;
  model: string;
  baseURL?: string;
  provider: "openrouter" | "gemini" | "openai" | "custom";
}

@Injectable()
export class MarketingAiService {
  private readonly logger = new Logger(MarketingAiService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Resolves the AI provider configuration:
   * 1. Check workspace integration in DB (type: "openai")
   * 2. Fallback to latest enabled "openai" integration in DB
   * 3. Fallback to environment variables (.env)
   */
  async getAiConfig(
    workspaceId?: string,
    override?: { apiKey?: string; model?: string; baseURL?: string },
  ): Promise<ResolvedAiConfig | null> {
    let apiKey = override?.apiKey?.trim() || "";
    let model = override?.model?.trim() || "";
    let baseURL = override?.baseURL?.trim() || "";

    // 1. Check database integration if apiKey is not explicitly provided in override
    if (!apiKey) {
      let targetWorkspaceId = workspaceId;
      if (!targetWorkspaceId || targetWorkspaceId === "default-workspace") {
        const fallbackWs = await this.prisma.workspace.findFirst();
        if (fallbackWs) targetWorkspaceId = fallbackWs.id;
      }

      let integration = await this.prisma.integration.findFirst({
        where: { workspaceId: targetWorkspaceId, type: "openai", enabled: true },
      });
      if (!integration) {
        integration = await this.prisma.integration.findFirst({
          where: { type: "openai", enabled: true },
          orderBy: { updatedAt: "desc" },
        });
      }

      if (integration?.config) {
        const cfg = integration.config as Record<string, string>;
        const encKey = this.config.get<string>("ENCRYPTION_KEY") || "";
        const rawApiKey = cfg.apiKey ? (encKey ? decryptSecret(cfg.apiKey, encKey) : cfg.apiKey) : "";
        if (rawApiKey) {
          apiKey = rawApiKey.trim();
          if (!model) model = cfg.model?.trim() || "";
          if (!baseURL) baseURL = cfg.baseURL?.trim() || "";
        }
      }
    }

    // 2. Fallback to environment variables
    if (!apiKey) {
      apiKey =
        this.config.get<string>("OPENROUTER_API_KEY")?.trim() ||
        this.config.get<string>("OPENAI_API_KEY")?.trim() ||
        this.config.get<string>("GEMINI_API_KEY")?.trim() ||
        "";

      if (!model) {
        model =
          this.config.get<string>("OPENROUTER_MODEL")?.trim() ||
          this.config.get<string>("OPENAI_MODEL")?.trim() ||
          this.config.get<string>("GEMINI_MODEL")?.trim() ||
          "";
      }

      if (!baseURL) {
        baseURL =
          this.config.get<string>("OPENROUTER_BASE_URL")?.trim() ||
          this.config.get<string>("OPENAI_BASE_URL")?.trim() ||
          "";
      }
    }

    if (!apiKey) {
      return null;
    }

    // Determine provider & endpoint normalization
    let provider: "openrouter" | "gemini" | "openai" | "custom" = "openai";

    const isExplicitOpenRouter =
      apiKey.startsWith("sk-or-") ||
      baseURL.includes("openrouter.ai") ||
      (this.config.get<string>("OPENROUTER_API_KEY") && apiKey === this.config.get<string>("OPENROUTER_API_KEY"));

    const isExplicitGemini =
      apiKey.startsWith("AIza") ||
      apiKey.startsWith("AQ.") ||
      baseURL.includes("generativelanguage.googleapis.com");

    if (isExplicitOpenRouter) {
      provider = "openrouter";
      baseURL = baseURL || "https://openrouter.ai/api/v1";
      model = model || "google/gemini-2.5-flash";
    } else if (isExplicitGemini || (model.includes("gemini") && !model.includes("/") && !baseURL)) {
      provider = "gemini";
      baseURL = baseURL || "https://generativelanguage.googleapis.com/v1beta/openai/";
      model = model || "gemini-2.5-flash";
    } else if (baseURL) {
      provider = "custom";
      model = model || "gpt-4o-mini";
    } else {
      provider = "openai";
      model = model || "gpt-4o-mini";
    }

    return { apiKey, model, baseURL: baseURL || undefined, provider };
  }

  createClient(config: ResolvedAiConfig): OpenAI {
    const defaultHeaders: Record<string, string> = {};
    if (config.provider === "openrouter" || (config.baseURL && config.baseURL.includes("openrouter.ai"))) {
      defaultHeaders["HTTP-Referer"] =
        this.config.get<string>("NEXT_PUBLIC_APP_URL") ||
        this.config.get<string>("APP_URL") ||
        "https://prospex.aybisa-workspace.my.id";
      defaultHeaders["X-Title"] = "Prospex AI Lead Automation";
    }

    return new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL || undefined,
      defaultHeaders: Object.keys(defaultHeaders).length > 0 ? defaultHeaders : undefined,
    });
  }

  async testConnection(
    workspaceId?: string,
    overrideConfig?: { apiKey?: string; model?: string; baseURL?: string },
  ): Promise<{ success: boolean; message: string; provider?: string; model?: string }> {
    try {
      const resolved = await this.getAiConfig(workspaceId, overrideConfig);
      if (!resolved || !resolved.apiKey) {
        return {
          success: false,
          message: "API Key belum diisi. Masukkan API Key terlebih dahulu.",
        };
      }

      const client = this.createClient(resolved);
      this.logger.log(`Testing AI connection to ${resolved.provider} (${resolved.model}) at ${resolved.baseURL || "default URL"}`);

      const response = await client.chat.completions.create({
        model: resolved.model,
        messages: [{ role: "user", content: "Katakan 'OK' jika terhubung." }],
        max_tokens: 25,
      });

      const reply = response.choices[0]?.message?.content?.trim() || "OK";
      return {
        success: true,
        message: `Berhasil terhubung ke ${resolved.provider.toUpperCase()} (Model: ${resolved.model})! Respon: "${reply}"`,
        provider: resolved.provider,
        model: resolved.model,
      };
    } catch (err: any) {
      this.logger.error("AI connection test failed", err);
      let errMsg = err.message || "Gagal menghubungi AI provider";
      if (err.status === 401) {
        errMsg = "API Key tidak valid atau tidak memiliki akses (401 Unauthorized). Silakan cek API Key Anda.";
      } else if (err.status === 402) {
        errMsg = "Saldo / kredit di provider tidak mencukupi (402 Payment Required).";
      } else if (err.status === 404) {
        errMsg = `Model '${overrideConfig?.model || "tersebut"}' tidak ditemukan di provider (404 Not Found). Cek penulisan nama model.`;
      }
      return {
        success: false,
        message: errMsg,
      };
    }
  }

  async generateContent(input: GenerateContentInput, workspaceId?: string): Promise<MarketingContent> {
    const aiConfig = await this.getAiConfig(workspaceId);
    if (!aiConfig) {
      this.logger.warn("No AI API key found. Using built-in mock templates.");
      return this.generateMockContent(input);
    }

    try {
      return await this.callAiContent(input, aiConfig);
    } catch (err: any) {
      this.logger.error(`AI content generation failed (${err.message}), using mock content`, err);
      return this.generateMockContent(input);
    }
  }

  private async callAiContent(input: GenerateContentInput, config: ResolvedAiConfig): Promise<MarketingContent> {
    const client = this.createClient(config);
    const model = config.model;
    const isIndonesian = input.language === "indonesian";
    const styleCues: Record<string, string> = {
      professional: "formal, professional, direct",
      friendly: "warm, friendly, approachable",
      casual: "casual, relaxed, conversational",
      balanced: "balanced, friendly yet professional",
    };
    const style = styleCues[input.contentStyle] || "balanced";

    const prompt = `Generate personalized outreach content for this business lead.

Business: ${input.businessName}
Industry: ${input.industry}
Address: ${input.address || "unknown"}
Rating: ${input.rating || "unknown"} stars
Has Website: ${input.hasWebsite ? "yes" : "no"}
Your Service/Product: ${input.yourService}
Tone: ${style}
Language: ${isIndonesian ? "Indonesian (Bahasa Indonesia)" : "English"}
AI Score: ${input.score}/100

Generate: email (subject + body, 100-150 words), WhatsApp (50-80 words, can use emoji), Instagram DM (40-60 words), LinkedIn connection note (under 280 chars), cold call opening (2-3 sentences).

Be specific to this business. Mention their name, rating, location.

Respond ONLY with valid JSON:
{
  "email": { "subject": "...", "body": "..." },
  "whatsapp": "...",
  "instagram": "...",
  "linkedin": { "connectionNote": "..." },
  "coldCall": { "opening": "..." }
}`;

    let rawContent = "";
    try {
      const response = await client.chat.completions.create({
        model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
        response_format: { type: "json_object" },
      });
      rawContent = response.choices[0]?.message?.content || "";
    } catch (formatErr: any) {
      this.logger.warn(`json_object response_format failed (${formatErr?.message}), retrying without json_object constraint...`);
      const response = await client.chat.completions.create({
        model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
      });
      rawContent = response.choices[0]?.message?.content || "";
    }

    let cleaned = rawContent.trim();
    if (cleaned.startsWith("```")) {
      cleaned = cleaned.replace(/^```[a-zA-Z]*\n?/, "").replace(/\n?```$/, "").trim();
    }
    return JSON.parse(cleaned) as MarketingContent;
  }

  generateMockContent(input: GenerateContentInput): MarketingContent {
    const isId = input.language === "indonesian";
    const name = input.businessName;
    const service = input.yourService;
    const ratingTag = input.rating ? ` dengan rating ${input.rating} bintang` : "";
    const ratingTagEn = input.rating ? ` with a ${input.rating}-star rating` : "";

    if (isId) {
      return {
        email: {
          subject: `Tingkatkan bisnis ${name} dengan ${service}`,
          body: `Halo tim ${name},\n\nSaya melihat bisnis Anda${ratingTag} — sangat impressive!\n\nSaya ingin berbagi bagaimana ${service} bisa membantu ${name} tumbuh lebih cepat dan melayani pelanggan lebih baik.\n\nApakah ada waktu 15 menit untuk berdiskusi?\n\nSalam,\n[Nama Anda]`,
        },
        whatsapp: `Halo ${name}! 👋\n\nSaya lihat bisnis Anda${input.rating ? ` rating ${input.rating}⭐` : ""} — keren!\n\nMau tau gimana ${service} bisa bantu ${name} makin berkembang? 🚀\n\nBoleh chat sebentar?`,
        instagram: `Hi ${name}! Bisnis kalian${input.rating ? ` rating ${input.rating}⭐` : ""} keren banget 🔥 Penasaran gimana ${service} bisa bantu bisnis kalian makin sukses. Yuk DM! ✨`,
        linkedin: { connectionNote: `Halo, saya tertarik dengan ${name}. Saya bergerak di bidang ${service} dan ingin berdiskusi tentang potensi kolaborasi.` },
        coldCall: { opening: `Selamat pagi, boleh berbicara dengan pemilik ${name}? Saya ingin berbagi bagaimana ${service} bisa membantu pertumbuhan ${name}.` },
      };
    }

    return {
      email: {
        subject: `Grow ${name} with ${service}`,
        body: `Hi ${name} team,\n\nI came across your business${ratingTagEn} — impressive work!\n\nI'd love to share how ${service} could help ${name} serve more customers and grow faster.\n\nWould you have 15 minutes for a quick chat?\n\nBest,\n[Your Name]`,
      },
      whatsapp: `Hi ${name}! 👋\n\nSaw your business${input.rating ? ` rated ${input.rating}⭐` : ""} — great work!\n\nWant to see how ${service} can help ${name} grow? 🚀\n\nQuick chat?`,
      instagram: `Hi ${name}! Love what you're doing${input.rating ? ` (${input.rating}⭐!)` : ""} 🔥 I think ${service} could take your business to the next level. DM me! ✨`,
      linkedin: { connectionNote: `Hi, I noticed ${name} and would love to connect. I specialize in ${service} and see great potential for collaboration.` },
      coldCall: { opening: `Hi, may I speak with the owner of ${name}? I'd love to share how ${service} could help grow ${name}.` },
    };
  }

  async generateWhatsAppColdMessage(input: GenerateWhatsAppInput, workspaceId?: string): Promise<string> {
    const aiConfig = await this.getAiConfig(workspaceId);
    if (!aiConfig) {
      return this.generateMockWhatsAppMessage(input);
    }

    try {
      const client = this.createClient(aiConfig);
      const model = aiConfig.model;
      const isIndonesian = (input.language || "indonesian") === "indonesian";
      const toneMap: Record<string, string> = {
        professional: "formal, sopan, B2B, fokus solusi",
        friendly: "hangat, ramah, bersahabat, santun",
        casual: "santai, to-the-point, santun dan ga kaku",
        direct: "langsung ke inti penawaran, ringkas, menarik",
        balanced: "seimbang, ramah profesional",
      };
      const toneStyle = toneMap[input.tone || "friendly"] || "hangat dan profesional";

      const prompt = `Anda adalah copywriter B2B dan sales outreach specialist berpengalaman di Indonesia.
Tolong buat SATU pesan WhatsApp Cold Outreach yang sangat natural, tidak terkesan spam atau robotik, untuk prospek bisnis berikut:

- Nama Bisnis: ${input.businessName}
- Kategori/Industri: ${input.industry || "Bisnis Lokal"}
- Alamat/Lokasi: ${input.address || "Indonesia"}
- Rating Google Maps: ${input.rating ? input.rating + " Bintang" : "Bagus"}
- Status Website: ${input.hasWebsite ? "Sudah ada website" : "Belum punya website"}
- Layanan Kita: ${input.yourService || "Solusi digital marketing & otomatisasi lead"}
- Tone: ${toneStyle}
- Bahasa: ${isIndonesian ? "Bahasa Indonesia yang santun dan wajar untuk WhatsApp bisnis" : "English"}
${input.customPrompt ? `- Petunjuk Khusus: ${input.customPrompt}` : ""}

Kriteria pesan WhatsApp:
1. Awali dengan sapaan hangat yang menyebut nama bisnis ${input.businessName}.
2. Sebutkan apresiasi atau fakta nyata (rating, lokasi, atau bisnis mereka) sebagai icebreaker alami.
3. Jelaskan singkat bagaimana layanan kita bisa membantu perkembangan mereka.
4. Akhiri dengan Call To Action (CTA) yang santai dan tidak memaksa (misal: "Boleh saya kirimkan detail singkatnya via chat ini Kak?").
5. Format WhatsApp rapi (gunakan baris baru dan emoji secukupnya, panjang 45-80 kata).

PENTING: Balas HANYA dengan teks pesan WhatsApp saja tanpa tanda kutip, tanpa markdown code block, dan tanpa penjelasan tambahan.`;

      const response = await client.chat.completions.create({
        model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
      });

      let content = response.choices[0]?.message?.content?.trim();
      if (content) {
        content = content.replace(/^```[a-zA-Z]*\n?/, "").replace(/\n?```$/, "").trim();
        if (content.startsWith('"') && content.endsWith('"')) {
          content = content.slice(1, -1).trim();
        }
      }
      return content || this.generateMockWhatsAppMessage(input);
    } catch (err: any) {
      this.logger.error(`AI WhatsApp generation failed (${err.message}), using mock template`, err);
      return this.generateMockWhatsAppMessage(input);
    }
  }

  generateMockWhatsAppMessage(input: GenerateWhatsAppInput): string {
    const isId = (input.language || "indonesian") === "indonesian";
    const name = input.businessName;
    const service = input.yourService || "solusi otomatisasi dan pertumbuhan bisnis";
    const ratingTag = input.rating ? ` (rating ${input.rating}⭐ di Google Maps)` : "";

    if (input.tone === "professional") {
      return isId
        ? `Selamat siang Tim ${name},\n\nSemoga hari Anda menyenangkan. Kami melihat profil bisnis ${name}${ratingTag} yang memiliki reputasi luar biasa di bidangnya.\n\nKami berfokus membantu bisnis sejenis meningkatkan konversi dan efisiensi operasional melalui ${service}.\n\nJika diperkenankan, apakah ada waktu luang singkat minggu ini untuk kami share ringkasan solusinya via chat ini?\n\nTerima kasih dan salam sukses,\nTim Prospex`
        : `Good day ${name} team,\n\nI noticed your great business profile${input.rating ? ` (${input.rating}⭐ on Maps)` : ""}.\n\nWe specialize in helping businesses in your industry scale efficiently through ${service}.\n\nWould you be open to a quick 5-minute chat this week to explore how this could benefit ${name}?\n\nBest regards,\nProspex Team`;
    }

    if (input.tone === "direct") {
      return isId
        ? `Halo ${name}! 👋\n\nLangsung saja, saya perhatikan ${name}${ratingTag} punya potensi besar untuk menjaring lebih banyak pelanggan baru setiap harinya.\n\nKami memiliki program ${service} yang dirancang khusus untuk mempercepat pertumbuhan penjualan.\n\nBoleh saya kirimkan overview singkatnya di WhatsApp ini Kak? 🙏`
        : `Hi ${name}! 👋\n\nI noticed ${name}${input.rating ? ` (${input.rating}⭐)` : ""} has great potential to acquire more high-value clients.\n\nWe provide ${service} that helps similar companies increase revenue.\n\nCan I send over a quick 1-pager summary here on WhatsApp?`;
    }

    // Default friendly
    return isId
      ? `Halo Kak dari ${name}! 👋\n\nSemoga usahanya makin lancar dan berkah ya. Saya lihat profil ${name}${ratingTag} keren banget dan respon pelanggannya positif! 👏\n\nKebetulan kami sedang membantu rekan-rekan bisnis melalui ${service} agar bisa closing lebih banyak prospek tanpa repot.\n\nKira-kira boleh saya kirimkan info singkatnya di WhatsApp ini Kak? Santai saja, kalau belum cocok juga tidak masalah 😊`
      : `Hi there from ${name}! 👋\n\nHope business is going great. Came across ${name}${input.rating ? ` (${input.rating}⭐)` : ""} and was really impressed by your profile! 👏\n\nWe help businesses grow and streamline leads through ${service}.\n\nWould you mind if I share a quick overview here on WhatsApp? No pressure at all 😊`;
  }
}
