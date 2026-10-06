"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  MessageCircle,
  Mail,
  Send,
  Webhook,
  Plug,
  ArrowRight,
  Zap,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Server,
  HelpCircle,
  QrCode,
} from "lucide-react";
import Link from "next/link";
import { api } from "@/lib/api";
import { toast } from "sonner";
import type { WhatsAppProvider } from "@prospex/types";

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.05 } },
};
const item = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0 },
};

const otherIntegrations = [
  {
    id: "gmail",
    name: "Gmail",
    description: "Send emails to leads directly from Prospex using your Gmail account. Full tracking & follow-up.",
    icon: Mail,
    color: "text-red-500",
    bg: "bg-red-500/10",
    status: "coming_soon",
    category: "Email",
  },
  {
    id: "telegram",
    name: "Telegram",
    description: "Get real-time notifications when campaigns complete or leads update their status.",
    icon: Send,
    color: "text-blue-500",
    bg: "bg-blue-500/10",
    status: "coming_soon",
    category: "Notifications",
  },
  {
    id: "webhook",
    name: "Webhook",
    description: "Send lead data to any HTTP endpoint. Connect to Zapier, n8n, Make, or your own backend.",
    icon: Webhook,
    color: "text-orange-500",
    bg: "bg-orange-500/10",
    status: "coming_soon",
    category: "Automation",
  },
  {
    id: "zapier",
    name: "Zapier",
    description: "Connect Prospex to 6,000+ apps. Automate lead follow-up, CRM sync, and more.",
    icon: Zap,
    color: "text-amber-500",
    bg: "bg-amber-500/10",
    status: "coming_soon",
    category: "Automation",
  },
  {
    id: "n8n",
    name: "n8n",
    description: "Self-hosted automation workflows. Build powerful pipelines with Prospex leads.",
    icon: Plug,
    color: "text-purple-500",
    bg: "bg-purple-500/10",
    status: "coming_soon",
    category: "Automation",
  },
];

export function IntegrationsPage() {
  // Twenty CRM state
  const [twentyUrl, setTwentyUrl] = useState("http://192.168.1.125:3020");
  const [twentyApiKey, setTwentyApiKey] = useState("");
  const [isTwentyConfigured, setIsTwentyConfigured] = useState(false);
  const [twentyTesting, setTwentyTesting] = useState(false);
  const [twentySaving, setTwentySaving] = useState(false);

  // WhatsApp Unofficial Gateway state
  const [waProvider, setWaProvider] = useState<WhatsAppProvider>("waha");
  const [waApiUrl, setWaApiUrl] = useState("http://localhost:3000");
  const [waApiKey, setWaApiKey] = useState("");
  const [waSession, setWaSession] = useState("default");
  const [waSenderPhone, setWaSenderPhone] = useState("");
  const [isWaConfigured, setIsWaConfigured] = useState(false);
  const [waTesting, setWaTesting] = useState(false);
  const [waSaving, setWaSaving] = useState(false);

  // Test send dialog state
  const [testModalOpen, setTestModalOpen] = useState(false);
  const [testPhone, setTestPhone] = useState("");
  const [testMessage, setTestMessage] = useState("Halo! Ini adalah tes pengiriman WhatsApp dari Prospex AI Leads Maker 🚀");
  const [testSending, setTestSending] = useState(false);

  useEffect(() => {
    async function loadStatuses() {
      // 1. Twenty CRM status
      try {
        const res = await api.get<{ configured: boolean; apiUrl: string }>("/integrations/twenty/status");
        setIsTwentyConfigured(res.configured);
        if (res.apiUrl) setTwentyUrl(res.apiUrl);
      } catch (e) {
        console.error("Failed to load Twenty CRM status:", e);
      }

      // 2. WhatsApp status
      try {
        const waRes = await api.get<{
          configured: boolean;
          provider: WhatsAppProvider;
          apiUrl: string;
          session: string;
          senderPhone?: string;
        }>("/integrations/whatsapp/status");
        setIsWaConfigured(waRes.configured);
        if (waRes.provider) setWaProvider(waRes.provider);
        if (waRes.apiUrl) setWaApiUrl(waRes.apiUrl);
        if (waRes.session) setWaSession(waRes.session);
        if (waRes.senderPhone) setWaSenderPhone(waRes.senderPhone);
      } catch (e) {
        console.error("Failed to load WhatsApp Gateway status:", e);
      }
    }
    loadStatuses();
  }, []);

  // Twenty CRM handlers
  const handleTestTwenty = async () => {
    if (!twentyApiKey && !isTwentyConfigured) {
      toast.error("Please enter a Twenty CRM API key");
      return;
    }
    setTwentyTesting(true);
    try {
      const res = await api.post<{ success: boolean; message: string }>("/integrations/twenty/test", {
        apiUrl: twentyUrl,
        apiKey: twentyApiKey || undefined,
      });
      if (res.success) {
        toast.success(res.message);
      } else {
        toast.error(res.message);
      }
    } catch (e: any) {
      toast.error(e.message || "Failed to test connection");
    } finally {
      setTwentyTesting(false);
    }
  };

  const handleSaveTwenty = async () => {
    if (!twentyApiKey) {
      toast.error("Please enter your Twenty CRM API key");
      return;
    }
    setTwentySaving(true);
    try {
      const res = await api.post<{ success: boolean; message: string }>("/integrations/twenty/save", {
        apiUrl: twentyUrl,
        apiKey: twentyApiKey,
      });
      if (res.success) {
        setIsTwentyConfigured(true);
        toast.success("Twenty CRM configuration saved successfully!");
      }
    } catch (e: any) {
      toast.error(e.message || "Failed to save configuration");
    } finally {
      setTwentySaving(false);
    }
  };

  // WhatsApp Gateway handlers
  const handleTestWa = async () => {
    setWaTesting(true);
    try {
      const res = await api.post<{ success: boolean; message: string }>("/integrations/whatsapp/test", {
        provider: waProvider,
        apiUrl: waApiUrl,
        apiKey: waApiKey || undefined,
        session: waSession,
      });
      if (res.success) {
        toast.success(res.message);
      } else {
        toast.error(res.message);
      }
    } catch (e: any) {
      toast.error(e.message || "Gagal menguji koneksi WhatsApp Gateway");
    } finally {
      setWaTesting(false);
    }
  };

  const handleSaveWa = async () => {
    if (!waApiUrl) {
      toast.error("URL WhatsApp Gateway tidak boleh kosong");
      return;
    }
    setWaSaving(true);
    try {
      const res = await api.post<{ success: boolean; message: string }>("/integrations/whatsapp/save", {
        provider: waProvider,
        apiUrl: waApiUrl,
        apiKey: waApiKey || undefined,
        session: waSession || "default",
        senderPhone: waSenderPhone || undefined,
      });
      if (res.success) {
        setIsWaConfigured(true);
        toast.success("Pengaturan WhatsApp Gateway Unofficial berhasil disimpan!");
      }
    } catch (e: any) {
      toast.error(e.message || "Gagal menyimpan konfigurasi WhatsApp");
    } finally {
      setWaSaving(false);
    }
  };

  const handleSendTestMessage = async () => {
    if (!testPhone) {
      toast.error("Nomor tujuan WhatsApp tidak boleh kosong");
      return;
    }
    setTestSending(true);
    try {
      const res = await api.post<{ success: boolean; error?: string; messageId?: string }>(
        "/integrations/whatsapp/send-test",
        { phone: testPhone, message: testMessage }
      );
      if (res.success) {
        toast.success(`Pesan pengujian berhasil terkirim ke ${testPhone}! (ID: ${res.messageId})`);
        setTestModalOpen(false);
      } else {
        toast.error(res.error || "Gagal mengirim pesan pengujian");
      }
    } catch (e: any) {
      toast.error(e.message || "Gagal mengirim pesan pengujian");
    } finally {
      setTestSending(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Integrations & Channels</h1>
          <p className="text-muted-foreground mt-1">
            Hubungkan Prospex dengan WhatsApp API Unofficial, CRM, dan pipeline automasi Anda
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/settings">
            Configure AI Keys <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </div>

      {/* WhatsApp Unofficial API Featured Card */}
      <Card className="border-emerald-500/40 shadow-sm relative overflow-hidden bg-card/60 backdrop-blur">
        <div className="absolute top-0 left-0 h-1 w-full bg-emerald-500" />
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center font-bold text-emerald-600 text-xl shadow-sm">
                <MessageCircle className="w-5 h-5" />
              </div>
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  WhatsApp API Gateway (Unofficial)
                  {isWaConfigured ? (
                    <Badge variant="success" className="text-[10px]">
                      <CheckCircle2 className="w-3 h-3 mr-1 inline" /> Terhubung
                    </Badge>
                  ) : (
                    <Badge variant="warning" className="text-[10px]">
                      <AlertCircle className="w-3 h-3 mr-1 inline" /> Belum Dikonfigurasi (Fallback Aktif)
                    </Badge>
                  )}
                </CardTitle>
                <CardDescription className="text-xs mt-0.5">
                  Kirim pesan cold outreach massal otomatis menggunakan WhatsApp Gateway Unofficial (WAHA, Fonnte, Wablas, Baileys)
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setTestModalOpen(true)}
                disabled={!isWaConfigured && !waApiUrl}
                className="text-xs h-8 text-emerald-600 border-emerald-500/30 hover:bg-emerald-500/10"
              >
                <Send className="w-3 h-3 mr-1" />
                Test Kirim WA
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 pt-1">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Gateway Provider</Label>
              <Select value={waProvider} onValueChange={(v) => setWaProvider(v as WhatsAppProvider)}>
                <SelectTrigger className="text-xs h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="waha">WAHA (WhatsApp HTTP API)</SelectItem>
                  <SelectItem value="fonnte">Fonnte Gateway</SelectItem>
                  <SelectItem value="wablas">Wablas Gateway</SelectItem>
                  <SelectItem value="generic">Baileys / Custom HTTP API</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5 md:col-span-2">
              <Label className="text-xs font-medium">Gateway Server URL</Label>
              <Input
                value={waApiUrl}
                onChange={(e) => setWaApiUrl(e.target.value)}
                placeholder="http://localhost:3000 atau https://api.fonnte.com"
                className="text-xs h-9 font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="space-y-1.5 md:col-span-2">
              <Label className="text-xs font-medium">API Key / Token (Opsional jika tanpa auth)</Label>
              <Input
                type="password"
                value={waApiKey}
                onChange={(e) => setWaApiKey(e.target.value)}
                placeholder={isWaConfigured ? "••••••••••••••••••••••••••••••••" : "Masukkan API Key / Bearer Token jika ada"}
                className="text-xs h-9 font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Session ID</Label>
              <Input
                value={waSession}
                onChange={(e) => setWaSession(e.target.value)}
                placeholder="default"
                className="text-xs h-9 font-mono"
              />
            </div>
          </div>

          {/* Setup Hint Banner */}
          <div className="p-2.5 rounded-lg bg-emerald-500/5 border border-emerald-500/20 text-[11px] text-muted-foreground flex items-start gap-2">
            <HelpCircle className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
            <div className="leading-relaxed">
              <strong>Tips Menjalankan Gateway Mandiri:</strong> Jalankan WAHA menggunakan Docker:{" "}
              <code className="text-emerald-700 bg-emerald-500/10 px-1 py-0.5 rounded font-mono">
                docker run -d -p 3000:3000 devlikeapro/waha
              </code>
              , lalu scan QR di browser{" "}
              <code className="font-mono">http://localhost:3000/dashboard</code>. Jika Gateway belum aktif, Prospex secara otomatis menyediakan opsi kirim langsung via WhatsApp Web tanpa hambatan.
            </div>
          </div>

          <div className="flex items-center justify-between pt-2 border-t">
            <span className="text-[11px] text-muted-foreground">
              Status Sinkronisasi CRM: <strong>Otomatis mencatat log "Contacted" ke leads</strong>
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleTestWa}
                disabled={waTesting}
                className="text-xs h-8"
              >
                {waTesting ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                Test Koneksi
              </Button>
              <Button
                variant="gradient"
                size="sm"
                onClick={handleSaveWa}
                disabled={waSaving || !waApiUrl}
                className="text-xs h-8 bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {waSaving ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                Simpan Konfigurasi
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Twenty CRM Featured Integration Card */}
      <Card className="border-primary/40 shadow-sm relative overflow-hidden bg-card/60 backdrop-blur">
        <div className="absolute top-0 left-0 h-1 w-full bg-gradient-brand" />
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center font-bold text-primary text-xl shadow-sm">
                20
              </div>
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  Twenty CRM
                  {isTwentyConfigured ? (
                    <Badge variant="success" className="text-[10px]">
                      <CheckCircle2 className="w-3 h-3 mr-1 inline" /> Connected
                    </Badge>
                  ) : (
                    <Badge variant="warning" className="text-[10px]">
                      <AlertCircle className="w-3 h-3 mr-1 inline" /> Not Configured
                    </Badge>
                  )}
                </CardTitle>
                <CardDescription className="text-xs mt-0.5">
                  Automatically sync scraped leads to Twenty CRM Kanban pipeline, contacts & companies
                </CardDescription>
              </div>
            </div>
            <Button variant="outline" size="sm" asChild>
              <a href={twentyUrl} target="_blank" rel="noreferrer" className="text-xs">
                Open CRM ↗
              </a>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 pt-1">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Twenty CRM Server URL</Label>
              <Input
                value={twentyUrl}
                onChange={(e) => setTwentyUrl(e.target.value)}
                placeholder="http://192.168.1.125:3020"
                className="text-xs h-9 font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Twenty CRM API Key</Label>
              <Input
                type="password"
                value={twentyApiKey}
                onChange={(e) => setTwentyApiKey(e.target.value)}
                placeholder={isTwentyConfigured ? "••••••••••••••••••••••••••••••••" : "Paste API key from Twenty Settings"}
                className="text-xs h-9 font-mono"
              />
            </div>
          </div>
          <div className="flex items-center justify-between pt-2 border-t">
            <p className="text-[11px] text-muted-foreground">
              Tip: Get your key in Twenty CRM: <strong>Settings → Workspace → MCP & APIs</strong>.
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleTestTwenty}
                disabled={twentyTesting}
                className="text-xs h-8"
              >
                {twentyTesting ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                Test Connection
              </Button>
              <Button
                variant="gradient"
                size="sm"
                onClick={handleSaveTwenty}
                disabled={twentySaving || !twentyApiKey}
                className="text-xs h-8"
              >
                {twentySaving ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                Save Configuration
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Other Integrations */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Other Automation Integrations
        </h2>
        <motion.div
          variants={container}
          initial="hidden"
          animate="show"
          className="grid grid-cols-1 sm:grid-cols-2 gap-3"
        >
          {otherIntegrations.map((integration) => (
            <motion.div key={integration.id} variants={item}>
              <Card interactive className="relative overflow-hidden h-full">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${integration.bg} flex-shrink-0`}>
                        <integration.icon className={`w-5 h-5 ${integration.color}`} />
                      </div>
                      <div>
                        <CardTitle className="text-sm">{integration.name}</CardTitle>
                      </div>
                    </div>
                    <Badge variant="secondary" className="text-[10px] flex-shrink-0">
                      Coming Soon
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <CardDescription className="text-xs leading-relaxed">
                    {integration.description}
                  </CardDescription>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </motion.div>
      </div>

      {/* Test Send Dialog */}
      <Dialog open={testModalOpen} onOpenChange={setTestModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2">
              <Send className="w-4 h-4 text-emerald-600" />
              Kirim Pesan Uji Coba WhatsApp
            </DialogTitle>
            <DialogDescription className="text-xs">
              Uji coba pengiriman pesan ke nomor WhatsApp Anda sendiri untuk memastikan koneksi Gateway bekerja normal.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label className="text-xs font-medium">Nomor WhatsApp Tujuan (contoh: 081234567890)</Label>
              <Input
                value={testPhone}
                onChange={(e) => setTestPhone(e.target.value)}
                placeholder="6281234567890 atau 081234567890"
                className="text-xs h-9 font-mono"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-medium">Isi Pesan Uji Coba</Label>
              <Input
                value={testMessage}
                onChange={(e) => setTestMessage(e.target.value)}
                className="text-xs h-9"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setTestModalOpen(false)}
              className="text-xs"
            >
              Batal
            </Button>
            <Button
              type="button"
              variant="gradient"
              size="sm"
              onClick={handleSendTestMessage}
              disabled={testSending || !testPhone}
              className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {testSending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : null}
              Kirim Sekarang
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
