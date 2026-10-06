import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import OpenAI from "openai";

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


@Injectable()
export class MarketingAiService {
  private readonly logger = new Logger(MarketingAiService.name);
  private openai: OpenAI | null = null;

  constructor(private config: ConfigService) {
    const apiKey = this.config.get<string>("OPENAI_API_KEY");
    if (apiKey) {
      this.openai = new OpenAI({
        apiKey,
        baseURL: this.config.get<string>("OPENAI_BASE_URL") || undefined,
      });
    }
  }

  async generateContent(input: GenerateContentInput): Promise<MarketingContent> {
    if (!this.openai) return this.generateMockContent(input);
    try {
      return await this.callOpenAI(input);
    } catch (err) {
      this.logger.error("OpenAI generation failed, using mock content", err);
      return this.generateMockContent(input);
    }
  }

  private async callOpenAI(input: GenerateContentInput): Promise<MarketingContent> {
    const model = this.config.get<string>("OPENAI_MODEL") || "gpt-4o-mini";
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

    const response = await this.openai!.chat.completions.create({
      model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
      response_format: { type: "json_object" },
    });
    return JSON.parse(response.choices[0].message.content!) as MarketingContent;
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

  async generateWhatsAppColdMessage(input: GenerateWhatsAppInput): Promise<string> {
    if (!this.openai) return this.generateMockWhatsAppMessage(input);
    try {
      const model = this.config.get<string>("OPENAI_MODEL") || "gpt-4o-mini";
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

      const response = await this.openai.chat.completions.create({
        model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
      });

      const content = response.choices[0]?.message?.content?.trim();
      return content || this.generateMockWhatsAppMessage(input);
    } catch (err) {
      this.logger.error("AI WhatsApp generation failed, using mock template", err);
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

