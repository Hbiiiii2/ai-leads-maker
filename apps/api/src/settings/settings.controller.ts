import { Controller, Get, Post, Delete, Body, Param, UseGuards } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiBearerAuth } from "@nestjs/swagger";
import { SettingsService } from "./settings.service";
import { MarketingAiService } from "../ai/marketing-ai.service";
import { JwtGuard } from "../auth/jwt.guard";
import { WorkspaceId } from "../auth/current-workspace.decorator";

@ApiTags("Settings")
@ApiBearerAuth()
@UseGuards(JwtGuard)
@Controller("settings")
export class SettingsController {
  constructor(
    private readonly settingsService: SettingsService,
    private readonly marketingAiService: MarketingAiService,
  ) {}

  @Get("integrations")
  @ApiOperation({ summary: "List workspace integrations" })
  getIntegrations(@WorkspaceId() workspaceId: string) {
    return this.settingsService.getIntegrations(workspaceId);
  }

  @Post("integrations")
  @ApiOperation({ summary: "Save or update an integration" })
  upsertIntegration(
    @WorkspaceId() workspaceId: string,
    @Body() body: { type: string; name: string; config: Record<string, string> },
  ) {
    return this.settingsService.upsertIntegration(body.type, body.name, body.config, workspaceId);
  }

  @Post("ai/test")
  @ApiOperation({ summary: "Test AI configuration connection" })
  testAi(
    @WorkspaceId() workspaceId: string,
    @Body() body: { apiKey?: string; model?: string; baseURL?: string },
  ) {
    return this.marketingAiService.testConnection(workspaceId, body);
  }

  @Get("api-keys")
  @ApiOperation({ summary: "List API keys" })
  listApiKeys(@WorkspaceId() workspaceId: string) {
    return this.settingsService.listApiKeys(workspaceId);
  }

  @Post("api-keys")
  @ApiOperation({ summary: "Create a new API key" })
  createApiKey(
    @WorkspaceId() workspaceId: string,
    @Body() body: { name: string },
  ) {
    return this.settingsService.createApiKey(body.name, workspaceId);
  }

  @Delete("api-keys/:id")
  @ApiOperation({ summary: "Delete an API key" })
  deleteApiKey(@Param("id") id: string, @WorkspaceId() workspaceId: string) {
    return this.settingsService.deleteApiKey(id, workspaceId);
  }
}
