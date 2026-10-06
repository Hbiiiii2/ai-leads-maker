import { Module } from "@nestjs/common";
import { IntegrationsController } from "./integrations.controller";
import { WhatsAppController } from "./whatsapp.controller";
import { TwentyCrmService } from "./twenty-crm.service";
import { WhatsAppService } from "./whatsapp.service";
import { SettingsModule } from "../settings/settings.module";
import { AuthModule } from "../auth/auth.module";
import { AiModule } from "../ai/ai.module";

@Module({
  imports: [SettingsModule, AuthModule, AiModule],
  controllers: [IntegrationsController, WhatsAppController],
  providers: [TwentyCrmService, WhatsAppService],
  exports: [TwentyCrmService, WhatsAppService],
})
export class IntegrationsModule {}

