import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma/prisma.service";
import { decryptSecret } from "../settings/encryption.util";
import { normalizePhoneNumber } from "./whatsapp.service";

export interface SyncLeadResult {
  leadId: string;
  leadName: string;
  success: boolean;
  companyId?: string;
  personId?: string;
  opportunityId?: string;
  error?: string;
}

@Injectable()
export class TwentyCrmService {
  private readonly logger = new Logger(TwentyCrmService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async getCredentials(workspaceId: string): Promise<{ apiUrl: string; apiKey: string } | null> {
    // 1. Check database integration table for workspace
    const integration = await this.prisma.integration.findFirst({
      where: { workspaceId, type: "twenty_crm", enabled: true },
    });

    if (integration?.config) {
      const cfg = integration.config as Record<string, string>;
      const encKey = this.config.get<string>("ENCRYPTION_KEY") || "";
      const rawApiKey = cfg.apiKey ? (encKey ? decryptSecret(cfg.apiKey, encKey) : cfg.apiKey) : "";
      if (rawApiKey) {
        return {
          apiUrl: cfg.apiUrl || this.config.get<string>("TWENTY_CRM_URL") || "http://192.168.1.125:3020",
          apiKey: rawApiKey,
        };
      }
    }

    // 2. Check environment variables
    const envKey = this.config.get<string>("TWENTY_CRM_API_KEY");
    const envUrl = this.config.get<string>("TWENTY_CRM_URL") || "http://192.168.1.125:3020";

    if (envKey) {
      return { apiUrl: envUrl, apiKey: envKey };
    }

    return null;
  }

  async testConnection(workspaceId: string, apiUrl?: string, apiKey?: string) {
    let url = apiUrl;
    let key = apiKey;

    if (!url || !key) {
      const creds = await this.getCredentials(workspaceId);
      url = creds?.apiUrl;
      key = creds?.apiKey;
    }

    if (!url || !key) {
      return { success: false, message: "Twenty CRM credentials are not configured yet." };
    }

    const baseUrl = url.replace(/\/$/, "");
    try {
      const res = await fetch(`${baseUrl}/rest/companies`, {
        headers: { Authorization: `Bearer ${key}` },
      });
      if (res.ok) {
        return { success: true, message: "Successfully connected to Twenty CRM!" };
      }
      const errText = await res.text();
      return { success: false, message: `Twenty CRM error (${res.status}): ${errText}` };
    } catch (e: any) {
      return { success: false, message: `Failed to reach Twenty CRM: ${e.message}` };
    }
  }

  async syncLead(leadId: string, workspaceId: string): Promise<SyncLeadResult> {
    const creds = await this.getCredentials(workspaceId);
    if (!creds) {
      throw new Error("Twenty CRM credentials are not configured.");
    }

    const lead = await this.prisma.lead.findFirst({
      where: { id: leadId, workspaceId },
      include: { campaign: true },
    });

    if (!lead) {
      throw new Error(`Lead ${leadId} not found`);
    }

    const baseUrl = creds.apiUrl.replace(/\/$/, "");

    // 1. Create or Find Company in Twenty CRM
    const cleanDomain = lead.website
      ? lead.website.replace(/^https?:\/\//i, "").split("/")[0].trim()
      : undefined;

    const companyPayload: Record<string, any> = {
      name: lead.name,
      address: lead.address
        ? { addressStreet1: lead.address, addressCity: lead.campaign?.location || "" }
        : undefined,
    };
    if (cleanDomain) {
      companyPayload.domainName = { primaryLinkUrl: cleanDomain };
    }

    const companyRes = await fetch(`${baseUrl}/rest/companies`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${creds.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(companyPayload),
    });

    if (!companyRes.ok) {
      const err = await companyRes.text();
      this.logger.error(`Failed to create company in Twenty CRM: ${err}`);
      throw new Error(`Twenty CRM Company error: ${err}`);
    }

    const companyData = await companyRes.json();
    const companyId = companyData?.data?.createCompany?.id;

    // 2. Create Person (Contact PIC) if phone or email exists
    let personId: string | undefined;
    if (lead.phone || lead.email) {
      try {
        const rawDigits = normalizePhoneNumber(lead.phone || "");
        const formattedPhone = rawDigits ? `+${rawDigits}` : lead.phone;

        const personPayload: Record<string, any> = {
          name: { firstName: lead.name, lastName: "PIC" },
          companyId,
          jobTitle: lead.category
            ? `${lead.category} · Skor ${lead.score}`
            : `Owner / PIC · Skor ${lead.score}`,
        };

        if (formattedPhone) {
          personPayload.phones = { primaryPhoneNumber: formattedPhone };
        }
        if (lead.email) {
          personPayload.emails = { primaryEmail: lead.email };
        }

        const personRes = await fetch(`${baseUrl}/rest/people`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${creds.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(personPayload),
        });

        if (personRes.ok) {
          const personData = await personRes.json();
          personId = personData?.data?.createPerson?.id;
        }
      } catch (err) {
        this.logger.warn(`Failed to create person for lead ${lead.name}: ${err}`);
      }
    }

    // 3. Create Opportunity (Deal Card on Twenty Kanban / Table)
    let opportunityId: string | undefined;
    try {
      const stageMap: Record<string, string> = {
        new: "NEW",
        contacted: "SCREENING",
        replied: "SCREENING",
        meeting: "MEETING",
        proposal: "PROPOSAL",
        won: "CLOSED_WON",
        lost: "CLOSED_LOST",
      };
      const oppStage = stageMap[lead.crmStatus || "new"] || "NEW";

      const oppPayload: Record<string, any> = {
        name: lead.name,
        companyId,
        stage: oppStage,
      };
      if (personId) {
        oppPayload.pointOfContactId = personId;
      }

      const oppRes = await fetch(`${baseUrl}/rest/opportunities`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${creds.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(oppPayload),
      });

      if (oppRes.ok) {
        const oppData = await oppRes.json();
        opportunityId = oppData?.data?.createOpportunity?.id;
      }
    } catch (err) {
      this.logger.warn(`Failed to create opportunity for lead ${lead.name}: ${err}`);
    }

    // 4. Update Lead Activity in Prospex
    await this.prisma.leadActivity.create({
      data: {
        leadId: lead.id,
        type: "twenty_crm_sync",
        note: `Synced to Twenty CRM (Company ID: ${companyId})`,
        metadata: { companyId, personId, opportunityId },
      },
    });

    return {
      leadId: lead.id,
      leadName: lead.name,
      success: true,
      companyId,
      personId,
      opportunityId,
    };
  }

  async syncCampaignLeads(campaignId: string, workspaceId: string) {
    const leads = await this.prisma.lead.findMany({
      where: { campaignId, workspaceId },
    });

    const results: SyncLeadResult[] = [];
    for (const lead of leads) {
      try {
        const res = await this.syncLead(lead.id, workspaceId);
        results.push(res);
      } catch (e: any) {
        results.push({
          leadId: lead.id,
          leadName: lead.name,
          success: false,
          error: e.message,
        });
      }
    }

    return {
      total: leads.length,
      synced: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
      results,
    };
  }
}
