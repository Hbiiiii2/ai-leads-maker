import { Controller, Get, Post, Body, Param, UseGuards } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiBearerAuth } from "@nestjs/swagger";
import { WhatsAppService } from "./whatsapp.service";
import { SettingsService } from "../settings/settings.service";
import { JwtGuard } from "../auth/jwt.guard";
import { WorkspaceId } from "../auth/current-workspace.decorator";
import { WhatsAppConfig, WhatsAppProvider } from "@prospex/types";

@ApiTags("WhatsApp Integration")
@ApiBearerAuth()
@UseGuards(JwtGuard)
@Controller("integrations/whatsapp")
export class WhatsAppController {
  constructor(
    private readonly whatsappService: WhatsAppService,
    private readonly settingsService: SettingsService,
  ) {}

  @Get("status")
  @ApiOperation({ summary: "Get WhatsApp Gateway configuration status" })
  async getStatus(@WorkspaceId() workspaceId: string) {
    const creds = await this.whatsappService.getCredentials(workspaceId);
    return {
      configured: !!creds?.apiUrl,
      provider: creds?.provider || "waha",
      apiUrl: creds?.apiUrl || "http://localhost:3000",
      session: creds?.session || "default",
      senderPhone: creds?.senderPhone || "",
    };
  }

  @Post("save")
  @ApiOperation({ summary: "Save WhatsApp Gateway configuration" })
  async saveConfig(
    @WorkspaceId() workspaceId: string,
    @Body()
    body: {
      provider: WhatsAppProvider;
      apiUrl: string;
      apiKey?: string;
      session?: string;
      senderPhone?: string;
    },
  ) {
    await this.settingsService.upsertIntegration(
      "whatsapp",
      "WhatsApp Gateway",
      {
        provider: body.provider || "waha",
        apiUrl: body.apiUrl,
        apiKey: body.apiKey,
        session: body.session || "default",
        senderPhone: body.senderPhone,
      },
      workspaceId,
    );

    return {
      success: true,
      message: "Konfigurasi WhatsApp Gateway berhasil disimpan!",
    };
  }

  @Post("test")
  @ApiOperation({ summary: "Test WhatsApp Gateway connection" })
  async testConnection(
    @WorkspaceId() workspaceId: string,
    @Body() body: Partial<WhatsAppConfig>,
  ) {
    return this.whatsappService.testConnection(workspaceId, body);
  }

  @Post("send-test")
  @ApiOperation({ summary: "Send a test WhatsApp message" })
  async sendTestMessage(
    @WorkspaceId() workspaceId: string,
    @Body() body: { phone: string; message: string },
  ) {
    const creds = await this.whatsappService.getCredentials(workspaceId);
    if (!creds) {
      return {
        success: false,
        error: "WhatsApp Gateway belum dikonfigurasi. Silakan simpan pengaturan terlebih dahulu.",
      };
    }
    return this.whatsappService.sendRawMessage(
      creds,
      body.phone,
      body.message || "Halo! Ini adalah pesan pengujian koneksi dari Prospex AI Lead Automation 🚀",
    );
  }

  @Post("send-lead/:id")
  @ApiOperation({ summary: "Send WhatsApp cold message to a lead" })
  async sendLeadMessage(
    @WorkspaceId() workspaceId: string,
    @Param("id") leadId: string,
    @Body() body: { message?: string; tone?: string; forceDirectWa?: boolean },
  ) {
    return this.whatsappService.sendLeadMessage(leadId, workspaceId, body);
  }

  @Post("generate-message/:id")
  @ApiOperation({ summary: "Generate AI cold message for a lead" })
  async generateLeadMessage(
    @WorkspaceId() workspaceId: string,
    @Param("id") leadId: string,
    @Body() body: { tone?: string; customPrompt?: string },
  ) {
    return this.whatsappService.generateLeadColdMessage(leadId, workspaceId, body);
  }

  @Post("send-campaign/:id")
  @ApiOperation({ summary: "Bulk send WhatsApp messages to all campaign leads" })
  async sendCampaign(
    @WorkspaceId() workspaceId: string,
    @Param("id") campaignId: string,
    @Body()
    body: {
      tone?: string;
      delayMs?: number;
      leadIds?: string[];
      overrideExisting?: boolean;
    },
  ) {
    return this.whatsappService.sendCampaignMessages(campaignId, workspaceId, body);
  }

  @Post("generate-campaign-messages/:id")
  @ApiOperation({ summary: "Bulk generate AI WhatsApp messages for all campaign leads" })
  async generateCampaignMessages(
    @WorkspaceId() workspaceId: string,
    @Param("id") campaignId: string,
    @Body() body: { tone?: string; customPrompt?: string },
  ) {
    return this.whatsappService.generateCampaignMessages(campaignId, workspaceId, body);
  }
}
