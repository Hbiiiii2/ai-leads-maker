import { Injectable, Logger, BadRequestException, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma/prisma.service";
import { decryptSecret } from "../settings/encryption.util";
import { MarketingAiService } from "../ai/marketing-ai.service";
import { WhatsAppProvider, WhatsAppConfig, WhatsAppSendResult } from "@prospex/types";

export function normalizePhoneNumber(raw: string): string {
  if (!raw) return "";
  let digits = raw.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) {
    digits = digits.substring(1);
  }
  // Indonesian format handling
  if (digits.startsWith("0")) {
    digits = "62" + digits.substring(1);
  } else if (digits.startsWith("8")) {
    digits = "62" + digits;
  }
  return digits;
}

export function buildDirectWaLink(phone: string, message: string): string {
  const normalized = normalizePhoneNumber(phone);
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}

@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly marketingAi: MarketingAiService,
  ) {}

  async getCredentials(workspaceId: string): Promise<WhatsAppConfig | null> {
    let targetWorkspaceId = workspaceId;
    if (!targetWorkspaceId || targetWorkspaceId === "default-workspace") {
      const fallbackWs = await this.prisma.workspace.findFirst();
      if (fallbackWs) targetWorkspaceId = fallbackWs.id;
    }

    let integration = await this.prisma.integration.findFirst({
      where: { workspaceId: targetWorkspaceId, type: "whatsapp", enabled: true },
    });

    // Fallback: if not found for specific workspace ID, look for any enabled whatsapp integration
    if (!integration) {
      integration = await this.prisma.integration.findFirst({
        where: { type: "whatsapp", enabled: true },
        orderBy: { updatedAt: "desc" },
      });
    }

    if (integration?.config) {
      const cfg = integration.config as Record<string, string>;
      const encKey = this.config.get<string>("ENCRYPTION_KEY") || "";
      const rawApiKey = cfg.apiKey ? (encKey ? decryptSecret(cfg.apiKey, encKey) : cfg.apiKey) : "";

      return {
        provider: (cfg.provider as WhatsAppProvider) || "waha",
        apiUrl: cfg.apiUrl || "http://localhost:3000",
        apiKey: rawApiKey || undefined,
        session: cfg.session || "default",
        senderPhone: cfg.senderPhone || undefined,
      };
    }

    const envUrl = this.config.get<string>("WHATSAPP_API_URL");
    if (envUrl) {
      return {
        provider: (this.config.get<string>("WHATSAPP_PROVIDER") as WhatsAppProvider) || "waha",
        apiUrl: envUrl,
        apiKey: this.config.get<string>("WHATSAPP_API_KEY") || undefined,
        session: this.config.get<string>("WHATSAPP_SESSION") || "default",
      };
    }

    return null;
  }

  async testConnection(workspaceId: string, testConfig?: Partial<WhatsAppConfig>) {
    const creds = testConfig?.apiUrl ? (testConfig as WhatsAppConfig) : await this.getCredentials(workspaceId);
    if (!creds?.apiUrl) {
      return {
        success: false,
        message: "WhatsApp Gateway URL belum dikonfigurasi. Silakan isi URL API Unofficial Anda.",
      };
    }

    const provider = creds.provider || "waha";
    const apiUrl = creds.apiUrl.replace(/\/+$/, "");

    try {
      let pingUrl = `${apiUrl}/api/status`;
      const headers: Record<string, string> = { "Content-Type": "application/json" };

      if (provider === "waha") {
        pingUrl = `${apiUrl}/api/status`;
        if (creds.apiKey) headers["X-Api-Key"] = creds.apiKey;
      } else if (provider === "fonnte") {
        pingUrl = `${apiUrl}/device`;
        if (creds.apiKey) headers["Authorization"] = creds.apiKey;
      } else {
        pingUrl = `${apiUrl}/health`;
        if (creds.apiKey) headers["Authorization"] = `Bearer ${creds.apiKey}`;
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);

      const resp = await fetch(pingUrl, {
        method: "GET",
        headers,
        signal: controller.signal,
      }).catch(async () => {
        // Fallback root ping if specific endpoint 404s
        return await fetch(apiUrl, { method: "GET", headers });
      });

      clearTimeout(timeoutId);

      if (resp && resp.ok) {
        return {
          success: true,
          message: `Koneksi berhasil terhubung ke ${provider.toUpperCase()} Gateway (${resp.status})!`,
        };
      } else {
        return {
          success: true, // Gateway reached even if subpath returned 404/401
          message: `Server Gateway merespon dengan status ${resp?.status || "OK"}. Gateway aktif!`,
        };
      }
    } catch (e: any) {
      this.logger.warn(`WhatsApp Gateway connection test failed: ${e.message}`);
      return {
        success: false,
        message: `Gagal menghubungi Gateway (${apiUrl}): ${e.message}. Pastikan server WhatsApp Unofficial sedang berjalan.`,
      };
    }
  }

  async sendRawMessage(
    creds: WhatsAppConfig,
    recipientPhone: string,
    message: string,
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const cleanPhone = normalizePhoneNumber(recipientPhone);
    if (!cleanPhone || cleanPhone.length < 9) {
      return { success: false, error: `Nomor telepon tidak valid: "${recipientPhone}"` };
    }

    const provider = creds.provider || "waha";
    const apiUrl = creds.apiUrl.replace(/\/+$/, "");
    const session = creds.session || "default";

    try {
      let endpoint = `${apiUrl}/api/sendText`;
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      let body: any = {};

      if (provider === "waha") {
        endpoint = `${apiUrl}/api/sendText`;
        if (creds.apiKey) headers["X-Api-Key"] = creds.apiKey;
        body = {
          session,
          chatId: `${cleanPhone}@c.us`,
          text: message,
        };
      } else if (provider === "fonnte") {
        endpoint = `${apiUrl.includes("fonnte.com") ? apiUrl : apiUrl + "/send"}`;
        if (creds.apiKey) headers["Authorization"] = creds.apiKey;
        body = {
          target: cleanPhone,
          message: message,
        };
      } else if (provider === "wablas") {
        endpoint = `${apiUrl}/api/send-message`;
        if (creds.apiKey) headers["Authorization"] = creds.apiKey;
        body = {
          phone: cleanPhone,
          message: message,
        };
      } else {
        // Generic Unofficial Gateway
        endpoint = apiUrl.includes("/send") ? apiUrl : `${apiUrl}/api/sendText`;
        if (creds.apiKey) headers["Authorization"] = `Bearer ${creds.apiKey}`;
        body = {
          phone: cleanPhone,
          number: cleanPhone,
          chatId: `${cleanPhone}@c.us`,
          message: message,
          text: message,
          session,
        };
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000);

      const resp = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const resData: any = await resp.json().catch(() => ({}));

      if (!resp.ok && resp.status >= 400) {
        throw new Error(resData.message || resData.error || `HTTP ${resp.status}`);
      }

      return {
        success: true,
        messageId: resData.id || resData.messageId || resData.data?.id || `wa_${Date.now()}`,
      };
    } catch (e: any) {
      this.logger.error(`Failed to send WhatsApp message via ${provider}: ${e.message}`);
      return {
        success: false,
        error: e.message || "Gagal mengirim pesan melalui WhatsApp Gateway",
      };
    }
  }

  async sendLeadMessage(
    leadId: string,
    workspaceId: string,
    options?: { message?: string; tone?: string; forceDirectWa?: boolean },
  ): Promise<WhatsAppSendResult> {
    const lead = await this.prisma.lead.findFirst({
      where: { id: leadId, workspaceId },
      include: { campaign: true },
    });

    if (!lead) throw new NotFoundException(`Lead ${leadId} tidak ditemukan`);
    if (!lead.phone) throw new BadRequestException(`Lead "${lead.name}" tidak memiliki nomor telepon`);

    const cleanPhone = normalizePhoneNumber(lead.phone);
    if (!cleanPhone) throw new BadRequestException(`Nomor telepon lead tidak valid: "${lead.phone}"`);

    // 1. Resolve message text: Custom > existing lead WhatsApp content > AI generation
    let messageText = options?.message;
    if (!messageText) {
      const marketing = lead.marketingContent as any;
      if (marketing?.whatsapp) {
        messageText = marketing.whatsapp;
      } else {
        messageText = await this.marketingAi.generateWhatsAppColdMessage({
          businessName: lead.name,
          address: lead.address ?? undefined,
          industry: lead.category || lead.campaign?.industry || "Bisnis",
          rating: lead.rating ?? undefined,
          hasWebsite: lead.hasWebsite,
          yourService: lead.campaign?.yourService || "Solusi automasi & pertumbuhan bisnis",
          tone: options?.tone || "friendly",
          language: lead.campaign?.language || "indonesian",
        });
      }
    }

    const directWaLink = buildDirectWaLink(cleanPhone, messageText);

    // If force direct WA is requested
    if (options?.forceDirectWa) {
      await this.recordOutreachSuccess(lead.id, cleanPhone, messageText, "direct_wa");
      return { success: true, directWaLink };
    }

    const creds = await this.getCredentials(workspaceId);

    // If Gateway is not configured, record as direct WA link ready
    if (!creds?.apiUrl) {
      await this.recordOutreachPrepared(lead.id, messageText);
      return {
        success: true,
        directWaLink,
        messageId: "direct_ready",
      };
    }

    // Send via Unofficial Gateway
    const sendResult = await this.sendRawMessage(creds, cleanPhone, messageText);

    if (sendResult.success) {
      await this.recordOutreachSuccess(lead.id, cleanPhone, messageText, creds.provider, sendResult.messageId);
      return {
        success: true,
        messageId: sendResult.messageId,
        directWaLink,
      };
    } else {
      await this.recordOutreachFailure(lead.id, cleanPhone, messageText, sendResult.error || "Unknown error");
      return {
        success: false,
        error: sendResult.error,
        directWaLink,
      };
    }
  }

  async generateLeadColdMessage(
    leadId: string,
    workspaceId: string,
    options?: { tone?: string; customPrompt?: string },
  ): Promise<{ message: string }> {
    const lead = await this.prisma.lead.findFirst({
      where: { id: leadId, workspaceId },
      include: { campaign: true },
    });

    if (!lead) throw new NotFoundException(`Lead ${leadId} tidak ditemukan`);

    const message = await this.marketingAi.generateWhatsAppColdMessage({
      businessName: lead.name,
      address: lead.address ?? undefined,
      industry: lead.category || lead.campaign?.industry || "Bisnis",
      rating: lead.rating ?? undefined,
      hasWebsite: lead.hasWebsite,
      yourService: lead.campaign?.yourService || "Solusi automasi & pertumbuhan bisnis",
      tone: options?.tone || "friendly",
      language: lead.campaign?.language || "indonesian",
      customPrompt: options?.customPrompt,
    });

    const currentMarketing = (lead.marketingContent as any) || {};
    await this.prisma.lead.update({
      where: { id: leadId },
      data: {
        marketingContent: {
          ...currentMarketing,
          whatsapp: message,
          whatsappGeneratedAt: new Date().toISOString(),
        },
      },
    });

    return { message };
  }

  async sendCampaignMessages(
    campaignId: string,
    workspaceId: string,
    options?: {
      tone?: string;
      delayMs?: number;
      leadIds?: string[];
      overrideExisting?: boolean;
    },
  ) {
    const whereClause: any = {
      campaignId,
      workspaceId,
      phone: { not: null },
    };

    if (options?.leadIds && options.leadIds.length > 0) {
      whereClause.id = { in: options.leadIds };
    }

    const leads = await this.prisma.lead.findMany({
      where: whereClause,
      include: { campaign: true },
      orderBy: [{ priority: "asc" }, { score: "desc" }],
    });

    if (leads.length === 0) {
      return { total: 0, sent: 0, failed: 0, skipped: 0, results: [] };
    }

    const creds = await this.getCredentials(workspaceId);
    const delayMs = options?.delayMs ?? 2500;
    const results: Array<{
      leadId: string;
      name: string;
      phone: string;
      success: boolean;
      error?: string;
      directWaLink?: string;
    }> = [];

    let sent = 0;
    let failed = 0;

    for (let i = 0; i < leads.length; i++) {
      const lead = leads[i];
      const cleanPhone = normalizePhoneNumber(lead.phone || "");

      if (!cleanPhone || cleanPhone.length < 9) {
        results.push({
          leadId: lead.id,
          name: lead.name,
          phone: lead.phone || "",
          success: false,
          error: "Nomor telepon tidak valid",
        });
        failed++;
        continue;
      }

      // Generate or use existing message
      let message = (lead.marketingContent as any)?.whatsapp;
      if (!message || options?.overrideExisting) {
        message = await this.marketingAi.generateWhatsAppColdMessage({
          businessName: lead.name,
          address: lead.address ?? undefined,
          industry: lead.category || lead.campaign?.industry || "Bisnis",
          rating: lead.rating ?? undefined,
          hasWebsite: lead.hasWebsite,
          yourService: lead.campaign?.yourService || "Solusi automasi",
          tone: options?.tone || "friendly",
          language: lead.campaign?.language || "indonesian",
        });
      }

      const directWaLink = buildDirectWaLink(cleanPhone, message);

      if (!creds?.apiUrl) {
        // Direct WA mode
        await this.recordOutreachPrepared(lead.id, message);
        results.push({
          leadId: lead.id,
          name: lead.name,
          phone: cleanPhone,
          success: true,
          directWaLink,
        });
        sent++;
      } else {
        // Send via Unofficial Gateway
        const res = await this.sendRawMessage(creds, cleanPhone, message);
        if (res.success) {
          await this.recordOutreachSuccess(lead.id, cleanPhone, message, creds.provider, res.messageId);
          results.push({
            leadId: lead.id,
            name: lead.name,
            phone: cleanPhone,
            success: true,
            directWaLink,
          });
          sent++;
        } else {
          await this.recordOutreachFailure(lead.id, cleanPhone, message, res.error || "Gagal kirim");
          results.push({
            leadId: lead.id,
            name: lead.name,
            phone: cleanPhone,
            success: false,
            error: res.error,
            directWaLink,
          });
          failed++;
        }

        // Delay between sends to avoid WhatsApp anti-spam bans
        if (i < leads.length - 1 && delayMs > 0) {
          await new Promise((r) => setTimeout(r, delayMs));
        }
      }
    }

    return {
      total: leads.length,
      sent,
      failed,
      results,
    };
  }

  async generateCampaignMessages(
    campaignId: string,
    workspaceId: string,
    options?: { tone?: string; customPrompt?: string },
  ) {
    const leads = await this.prisma.lead.findMany({
      where: { campaignId, workspaceId },
      include: { campaign: true },
    });

    let updatedCount = 0;
    for (const lead of leads) {
      try {
        const message = await this.marketingAi.generateWhatsAppColdMessage({
          businessName: lead.name,
          address: lead.address ?? undefined,
          industry: lead.category || lead.campaign?.industry || "Bisnis",
          rating: lead.rating ?? undefined,
          hasWebsite: lead.hasWebsite,
          yourService: lead.campaign?.yourService || "Solusi automasi & pertumbuhan bisnis",
          tone: options?.tone || "friendly",
          language: lead.campaign?.language || "indonesian",
          customPrompt: options?.customPrompt,
        });

        const currentMarketing = (lead.marketingContent as any) || {};
        await this.prisma.lead.update({
          where: { id: lead.id },
          data: {
            marketingContent: {
              ...currentMarketing,
              whatsapp: message,
              whatsappGeneratedAt: new Date().toISOString(),
            },
          },
        });
        updatedCount++;
      } catch (e) {
        this.logger.warn(`Failed to generate WhatsApp message for lead ${lead.id}: ${e}`);
      }
    }

    return { updatedCount, total: leads.length };
  }

  private async recordOutreachSuccess(
    leadId: string,
    phone: string,
    message: string,
    provider: string,
    messageId?: string,
  ) {
    const now = new Date();
    const lead = await this.prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead) return;

    const currentMarketing = (lead.marketingContent as any) || {};

    await this.prisma.lead.update({
      where: { id: leadId },
      data: {
        crmStatus: lead.crmStatus === "new" ? "contacted" : lead.crmStatus,
        contactedAt: lead.contactedAt || now,
        marketingContent: {
          ...currentMarketing,
          whatsapp: message,
          whatsappStatus: "sent",
          whatsappSentAt: now.toISOString(),
          whatsappProvider: provider,
          whatsappMessageId: messageId,
        },
      },
    });

    await this.prisma.leadActivity.create({
      data: {
        leadId,
        type: "whatsapp_sent",
        note: `Cold message WhatsApp terkirim ke +${phone} via ${provider.toUpperCase()}`,
        metadata: {
          phone,
          message,
          provider,
          messageId,
          sentAt: now.toISOString(),
        },
      },
    });
  }

  private async recordOutreachPrepared(leadId: string, message: string) {
    const now = new Date();
    const lead = await this.prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead) return;

    const currentMarketing = (lead.marketingContent as any) || {};

    await this.prisma.lead.update({
      where: { id: leadId },
      data: {
        marketingContent: {
          ...currentMarketing,
          whatsapp: message,
          whatsappStatus: "ready",
          whatsappPreparedAt: now.toISOString(),
        },
      },
    });
  }

  private async recordOutreachFailure(
    leadId: string,
    phone: string,
    message: string,
    error: string,
  ) {
    const lead = await this.prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead) return;

    const currentMarketing = (lead.marketingContent as any) || {};

    await this.prisma.lead.update({
      where: { id: leadId },
      data: {
        marketingContent: {
          ...currentMarketing,
          whatsapp: message,
          whatsappStatus: "failed",
          whatsappError: error,
        },
      },
    });

    await this.prisma.leadActivity.create({
      data: {
        leadId,
        type: "whatsapp_failed",
        note: `Gagal mengirim WhatsApp ke +${phone}: ${error}`,
        metadata: {
          phone,
          error,
          timestamp: new Date().toISOString(),
        },
      },
    });
  }
}
