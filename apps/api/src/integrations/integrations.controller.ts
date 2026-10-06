import { Controller, Get, Post, Body, Param, UseGuards } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiBearerAuth } from "@nestjs/swagger";
import { TwentyCrmService } from "./twenty-crm.service";
import { SettingsService } from "../settings/settings.service";
import { JwtGuard } from "../auth/jwt.guard";
import { WorkspaceId } from "../auth/current-workspace.decorator";

@ApiTags("Integrations")
@ApiBearerAuth()
@UseGuards(JwtGuard)
@Controller("integrations")
export class IntegrationsController {
  constructor(
    private readonly twentyCrm: TwentyCrmService,
    private readonly settingsService: SettingsService,
  ) {}

  @Get("twenty/status")
  @ApiOperation({ summary: "Check Twenty CRM configuration status" })
  async getStatus(@WorkspaceId() workspaceId: string) {
    const creds = await this.twentyCrm.getCredentials(workspaceId);
    return {
      configured: !!creds?.apiKey,
      apiUrl: creds?.apiUrl || "http://192.168.1.125:3020",
    };
  }

  @Post("twenty/test")
  @ApiOperation({ summary: "Test Twenty CRM connection" })
  async testConnection(
    @WorkspaceId() workspaceId: string,
    @Body() body: { apiUrl?: string; apiKey?: string },
  ) {
    return this.twentyCrm.testConnection(workspaceId, body.apiUrl, body.apiKey);
  }

  @Post("twenty/save")
  @ApiOperation({ summary: "Save Twenty CRM configuration" })
  async saveConfig(
    @WorkspaceId() workspaceId: string,
    @Body() body: { apiUrl: string; apiKey: string },
  ) {
    await this.settingsService.upsertIntegration(
      "twenty_crm",
      "Twenty CRM",
      { apiUrl: body.apiUrl, apiKey: body.apiKey },
      workspaceId,
    );
    return { success: true, message: "Twenty CRM credentials saved successfully!" };
  }

  @Post("twenty/sync-lead/:id")
  @ApiOperation({ summary: "Sync a single lead to Twenty CRM" })
  async syncLead(
    @WorkspaceId() workspaceId: string,
    @Param("id") id: string,
  ) {
    return this.twentyCrm.syncLead(id, workspaceId);
  }

  @Post("twenty/sync-campaign/:id")
  @ApiOperation({ summary: "Sync all leads of a campaign to Twenty CRM" })
  async syncCampaign(
    @WorkspaceId() workspaceId: string,
    @Param("id") id: string,
  ) {
    return this.twentyCrm.syncCampaignLeads(id, workspaceId);
  }
}
