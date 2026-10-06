"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  MessageCircle,
  Sparkles,
  Send,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Phone,
  Clock,
  ExternalLink,
} from "lucide-react";
import { useLeads, type Lead } from "@/hooks/use-leads";
import { api } from "@/lib/api";
import { toast } from "sonner";

interface Props {
  campaignId: string;
  campaignName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete?: () => void;
}

export function WhatsAppCampaignModal({
  campaignId,
  campaignName,
  open,
  onOpenChange,
  onComplete,
}: Props) {
  const { leads, loading, refresh } = useLeads({ campaignId, limit: 100 });
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [tone, setTone] = useState("friendly");
  const [delaySec, setDelaySec] = useState("3");
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentLeadName, setCurrentLeadName] = useState("");
  const [sentCount, setSentCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);

  // Eligible leads: must have phone
  const eligibleLeads = leads.filter((l) => Boolean(l.phone));

  useEffect(() => {
    if (eligibleLeads.length > 0 && selectedIds.length === 0) {
      // Default: select all eligible leads that haven't been contacted yet
      const pendingIds = eligibleLeads
        .filter((l) => (l.marketingContent as any)?.whatsappStatus !== "sent" && l.crmStatus !== "contacted")
        .map((l) => l.id);
      setSelectedIds(pendingIds.length > 0 ? pendingIds : eligibleLeads.map((l) => l.id));
    }
  }, [eligibleLeads]);

  const handleToggleSelectAll = () => {
    if (selectedIds.length === eligibleLeads.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(eligibleLeads.map((l) => l.id));
    }
  };

  const handleToggleLead = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleGenerateAllAiMessages = async () => {
    setGenerating(true);
    try {
      const res = await api.post<{ updatedCount: number; total: number }>(
        `/integrations/whatsapp/generate-campaign-messages/${campaignId}`,
        { tone }
      );
      toast.success(`Berhasil membuat pesan AI untuk ${res.updatedCount} leads!`);
      await refresh();
    } catch (e: any) {
      toast.error(e.message || "Gagal membuat pesan AI massal");
    } finally {
      setGenerating(false);
    }
  };

  const handleStartBulkSend = async () => {
    if (selectedIds.length === 0) {
      toast.error("Pilih minimal 1 lead untuk dikirim pesan");
      return;
    }

    setSending(true);
    setProgress(0);
    setSentCount(0);
    setFailedCount(0);

    const delayMs = parseInt(delaySec, 10) * 1000;
    const leadsToSend = eligibleLeads.filter((l) => selectedIds.includes(l.id));

    let localSent = 0;
    let localFailed = 0;

    for (let i = 0; i < leadsToSend.length; i++) {
      const targetLead = leadsToSend[i];
      setCurrentLeadName(targetLead.name);
      setProgress(Math.round(((i) / leadsToSend.length) * 100));

      try {
        const res = await api.post<{ success: boolean; error?: string }>(
          `/integrations/whatsapp/send-lead/${targetLead.id}`,
          { tone }
        );

        if (res.success) {
          localSent++;
          setSentCount(localSent);
        } else {
          localFailed++;
          setFailedCount(localFailed);
        }
      } catch (err) {
        localFailed++;
        setFailedCount(localFailed);
      }

      // Delay between sending to avoid anti-spam ban
      if (i < leadsToSend.length - 1 && delayMs > 0) {
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }

    setProgress(100);
    setCurrentLeadName("Selesai!");
    setSending(false);
    toast.success(`Pengiriman selesai! Berhasil: ${localSent}, Gagal: ${localFailed}`);
    await refresh();
    onComplete?.();
  };

  const contactedCount = eligibleLeads.filter(
    (l) => (l.marketingContent as any)?.whatsappStatus === "sent" || l.crmStatus === "contacted"
  ).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader className="pb-2">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600">
              <MessageCircle className="w-5 h-5" />
            </div>
            <div>
              <DialogTitle className="text-lg">Otomasi WhatsApp Cold Outreach (AI)</DialogTitle>
              <DialogDescription className="text-xs">
                Kirim pesan cold outreach otomatis berbasis AI ke prospek pada campaign{" "}
                <span className="font-semibold text-foreground">"{campaignName}"</span>
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Campaign Stats Bar */}
        <div className="grid grid-cols-3 gap-2 py-2">
          <div className="bg-muted/40 p-2.5 rounded-lg border text-center">
            <p className="text-[11px] text-muted-foreground">Total Leads Ada No. WA</p>
            <p className="text-lg font-bold">{eligibleLeads.length}</p>
          </div>
          <div className="bg-muted/40 p-2.5 rounded-lg border text-center">
            <p className="text-[11px] text-muted-foreground">Sudah Dihubungi</p>
            <p className="text-lg font-bold text-emerald-600">{contactedCount}</p>
          </div>
          <div className="bg-muted/40 p-2.5 rounded-lg border text-center">
            <p className="text-[11px] text-muted-foreground">Siap Dikirim</p>
            <p className="text-lg font-bold text-primary">{selectedIds.length}</p>
          </div>
        </div>

        {/* Automation Controls */}
        <div className="bg-card p-3 rounded-lg border space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Label className="text-xs">Tone AI:</Label>
              <Select value={tone} onValueChange={setTone}>
                <SelectTrigger className="w-36 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="friendly">😊 Ramah & Santun</SelectItem>
                  <SelectItem value="professional">💼 Profesional B2B</SelectItem>
                  <SelectItem value="direct">⚡ To The Point</SelectItem>
                  <SelectItem value="casual">☕ Kasual Santai</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <Label className="text-xs flex items-center gap-1">
                <Clock className="w-3 h-3 text-muted-foreground" /> Jeda Antar Pesan:
              </Label>
              <Select value={delaySec} onValueChange={setDelaySec}>
                <SelectTrigger className="w-24 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 Detik</SelectItem>
                  <SelectItem value="3">3 Detik (Aman)</SelectItem>
                  <SelectItem value="5">5 Detik (Anti-Ban)</SelectItem>
                  <SelectItem value="8">8 Detik</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleGenerateAllAiMessages}
              disabled={generating || sending}
              className="h-8 text-xs gap-1.5 ml-auto bg-primary/5 hover:bg-primary/10 border-primary/20 text-primary"
            >
              {generating ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Generating AI...
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  Generate AI Semua Pesan
                </>
              )}
            </Button>
          </div>

          {/* Progress Bar during sending */}
          {sending && (
            <div className="space-y-1.5 pt-2 border-t">
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-600" />
                  Mengirim ke: <strong className="text-foreground">{currentLeadName}</strong>
                </span>
                <span className="font-semibold text-emerald-600">
                  {sentCount} Terkirim / {failedCount} Gagal
                </span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>
          )}
        </div>

        {/* Lead Checklist Table */}
        <div className="flex-1 overflow-y-auto border rounded-lg min-h-[200px] max-h-[300px] divide-y">
          <div className="flex items-center justify-between px-3 py-2 bg-muted/60 text-xs font-medium sticky top-0 z-10 backdrop-blur">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={selectedIds.length === eligibleLeads.length && eligibleLeads.length > 0}
                onChange={handleToggleSelectAll}
                disabled={sending}
                className="rounded border-gray-300 text-primary focus:ring-primary"
              />
              <span>Pilih Semua ({selectedIds.length}/{eligibleLeads.length})</span>
            </label>
            <span className="text-muted-foreground text-[11px]">Preview Pesan & Status</span>
          </div>

          {loading ? (
            <div className="p-8 text-center text-xs text-muted-foreground">Memuat data leads...</div>
          ) : eligibleLeads.length === 0 ? (
            <div className="p-8 text-center text-xs text-muted-foreground">
              Tidak ada lead dengan nomor telepon di campaign ini.
            </div>
          ) : (
            eligibleLeads.map((lead) => {
              const isSelected = selectedIds.includes(lead.id);
              const isLeadSent =
                (lead.marketingContent as any)?.whatsappStatus === "sent" || lead.crmStatus === "contacted";
              const hasAiMsg = Boolean((lead.marketingContent as any)?.whatsapp);

              return (
                <div
                  key={lead.id}
                  className={`flex items-center gap-3 px-3 py-2 text-xs hover:bg-muted/30 transition-colors ${
                    isSelected ? "bg-primary/5" : ""
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => handleToggleLead(lead.id)}
                    disabled={sending}
                    className="rounded border-gray-300 text-primary focus:ring-primary flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">{lead.name}</span>
                      {isLeadSent ? (
                        <Badge variant="success" className="text-[9px] py-0 px-1.5">
                          Terkirim
                        </Badge>
                      ) : hasAiMsg ? (
                        <Badge variant="info" className="text-[9px] py-0 px-1.5">
                          Pesan Siap
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-[9px] py-0 px-1.5">
                          Draft AI
                        </Badge>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground font-mono truncate">
                      {lead.phone} · Skor: {lead.score}
                    </p>
                  </div>
                  {(lead.marketingContent as any)?.whatsapp && (
                    <span
                      className="text-[11px] text-muted-foreground max-w-[180px] truncate hidden sm:block italic"
                      title={(lead.marketingContent as any)?.whatsapp}
                    >
                      "{(lead.marketingContent as any)?.whatsapp}"
                    </span>
                  )}
                </div>
              );
            })
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2 pt-2 border-t">
          <p className="text-[11px] text-muted-foreground sm:mr-auto flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            Status leads di CRM akan otomatis berubah ke <strong>"Contacted"</strong>.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={sending}
            className="text-xs h-9"
          >
            Tutup
          </Button>
          <Button
            type="button"
            variant="gradient"
            size="sm"
            onClick={handleStartBulkSend}
            disabled={sending || selectedIds.length === 0}
            className="text-xs h-9 gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {sending ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Mengirim ({sentCount}/{selectedIds.length})...
              </>
            ) : (
              <>
                <Send className="w-3.5 h-3.5" />
                Mulai Kirim WhatsApp ({selectedIds.length} Leads)
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
