import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { normalizePhoneNumber } from "../integrations/whatsapp.service";

const DEFAULT_WORKSPACE_ID = "default-workspace";

@Injectable()
export class ExportService {
  constructor(private prisma: PrismaService) {}

  async getLeads(workspaceId = DEFAULT_WORKSPACE_ID, campaignId?: string) {
    return this.prisma.lead.findMany({
      where: { workspaceId, ...(campaignId && { campaignId }) },
      orderBy: [{ priority: "asc" }, { score: "desc" }],
      include: { campaign: { select: { name: true } } },
    });
  }

  toCsv(leads: Awaited<ReturnType<typeof this.getLeads>>): string {
    const headers = [
      "Nama Bisnis",
      "Kategori / Industri",
      "Stage CRM",
      "Status WhatsApp",
      "Nomor WhatsApp",
      "Link Chat WhatsApp",
      "Pesan Cold WhatsApp (AI)",
      "Skor AI (1-100)",
      "Prioritas",
      "Rating Google Maps",
      "Jumlah Review",
      "Alamat Lengkap",
      "Website",
      "Email",
      "Catatan CRM",
      "Jadwal Follow-Up",
      "Campaign",
      "Tanggal Dihubungi",
      "Tanggal Scrape",
    ];

    const escape = (v: unknown) => {
      if (v == null) return "";
      const s = String(v).trim();
      if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    };

    const stageLabels: Record<string, string> = {
      new: "New Lead",
      contacted: "Contacted (WA)",
      replied: "Replied",
      meeting: "Meeting / Demo",
      proposal: "Proposal",
      won: "Deal / Won",
      lost: "Lost / Closed",
    };

    const rows = leads.map((l) => {
      const marketing = (l.marketingContent as any) || {};
      const waMsg = marketing.whatsapp || "";
      const waStatus =
        marketing.whatsappStatus === "sent" || l.contactedAt
          ? "Terkirim (Sent)"
          : waMsg
          ? "Pesan AI Siap"
          : "Belum Dihubungi";

      const rawDigits = normalizePhoneNumber(l.phone || "");
      // Excel/Sheets format: '+628...' to ensure it's preserved as text without scientific notation or stripping leading zeroes
      const cleanPhone = rawDigits ? `+${rawDigits}` : (l.phone || "");
      const waLink = rawDigits ? `https://wa.me/${rawDigits}` : "";

      const crmStage = stageLabels[l.crmStatus || "new"] || (l.crmStatus || "new").toUpperCase();

      return [
        l.name,
        l.category || "Bisnis Lokal",
        crmStage,
        waStatus,
        cleanPhone,
        waLink,
        waMsg,
        l.score ?? 0,
        (l.priority || "MEDIUM").toUpperCase(),
        l.rating || "",
        l.reviewCount ?? "",
        l.address || "",
        l.website || "",
        l.email || "",
        l.crmNotes || "",
        l.followUpDate ? new Date(l.followUpDate).toISOString().split("T")[0] : "",
        l.campaign?.name ?? "",
        l.contactedAt ? new Date(l.contactedAt).toLocaleString("id-ID") : "",
        new Date(l.scrapedAt).toLocaleString("id-ID"),
      ].map(escape).join(",");
    });

    // \uFEFF is UTF-8 Byte Order Mark (BOM).
    // This guarantees that Google Sheets and Excel open the CSV with proper UTF-8 decoding,
    // preserving emojis, Indonesian characters, line breaks inside cells, and accents.
    return `\uFEFF${headers.join(",")}\n${rows.join("\n")}`;
  }

  toJson(leads: Awaited<ReturnType<typeof this.getLeads>>) {
    return leads.map((l) => ({
      id: l.id,
      name: l.name,
      address: l.address,
      lat: l.lat,
      lng: l.lng,
      phone: l.phone,
      email: l.email,
      website: l.website,
      rating: l.rating,
      reviewCount: l.reviewCount,
      score: l.score,
      priority: l.priority,
      crmStatus: l.crmStatus,
      crmNotes: l.crmNotes,
      hasWebsite: l.hasWebsite,
      campaign: l.campaign?.name,
      marketingContent: l.marketingContent,
      scrapedAt: l.scrapedAt,
    }));
  }

  toVCard(leads: Awaited<ReturnType<typeof this.getLeads>>): string {
    return leads
      .filter((l) => l.phone || l.email)
      .map((l) => {
        const lines = [
          "BEGIN:VCARD",
          "VERSION:3.0",
          `FN:${l.name}`,
          l.phone ? `TEL;TYPE=WORK:${l.phone}` : null,
          l.email ? `EMAIL;TYPE=WORK:${l.email}` : null,
          l.address ? `ADR;TYPE=WORK:;;${l.address};;;;` : null,
          l.website ? `URL:${l.website.startsWith("http") ? l.website : `https://${l.website}`}` : null,
          `NOTE:Score: ${l.score} | Priority: ${l.priority} | CRM: ${l.crmStatus}`,
          "END:VCARD",
        ];
        return lines.filter(Boolean).join("\r\n");
      })
      .join("\r\n");
  }
}
