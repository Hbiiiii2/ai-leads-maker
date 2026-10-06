export type CampaignStatus = "draft" | "running" | "completed" | "failed" | "paused";
export type LeadPriority = "HIGH" | "MEDIUM" | "LOW";
export type CrmStatus = "new" | "contacted" | "replied" | "meeting" | "proposal" | "won" | "lost";
export type WorkspaceRole = "owner" | "admin" | "member";
export type IntegrationType = "openai" | "whatsapp" | "gmail" | "slack" | "telegram" | "webhook" | "twenty_crm";

export type WhatsAppProvider = "waha" | "fonnte" | "wablas" | "generic";

export interface WhatsAppConfig {
  provider: WhatsAppProvider;
  apiUrl: string;
  apiKey?: string;
  session?: string;
  senderPhone?: string;
}

export interface WhatsAppSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
  directWaLink?: string;
}

export interface CrmPipelineStats {
  total: number;
  new: number;
  contacted: number;
  replied: number;
  meeting: number;
  proposal: number;
  won: number;
  lost: number;
  whatsappSentCount: number;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

