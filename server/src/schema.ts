import { z } from 'zod';

// User schema
export const userSchema = z.object({
  id: z.number(),
  email: z.string().email(),
  password_hash: z.string(),
  first_name: z.string(),
  last_name: z.string(),
  role: z.enum(['user', 'admin']),
  is_active: z.boolean(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
});

export type User = z.infer<typeof userSchema>;

// Tenant schema
export const tenantSchema = z.object({
  id: z.number(),
  name: z.string(),
  slug: z.string(),
  plan: z.enum(['free', 'basic', 'premium', 'enterprise']),
  is_active: z.boolean(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
});

export type Tenant = z.infer<typeof tenantSchema>;

// User tenant relationship schema
export const userTenantSchema = z.object({
  id: z.number(),
  user_id: z.number(),
  tenant_id: z.number(),
  role: z.enum(['owner', 'admin', 'member']),
  created_at: z.coerce.date(),
});

export type UserTenant = z.infer<typeof userTenantSchema>;

// WhatsApp connection schema
export const whatsappConnectionSchema = z.object({
  id: z.number(),
  tenant_id: z.number(),
  phone_number: z.string(),
  connection_status: z.enum(['connected', 'disconnected', 'pending', 'error']),
  qr_code: z.string().nullable(),
  last_connected_at: z.coerce.date().nullable(),
  webhook_url: z.string().nullable(),
  access_token: z.string().nullable(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
});

export type WhatsappConnection = z.infer<typeof whatsappConnectionSchema>;

// AI provider schema
export const aiProviderSchema = z.object({
  id: z.number(),
  tenant_id: z.number(),
  provider_name: z.enum(['openai', 'anthropic', 'google', 'azure']),
  api_key: z.string(),
  model_name: z.string(),
  is_active: z.boolean(),
  configuration: z.string(), // JSON string for provider-specific config
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
});

export type AIProvider = z.infer<typeof aiProviderSchema>;

// Knowledge base document schema
export const knowledgeBaseDocumentSchema = z.object({
  id: z.number(),
  tenant_id: z.number(),
  title: z.string(),
  content: z.string(),
  file_name: z.string().nullable(),
  file_size: z.number().nullable(),
  file_type: z.string().nullable(),
  is_processed: z.boolean(),
  embedding_status: z.enum(['pending', 'processing', 'completed', 'failed']),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
});

export type KnowledgeBaseDocument = z.infer<typeof knowledgeBaseDocumentSchema>;

// Bot configuration schema
export const botConfigurationSchema = z.object({
  id: z.number(),
  tenant_id: z.number(),
  bot_name: z.string(),
  system_prompt: z.string(),
  language: z.string(),
  response_tone: z.enum(['professional', 'friendly', 'casual', 'formal']),
  max_response_length: z.number().int(),
  enable_fallback: z.boolean(),
  fallback_message: z.string().nullable(),
  business_hours_start: z.string().nullable(),
  business_hours_end: z.string().nullable(),
  timezone: z.string(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
});

export type BotConfiguration = z.infer<typeof botConfigurationSchema>;

// Message schema
export const messageSchema = z.object({
  id: z.number(),
  tenant_id: z.number(),
  whatsapp_connection_id: z.number(),
  message_id: z.string(),
  sender_phone: z.string(),
  sender_name: z.string().nullable(),
  message_type: z.enum(['text', 'image', 'audio', 'video', 'document']),
  content: z.string(),
  direction: z.enum(['inbound', 'outbound']),
  is_bot_response: z.boolean(),
  ai_provider_used: z.string().nullable(),
  response_time_ms: z.number().nullable(),
  status: z.enum(['sent', 'delivered', 'read', 'failed']),
  created_at: z.coerce.date(),
});

export type Message = z.infer<typeof messageSchema>;

// Usage statistics schema
export const usageStatisticsSchema = z.object({
  id: z.number(),
  tenant_id: z.number(),
  date: z.coerce.date(),
  messages_sent: z.number().int(),
  messages_received: z.number().int(),
  ai_requests: z.number().int(),
  knowledge_base_queries: z.number().int(),
  active_connections: z.number().int(),
  created_at: z.coerce.date(),
});

export type UsageStatistics = z.infer<typeof usageStatisticsSchema>;

// Input schemas for authentication
export const registerInputSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  first_name: z.string().min(1),
  last_name: z.string().min(1),
  tenant_name: z.string().min(1),
});

export type RegisterInput = z.infer<typeof registerInputSchema>;

export const loginInputSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

export type LoginInput = z.infer<typeof loginInputSchema>;

export const resetPasswordInputSchema = z.object({
  email: z.string().email(),
});

export type ResetPasswordInput = z.infer<typeof resetPasswordInputSchema>;

// Input schemas for WhatsApp connection
export const createWhatsappConnectionInputSchema = z.object({
  tenant_id: z.number(),
  phone_number: z.string(),
});

export type CreateWhatsappConnectionInput = z.infer<typeof createWhatsappConnectionInputSchema>;

export const updateWhatsappConnectionInputSchema = z.object({
  id: z.number(),
  connection_status: z.enum(['connected', 'disconnected', 'pending', 'error']).optional(),
  qr_code: z.string().nullable().optional(),
  webhook_url: z.string().nullable().optional(),
  access_token: z.string().nullable().optional(),
});

export type UpdateWhatsappConnectionInput = z.infer<typeof updateWhatsappConnectionInputSchema>;

// Input schemas for AI providers
export const createAIProviderInputSchema = z.object({
  tenant_id: z.number(),
  provider_name: z.enum(['openai', 'anthropic', 'google', 'azure']),
  api_key: z.string(),
  model_name: z.string(),
  configuration: z.string().optional(),
});

export type CreateAIProviderInput = z.infer<typeof createAIProviderInputSchema>;

export const updateAIProviderInputSchema = z.object({
  id: z.number(),
  api_key: z.string().optional(),
  model_name: z.string().optional(),
  is_active: z.boolean().optional(),
  configuration: z.string().optional(),
});

export type UpdateAIProviderInput = z.infer<typeof updateAIProviderInputSchema>;

// Input schemas for knowledge base documents
export const createKnowledgeBaseDocumentInputSchema = z.object({
  tenant_id: z.number(),
  title: z.string(),
  content: z.string(),
  file_name: z.string().nullable().optional(),
  file_size: z.number().nullable().optional(),
  file_type: z.string().nullable().optional(),
});

export type CreateKnowledgeBaseDocumentInput = z.infer<typeof createKnowledgeBaseDocumentInputSchema>;

export const updateKnowledgeBaseDocumentInputSchema = z.object({
  id: z.number(),
  title: z.string().optional(),
  content: z.string().optional(),
  is_processed: z.boolean().optional(),
  embedding_status: z.enum(['pending', 'processing', 'completed', 'failed']).optional(),
});

export type UpdateKnowledgeBaseDocumentInput = z.infer<typeof updateKnowledgeBaseDocumentInputSchema>;

// Input schemas for bot configuration
export const createBotConfigurationInputSchema = z.object({
  tenant_id: z.number(),
  bot_name: z.string(),
  system_prompt: z.string(),
  language: z.string(),
  response_tone: z.enum(['professional', 'friendly', 'casual', 'formal']),
  max_response_length: z.number().int().positive(),
  enable_fallback: z.boolean(),
  fallback_message: z.string().nullable().optional(),
  business_hours_start: z.string().nullable().optional(),
  business_hours_end: z.string().nullable().optional(),
  timezone: z.string(),
});

export type CreateBotConfigurationInput = z.infer<typeof createBotConfigurationInputSchema>;

export const updateBotConfigurationInputSchema = z.object({
  id: z.number(),
  bot_name: z.string().optional(),
  system_prompt: z.string().optional(),
  language: z.string().optional(),
  response_tone: z.enum(['professional', 'friendly', 'casual', 'formal']).optional(),
  max_response_length: z.number().int().positive().optional(),
  enable_fallback: z.boolean().optional(),
  fallback_message: z.string().nullable().optional(),
  business_hours_start: z.string().nullable().optional(),
  business_hours_end: z.string().nullable().optional(),
  timezone: z.string().optional(),
});

export type UpdateBotConfigurationInput = z.infer<typeof updateBotConfigurationInputSchema>;

// Input schemas for user profile
export const updateUserProfileInputSchema = z.object({
  id: z.number(),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  email: z.string().email().optional(),
});

export type UpdateUserProfileInput = z.infer<typeof updateUserProfileInputSchema>;

// Query input schemas
export const getMessagesInputSchema = z.object({
  tenant_id: z.number(),
  whatsapp_connection_id: z.number().optional(),
  limit: z.number().int().positive().optional(),
  offset: z.number().int().nonnegative().optional(),
});

export type GetMessagesInput = z.infer<typeof getMessagesInputSchema>;

export const getUsageStatisticsInputSchema = z.object({
  tenant_id: z.number(),
  start_date: z.coerce.date().optional(),
  end_date: z.coerce.date().optional(),
});

export type GetUsageStatisticsInput = z.infer<typeof getUsageStatisticsInputSchema>;