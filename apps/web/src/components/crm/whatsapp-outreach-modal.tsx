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
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MessageCircle, Sparkles, Send, ExternalLink, Copy, Check, Loader2, Phone, Building2 } from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import type { Lead } from "@/hooks/use-leads";

interface Props {
  lead: Lead | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function WhatsAppOutreachModal({ lead, open, onOpenChange, onSuccess }: Props) {
  const [message, setMessage] = useState("");
  const [tone, setTone] = useState("friendly");
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (lead) {
      const existingMsg = (lead.marketingContent as any)?.whatsapp || "";
      setMessage(existingMsg);
    }
  }, [lead]);

  if (!lead) return null;

  const handleGenerateAiMessage = async () => {
    setGenerating(true);
    try {
      const res = await api.post<{ message: string }>(
        `/integrations/whatsapp/generate-message/${lead.id}`,
        { tone }
      );
      if (res.message) {
        setMessage(res.message);
        toast.success("Pesan Cold Outreach berhasil digenerate oleh AI!");
      }
    } catch (e: any) {
      toast.error(e.message || "Gagal membuat pesan AI");
    } finally {
      setGenerating(false);
    }
  };

  const handleSendViaGateway = async () => {
    if (!message.trim()) {
      toast.error("Pesan WhatsApp tidak boleh kosong");
      return;
    }
    setSending(true);
    try {
      const res = await api.post<{ success: boolean; directWaLink?: string; error?: string }>(
        `/integrations/whatsapp/send-lead/${lead.id}`,
        { message }
      );

      if (res.success) {
        toast.success(`Pesan berhasil dikirim ke ${lead.name}! Status CRM diperbarui.`);
        onSuccess?.();
        onOpenChange(false);
      } else {
        toast.error(res.error || "Gagal mengirim via WhatsApp Gateway");
        if (res.directWaLink) {
          window.open(res.directWaLink, "_blank");
        }
      }
    } catch (e: any) {
      toast.error(e.message || "Gagal mengirim pesan");
    } finally {
      setSending(false);
    }
  };

  const handleOpenDirectWa = async () => {
    if (!message.trim()) {
      toast.error("Pesan WhatsApp tidak boleh kosong");
      return;
    }
    try {
      // Mark outreach and open link
      const res = await api.post<{ success: boolean; directWaLink: string }>(
        `/integrations/whatsapp/send-lead/${lead.id}`,
        { message, forceDirectWa: true }
      );
      if (res.directWaLink) {
        window.open(res.directWaLink, "_blank");
      }
      toast.success("Membuka WhatsApp Web dan mencatat status CRM!");
      onSuccess?.();
      onOpenChange(false);
    } catch (e: any) {
      const cleanPhone = lead.phone?.replace(/[^\d+]/g, "").replace(/^0/, "62") || "";
      window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`, "_blank");
      onSuccess?.();
      onOpenChange(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(message);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success("Pesan disalin ke clipboard!");
  };

  const isSent = (lead.marketingContent as any)?.whatsappStatus === "sent";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2 text-lg">
              <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-600">
                <MessageCircle className="w-5 h-5" />
              </div>
              WhatsApp Cold Outreach
            </DialogTitle>
            {isSent && (
              <Badge variant="success" className="text-xs">
                Sudah Terkirim
              </Badge>
            )}
          </div>
          <DialogDescription className="text-xs pt-1">
            Kirim pesan cold message yang dipersonalisasi khusus untuk prospek bisnis ini.
          </DialogDescription>
        </DialogHeader>

        {/* Lead Summary Info */}
        <div className="bg-muted/40 rounded-lg p-3 text-xs flex flex-wrap items-center justify-between gap-2 border">
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-primary" />
            <span className="font-semibold text-foreground">{lead.name}</span>
            {lead.category && (
              <Badge variant="secondary" className="text-[10px]">
                {lead.category}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2 text-muted-foreground font-mono">
            <Phone className="w-3.5 h-3.5 text-emerald-600" />
            <span>{lead.phone || "Tidak ada nomor"}</span>
          </div>
        </div>

        {/* AI Tone and Generator */}
        <div className="space-y-3 pt-1">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Label className="text-xs whitespace-nowrap">Gaya Bahasa (Tone):</Label>
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
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleGenerateAiMessage}
              disabled={generating}
              className="h-8 text-xs gap-1.5 bg-primary/5 hover:bg-primary/10 border-primary/20 text-primary"
            >
              {generating ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  {message ? "Regenerate AI" : "Buat Pesan dengan AI"}
                </>
              )}
            </Button>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <Label className="text-xs">Isi Pesan WhatsApp:</Label>
              <div className="flex items-center gap-2">
                <span>{message.length} karakter</span>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="flex items-center gap-1 hover:text-foreground transition-colors"
                >
                  {copied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
            </div>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Tulis pesan atau klik 'Buat Pesan dengan AI' untuk membuat draf otomatis..."
              rows={6}
              className="text-xs leading-relaxed font-sans"
            />
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2 pt-2 border-t">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleOpenDirectWa}
            className="text-xs h-9 gap-1.5 sm:mr-auto text-muted-foreground hover:text-foreground"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Buka WhatsApp Web
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="text-xs h-9"
          >
            Batal
          </Button>
          <Button
            type="button"
            variant="gradient"
            size="sm"
            onClick={handleSendViaGateway}
            disabled={sending || !message.trim()}
            className="text-xs h-9 gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {sending ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Mengirim...
              </>
            ) : (
              <>
                <Send className="w-3.5 h-3.5" />
                Kirim via WhatsApp API
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
