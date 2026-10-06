import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { UpdateCrmDto } from "./dto/update-crm.dto";

const DEFAULT_WORKSPACE_ID = "default-workspace";

export interface LeadFilter {
  campaignId?: string;
  q?: string;
  priority?: string;
  status?: string;
  whatsappStatus?: string;
  page?: number;
  limit?: number;
}

@Injectable()
export class LeadsService {
  constructor(private prisma: PrismaService) {}

  async findAll(workspaceId = DEFAULT_WORKSPACE_ID, filter: LeadFilter = {}) {
    const { campaignId, q, priority, status, page = 1, limit = 50 } = filter;
    const skip = (page - 1) * limit;

    const where: any = {
      workspaceId,
      ...(campaignId && { campaignId }),
      ...(priority && { priority }),
      ...(status && { crmStatus: status }),
      ...(q && { name: { contains: q, mode: "insensitive" as const } }),
    };

    const [data, total] = await Promise.all([
      this.prisma.lead.findMany({
        where,
        orderBy: [{ priority: "asc" }, { score: "desc" }],
        skip,
        take: limit,
        include: {
          activities: { orderBy: { createdAt: "desc" }, take: 10 },
          campaign: { select: { id: true, name: true, industry: true, yourService: true } },
        },
      }),
      this.prisma.lead.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  async getPipelineStats(workspaceId = DEFAULT_WORKSPACE_ID, campaignId?: string) {
    const where = {
      workspaceId,
      ...(campaignId && { campaignId }),
    };

    const leads = await this.prisma.lead.findMany({
      where,
      select: {
        id: true,
        crmStatus: true,
        contactedAt: true,
        marketingContent: true,
      },
    });

    const stats: Record<string, number> = {
      total: leads.length,
      new: 0,
      contacted: 0,
      replied: 0,
      meeting: 0,
      proposal: 0,
      won: 0,
      lost: 0,
      whatsappSentCount: 0,
    };

    for (const lead of leads) {
      const s = lead.crmStatus || "new";
      if (stats[s] !== undefined) {
        stats[s]++;
      }
      const marketing = lead.marketingContent as any;
      if (marketing?.whatsappStatus === "sent" || lead.contactedAt) {
        stats.whatsappSentCount++;
      }
    }

    return stats;
  }

  async findOne(id: string, workspaceId = DEFAULT_WORKSPACE_ID) {
    const lead = await this.prisma.lead.findFirst({
      where: { id, workspaceId },
      include: {
        activities: { orderBy: { createdAt: "desc" } },
        campaign: { select: { id: true, name: true, industry: true, yourService: true, language: true } },
        followUps: { where: { done: false }, orderBy: { scheduledAt: "asc" } },
      },
    });
    if (!lead) throw new NotFoundException(`Lead ${id} not found`);
    return lead;
  }

  async updateCrm(id: string, dto: UpdateCrmDto, workspaceId = DEFAULT_WORKSPACE_ID) {
    const existing = await this.findOne(id, workspaceId);
    const now = new Date();
    const lead = await this.prisma.lead.update({
      where: { id },
      data: {
        ...(dto.crmStatus && { crmStatus: dto.crmStatus }),
        ...(dto.crmNotes !== undefined && { crmNotes: dto.crmNotes }),
        ...(dto.closeResult !== undefined && { closeResult: dto.closeResult }),
        ...(dto.followUpDate ? { followUpDate: new Date(dto.followUpDate) } : {}),
        ...(dto.crmStatus === "contacted" && !existing.contactedAt && { contactedAt: now }),
        ...(dto.crmStatus === "replied" && !existing.repliedAt && { repliedAt: now }),
        ...(["won", "lost"].includes(dto.crmStatus ?? "") && { closedAt: now }),
      },
    });

    await this.prisma.leadActivity.create({
      data: {
        leadId: id,
        type: "crm_update",
        note: dto.crmNotes ? `Catatan: ${dto.crmNotes.substring(0, 60)}` : `Status CRM diubah ke ${dto.crmStatus || existing.crmStatus}`,
        metadata: dto as object,
      },
    });
    return lead;
  }


  async createMany(leads: Array<{
    name: string;
    address?: string;
    lat?: number;
    lng?: number;
    phone?: string;
    website?: string;
    rating?: string;
    reviewCount?: number;
    hasWebsite?: boolean;
    referenceUrl?: string;
    score?: number;
    priority?: string;
    marketingContent?: object;
    aiAnalysis?: object;
    campaignId: string;
    workspaceId: string;
  }>) {
    return this.prisma.lead.createMany({ data: leads, skipDuplicates: true });
  }
}
