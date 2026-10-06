"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Users,
  MessageCircle,
  CheckCircle2,
  TrendingUp,
  Search,
  Filter,
  RefreshCw,
  Phone,
  Sparkles,
  ChevronRight,
  ExternalLink,
  Kanban as KanbanIcon,
  List as ListIcon,
  MapPin,
  Calendar,
  Building2,
  Clock,
  Send,
  MoreHorizontal,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { useLeads, usePipelineStats, type Lead } from "@/hooks/use-leads";
import { useCampaigns } from "@/hooks/use-campaigns";
import { WhatsAppOutreachModal } from "./whatsapp-outreach-modal";
import { api } from "@/lib/api";
import { toast } from "sonner";

const STAGES: Array<{
  id: Lead["crmStatus"];
  label: string;
  icon: string;
  color: string;
  badgeVariant: "secondary" | "info" | "warning" | "success" | "destructive";
}> = [
  { id: "new", label: "New Leads", icon: "🔵", color: "border-blue-500/30 bg-blue-500/5", badgeVariant: "secondary" },
  { id: "contacted", label: "Contacted (WA)", icon: "📤", color: "border-sky-500/30 bg-sky-500/5", badgeVariant: "info" },
  { id: "replied", label: "Replied", icon: "💬", color: "border-indigo-500/30 bg-indigo-500/5", badgeVariant: "info" },
  { id: "meeting", label: "Meeting / Demo", icon: "📅", color: "border-amber-500/30 bg-amber-500/5", badgeVariant: "warning" },
  { id: "proposal", label: "Proposal", icon: "📄", color: "border-purple-500/30 bg-purple-500/5", badgeVariant: "warning" },
  { id: "won", label: "Won / Deal", icon: "✅", color: "border-emerald-500/30 bg-emerald-500/5", badgeVariant: "success" },
  { id: "lost", label: "Lost", icon: "❌", color: "border-rose-500/30 bg-rose-500/5", badgeVariant: "destructive" },
];

export function CrmPipeline() {
  const [viewMode, setViewMode] = useState<"kanban" | "table">("kanban");
  const [selectedCampaign, setSelectedCampaign] = useState<string>("all");
  const [selectedPriority, setSelectedPriority] = useState<string>("all");
  const [selectedWaStatus, setSelectedWaStatus] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [activeLeadForWa, setActiveLeadForWa] = useState<Lead | null>(null);

  const { campaigns } = useCampaigns();
  const { stats, loading: statsLoading, refresh: refreshStats } = usePipelineStats(
    selectedCampaign !== "all" ? selectedCampaign : undefined
  );

  const { leads, loading: leadsLoading, refresh: refreshLeads } = useLeads({
    campaignId: selectedCampaign !== "all" ? selectedCampaign : undefined,
    priority: selectedPriority !== "all" ? selectedPriority : undefined,
    limit: 200,
  });

  const handleRefresh = async () => {
    await Promise.all([refreshLeads(), refreshStats()]);
    toast.success("Data CRM Pipeline diperbarui");
  };

  const handleMoveStage = async (leadId: string, newStage: Lead["crmStatus"]) => {
    try {
      await api.patch(`/leads/${leadId}/crm`, { crmStatus: newStage });
      await Promise.all([refreshLeads(), refreshStats()]);
      toast.success(`Lead dipindahkan ke stage "${newStage}"`);
    } catch (e: any) {
      toast.error(e.message || "Gagal mengubah stage CRM");
    }
  };

  // Filter leads client-side for fast responsiveness
  const filteredLeads = useMemo(() => {
    return leads.filter((lead) => {
      if (search) {
        const q = search.toLowerCase();
        const matchName = lead.name.toLowerCase().includes(q);
        const matchPhone = lead.phone?.toLowerCase().includes(q);
        const matchAddress = lead.address?.toLowerCase().includes(q);
        if (!matchName && !matchPhone && !matchAddress) return false;
      }
      if (selectedWaStatus !== "all") {
        const isSent =
          (lead.marketingContent as any)?.whatsappStatus === "sent" || lead.contactedAt;
        if (selectedWaStatus === "sent" && !isSent) return false;
        if (selectedWaStatus === "not_sent" && isSent) return false;
      }
      return true;
    });
  }, [leads, search, selectedWaStatus]);

  // Group leads by stage for Kanban
  const groupedLeads = useMemo(() => {
    const groups: Record<Lead["crmStatus"], Lead[]> = {
      new: [],
      contacted: [],
      replied: [],
      meeting: [],
      proposal: [],
      won: [],
      lost: [],
    };
    for (const lead of filteredLeads) {
      const stage = (lead.crmStatus || "new") as Lead["crmStatus"];
      if (groups[stage]) {
        groups[stage].push(lead);
      } else {
        groups.new.push(lead);
      }
    }
    return groups;
  }, [filteredLeads]);

  const totalLeadsCount = stats?.total ?? leads.length;
  const contactedCount = stats?.whatsappSentCount ?? 0;
  const contactedPct = totalLeadsCount > 0 ? Math.round((contactedCount / totalLeadsCount) * 100) : 0;
  const wonCount = stats?.won ?? 0;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            CRM Pipeline & Outreach
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manajemen prospek terintegrasi, automasi WhatsApp cold message AI, dan pipeline deals
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-lg border bg-muted/40 p-1">
            <Button
              variant={viewMode === "kanban" ? "default" : "ghost"}
              size="sm"
              onClick={() => setViewMode("kanban")}
              className="h-7 text-xs px-2.5 gap-1.5"
            >
              <KanbanIcon className="w-3.5 h-3.5" />
              Kanban
            </Button>
            <Button
              variant={viewMode === "table" ? "default" : "ghost"}
              size="sm"
              onClick={() => setViewMode("table")}
              className="h-7 text-xs px-2.5 gap-1.5"
            >
              <ListIcon className="w-3.5 h-3.5" />
              Tabel
            </Button>
          </div>

          <Button variant="outline" size="sm" onClick={handleRefresh} className="h-9 text-xs gap-1.5">
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Metrics Banner */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Total Pipeline Leads</p>
                <p className="text-2xl font-bold mt-0.5">{totalLeadsCount}</p>
              </div>
              <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-600">
                <Users className="w-5 h-5" />
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground mt-2">
              Semua prospek terdaftar di sistem
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">WhatsApp Cold Sent</p>
                <p className="text-2xl font-bold mt-0.5 text-emerald-600">
                  {contactedCount}{" "}
                  <span className="text-xs font-normal text-muted-foreground">({contactedPct}%)</span>
                </p>
              </div>
              <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-600">
                <MessageCircle className="w-5 h-5" />
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground mt-2">
              Prospek yang sudah dihubungi via WhatsApp
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Replied & Engaged</p>
                <p className="text-2xl font-bold mt-0.5 text-indigo-600">
                  {stats?.replied ?? 0}
                </p>
              </div>
              <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-600">
                <TrendingUp className="w-5 h-5" />
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground mt-2">
              Leads yang aktif membalas pesan
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Won Deals (Closing)</p>
                <p className="text-2xl font-bold mt-0.5 text-primary">
                  {wonCount}
                </p>
              </div>
              <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
                <CheckCircle2 className="w-5 h-5" />
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground mt-2">
              Kesepakatan sukses ditutup
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex items-center gap-3 flex-wrap bg-card p-3 rounded-xl border">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Cari nama bisnis, nomor WA, atau alamat..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-9 text-xs"
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Campaign Filter */}
          <Select value={selectedCampaign} onValueChange={setSelectedCampaign}>
            <SelectTrigger className="w-40 h-9 text-xs">
              <SelectValue placeholder="Campaign" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Campaign</SelectItem>
              {campaigns.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Priority Filter */}
          <Select value={selectedPriority} onValueChange={setSelectedPriority}>
            <SelectTrigger className="w-32 h-9 text-xs">
              <SelectValue placeholder="Priority" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Prioritas</SelectItem>
              <SelectItem value="HIGH">High Priority</SelectItem>
              <SelectItem value="MEDIUM">Medium Priority</SelectItem>
              <SelectItem value="LOW">Low Priority</SelectItem>
            </SelectContent>
          </Select>

          {/* WhatsApp Status Filter */}
          <Select value={selectedWaStatus} onValueChange={setSelectedWaStatus}>
            <SelectTrigger className="w-40 h-9 text-xs">
              <SelectValue placeholder="Status WhatsApp" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Status WA</SelectItem>
              <SelectItem value="sent">Sudah Kirim WA</SelectItem>
              <SelectItem value="not_sent">Belum Kirim WA</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Main View: Kanban vs Table */}
      {leadsLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="h-96 animate-pulse bg-muted/40" />
          ))}
        </div>
      ) : viewMode === "kanban" ? (
        <div className="flex gap-4 overflow-x-auto pb-6 pt-1 items-start min-h-[550px]">
          {STAGES.map((stage) => {
            const stageLeads = groupedLeads[stage.id] || [];

            return (
              <div
                key={stage.id}
                className="w-72 flex-shrink-0 flex flex-col rounded-xl border bg-muted/30 backdrop-blur"
              >
                {/* Column Header */}
                <div className="p-3 border-b flex items-center justify-between sticky top-0 bg-muted/70 rounded-t-xl z-10">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm">{stage.icon}</span>
                    <span className="text-xs font-semibold">{stage.label}</span>
                  </div>
                  <Badge variant={stage.badgeVariant} className="text-[10px] py-0 px-1.5">
                    {stageLeads.length}
                  </Badge>
                </div>

                {/* Column Cards Container */}
                <div className="p-2 space-y-2.5 flex-1 min-h-[300px] overflow-y-auto max-h-[calc(100vh-320px)]">
                  {stageLeads.length === 0 ? (
                    <div className="h-28 flex items-center justify-center text-center p-3 text-[11px] text-muted-foreground border border-dashed rounded-lg">
                      Belum ada lead di tahap ini
                    </div>
                  ) : (
                    stageLeads.map((lead) => {
                      const isWaSent =
                        (lead.marketingContent as any)?.whatsappStatus === "sent" || lead.contactedAt;
                      const hasAiMsg = Boolean((lead.marketingContent as any)?.whatsapp);

                      return (
                        <Card
                          key={lead.id}
                          className="p-3 shadow-xs hover:shadow-md transition-shadow bg-card border relative group"
                        >
                          {/* Card Header */}
                          <div className="flex items-start justify-between gap-1 mb-1.5">
                            <Link
                              href={`/leads/${lead.id}`}
                              className="font-medium text-xs text-foreground hover:text-primary transition-colors line-clamp-1 flex-1"
                              title={lead.name}
                            >
                              {lead.name}
                            </Link>

                            {/* Move Stage Dropdown */}
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-5 w-5 text-muted-foreground hover:text-foreground opacity-60 group-hover:opacity-100"
                                >
                                  <MoreHorizontal className="w-3.5 h-3.5" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-48 text-xs">
                                <DropdownMenuLabel className="text-[11px]">Pindahkan Tahap</DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                {STAGES.map((s) => (
                                  <DropdownMenuItem
                                    key={s.id}
                                    onClick={() => handleMoveStage(lead.id, s.id)}
                                    disabled={s.id === stage.id}
                                    className="text-xs"
                                  >
                                    <span className="mr-2">{s.icon}</span> {s.label}
                                  </DropdownMenuItem>
                                ))}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>

                          {/* Address / Category */}
                          <p className="text-[11px] text-muted-foreground truncate mb-2">
                            {lead.category || lead.campaign?.industry || "Bisnis Lokal"}
                            {lead.address && ` · ${lead.address}`}
                          </p>

                          {/* WhatsApp & Score Row */}
                          <div className="flex items-center justify-between text-xs pt-1 border-t border-muted/50 mb-2">
                            <div className="flex items-center gap-1 font-mono text-[11px] text-muted-foreground">
                              <Phone className="w-3 h-3 text-emerald-600" />
                              <span>{lead.phone || "—"}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="text-[10px] text-muted-foreground">Skor:</span>
                              <span className="font-bold text-xs text-primary">{lead.score}</span>
                            </div>
                          </div>

                          {/* Status Pill & Action Button */}
                          <div className="flex items-center justify-between gap-1 pt-1">
                            {isWaSent ? (
                              <Badge variant="success" className="text-[9px] py-0 px-1.5 flex items-center gap-1">
                                <CheckCircle2 className="w-2.5 h-2.5" /> WA Terkirim
                              </Badge>
                            ) : hasAiMsg ? (
                              <Badge variant="outline" className="text-[9px] py-0 px-1.5 text-emerald-600 border-emerald-500/30 flex items-center gap-1">
                                <Sparkles className="w-2.5 h-2.5" /> Pesan Siap
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="text-[9px] py-0 px-1.5">
                                Belum WA
                              </Badge>
                            )}

                            {lead.phone && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setActiveLeadForWa(lead)}
                                className="h-6 text-[10px] px-2 gap-1 text-emerald-600 border-emerald-500/20 hover:bg-emerald-500/10 font-medium"
                              >
                                <MessageCircle className="w-3 h-3" />
                                {isWaSent ? "Chat Lagi" : "Kirim WA"}
                              </Button>
                            )}
                          </div>
                        </Card>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Table View */
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            <div className="divide-y text-xs">
              <div className="grid grid-cols-12 px-4 py-2.5 bg-muted/50 font-medium text-muted-foreground">
                <div className="col-span-4">Lead & Kontak</div>
                <div className="col-span-2">Campaign</div>
                <div className="col-span-2">Skor AI</div>
                <div className="col-span-2">Status WhatsApp</div>
                <div className="col-span-2 text-right">Stage & Aksi</div>
              </div>

              {filteredLeads.length === 0 ? (
                <div className="p-10 text-center text-muted-foreground">
                  Tidak ada lead yang cocok dengan filter.
                </div>
              ) : (
                filteredLeads.map((lead) => {
                  const isWaSent =
                    (lead.marketingContent as any)?.whatsappStatus === "sent" || lead.contactedAt;

                  return (
                    <div
                      key={lead.id}
                      className="grid grid-cols-12 px-4 py-3 items-center hover:bg-muted/30 transition-colors"
                    >
                      <div className="col-span-4 min-w-0 pr-2">
                        <Link href={`/leads/${lead.id}`} className="font-semibold text-foreground hover:text-primary">
                          {lead.name}
                        </Link>
                        <div className="flex items-center gap-2 text-[11px] text-muted-foreground font-mono mt-0.5">
                          <Phone className="w-3 h-3 text-emerald-600" />
                          <span>{lead.phone || "Tidak ada telepon"}</span>
                        </div>
                      </div>

                      <div className="col-span-2 truncate text-muted-foreground">
                        {lead.campaign?.name || "—"}
                      </div>

                      <div className="col-span-2">
                        <span className="font-bold text-primary">{lead.score}</span> / 100
                        <span className="text-[10px] text-muted-foreground block capitalize">{lead.priority} Priority</span>
                      </div>

                      <div className="col-span-2">
                        {isWaSent ? (
                          <Badge variant="success" className="text-[10px]">
                            Terkirim
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-[10px]">
                            Belum Terkirim
                          </Badge>
                        )}
                      </div>

                      <div className="col-span-2 flex items-center justify-end gap-1.5">
                        <Select
                          value={lead.crmStatus}
                          onValueChange={(val) => handleMoveStage(lead.id, val as Lead["crmStatus"])}
                        >
                          <SelectTrigger className="w-28 h-7 text-[11px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {STAGES.map((s) => (
                              <SelectItem key={s.id} value={s.id} className="text-xs">
                                {s.icon} {s.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        {lead.phone && (
                          <Button
                            size="icon"
                            variant="outline"
                            className="h-7 w-7 text-emerald-600"
                            onClick={() => setActiveLeadForWa(lead)}
                            title="Kirim Pesan WhatsApp"
                          >
                            <MessageCircle className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* WhatsApp Outreach Modal */}
      <WhatsAppOutreachModal
        lead={activeLeadForWa}
        open={!!activeLeadForWa}
        onOpenChange={(open) => !open && setActiveLeadForWa(null)}
        onSuccess={() => {
          refreshLeads();
          refreshStats();
        }}
      />
    </div>
  );
}
