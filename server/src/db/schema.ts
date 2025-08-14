import { 
  serial, 
  text, 
  pgTable, 
  timestamp, 
  integer, 
  boolean, 
  pgEnum,
  varchar,
  unique,
  index
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Enums
export const userRoleEnum = pgEnum('user_role', ['user', 'admin']);
export const tenantPlanEnum = pgEnum('tenant_plan', ['free', 'basic', 'premium', 'enterprise']);
export const userTenantRoleEnum = pgEnum('user_tenant_role', ['owner', 'admin', 'member']);
export const connectionStatusEnum = pgEnum('connection_status', ['connected', 'disconnected', 'pending', 'error']);
export const aiProviderNameEnum = pgEnum('ai_provider_name', ['openai', 'anthropic', 'google', 'azure']);
export const embeddingStatusEnum = pgEnum('embedding_status', ['pending', 'processing', 'completed', 'failed']);
export const responseToneEnum = pgEnum('response_tone', ['professional', 'friendly', 'casual', 'formal']);
export const messageTypeEnum = pgEnum('message_type', ['text', 'image', 'audio', 'video', 'document']);
export const messageDirectionEnum = pgEnum('message_direction', ['inbound', 'outbound']);
export const messageStatusEnum = pgEnum('message_status', ['sent', 'delivered', 'read', 'failed']);

// Users table
export const usersTable = pgTable('users', {
  id: serial('id').primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  password_hash: text('password_hash').notNull(),
  first_name: varchar('first_name', { length: 100 }).notNull(),
  last_name: varchar('last_name', { length: 100 }).notNull(),
  role: userRoleEnum('role').notNull().default('user'),
  is_active: boolean('is_active').notNull().default(true),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  emailIdx: index('users_email_idx').on(table.email),
}));

// Tenants table
export const tenantsTable = pgTable('tenants', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 100 }).notNull().unique(),
  plan: tenantPlanEnum('plan').notNull().default('free'),
  is_active: boolean('is_active').notNull().default(true),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  slugIdx: index('tenants_slug_idx').on(table.slug),
}));

// User-Tenant relationship table
export const userTenantsTable = pgTable('user_tenants', {
  id: serial('id').primaryKey(),
  user_id: integer('user_id').notNull().references(() => usersTable.id, { onDelete: 'cascade' }),
  tenant_id: integer('tenant_id').notNull().references(() => tenantsTable.id, { onDelete: 'cascade' }),
  role: userTenantRoleEnum('role').notNull().default('member'),
  created_at: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  userTenantUnique: unique().on(table.user_id, table.tenant_id),
  userIdx: index('user_tenants_user_idx').on(table.user_id),
  tenantIdx: index('user_tenants_tenant_idx').on(table.tenant_id),
}));

// WhatsApp connections table
export const whatsappConnectionsTable = pgTable('whatsapp_connections', {
  id: serial('id').primaryKey(),
  tenant_id: integer('tenant_id').notNull().references(() => tenantsTable.id, { onDelete: 'cascade' }),
  phone_number: varchar('phone_number', { length: 20 }).notNull(),
  connection_status: connectionStatusEnum('connection_status').notNull().default('disconnected'),
  qr_code: text('qr_code'),
  last_connected_at: timestamp('last_connected_at'),
  webhook_url: text('webhook_url'),
  access_token: text('access_token'),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  tenantIdx: index('whatsapp_connections_tenant_idx').on(table.tenant_id),
  phoneUnique: unique().on(table.tenant_id, table.phone_number),
}));

// AI providers table
export const aiProvidersTable = pgTable('ai_providers', {
  id: serial('id').primaryKey(),
  tenant_id: integer('tenant_id').notNull().references(() => tenantsTable.id, { onDelete: 'cascade' }),
  provider_name: aiProviderNameEnum('provider_name').notNull(),
  api_key: text('api_key').notNull(),
  model_name: varchar('model_name', { length: 100 }).notNull(),
  is_active: boolean('is_active').notNull().default(true),
  configuration: text('configuration').notNull().default('{}'),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  tenantIdx: index('ai_providers_tenant_idx').on(table.tenant_id),
  tenantProviderUnique: unique().on(table.tenant_id, table.provider_name),
}));

// Knowledge base documents table
export const knowledgeBaseDocumentsTable = pgTable('knowledge_base_documents', {
  id: serial('id').primaryKey(),
  tenant_id: integer('tenant_id').notNull().references(() => tenantsTable.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 255 }).notNull(),
  content: text('content').notNull(),
  file_name: varchar('file_name', { length: 255 }),
  file_size: integer('file_size'),
  file_type: varchar('file_type', { length: 50 }),
  is_processed: boolean('is_processed').notNull().default(false),
  embedding_status: embeddingStatusEnum('embedding_status').notNull().default('pending'),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  tenantIdx: index('knowledge_base_documents_tenant_idx').on(table.tenant_id),
  statusIdx: index('knowledge_base_documents_status_idx').on(table.embedding_status),
}));

// Bot configurations table
export const botConfigurationsTable = pgTable('bot_configurations', {
  id: serial('id').primaryKey(),
  tenant_id: integer('tenant_id').notNull().references(() => tenantsTable.id, { onDelete: 'cascade' }).unique(),
  bot_name: varchar('bot_name', { length: 100 }).notNull(),
  system_prompt: text('system_prompt').notNull(),
  language: varchar('language', { length: 10 }).notNull().default('en'),
  response_tone: responseToneEnum('response_tone').notNull().default('professional'),
  max_response_length: integer('max_response_length').notNull().default(500),
  enable_fallback: boolean('enable_fallback').notNull().default(true),
  fallback_message: text('fallback_message'),
  business_hours_start: varchar('business_hours_start', { length: 5 }),
  business_hours_end: varchar('business_hours_end', { length: 5 }),
  timezone: varchar('timezone', { length: 50 }).notNull().default('UTC'),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  tenantIdx: index('bot_configurations_tenant_idx').on(table.tenant_id),
}));

// Messages table
export const messagesTable = pgTable('messages', {
  id: serial('id').primaryKey(),
  tenant_id: integer('tenant_id').notNull().references(() => tenantsTable.id, { onDelete: 'cascade' }),
  whatsapp_connection_id: integer('whatsapp_connection_id').notNull().references(() => whatsappConnectionsTable.id, { onDelete: 'cascade' }),
  message_id: varchar('message_id', { length: 255 }).notNull(),
  sender_phone: varchar('sender_phone', { length: 20 }).notNull(),
  sender_name: varchar('sender_name', { length: 255 }),
  message_type: messageTypeEnum('message_type').notNull().default('text'),
  content: text('content').notNull(),
  direction: messageDirectionEnum('direction').notNull(),
  is_bot_response: boolean('is_bot_response').notNull().default(false),
  ai_provider_used: varchar('ai_provider_used', { length: 50 }),
  response_time_ms: integer('response_time_ms'),
  status: messageStatusEnum('status').notNull().default('sent'),
  created_at: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  tenantIdx: index('messages_tenant_idx').on(table.tenant_id),
  connectionIdx: index('messages_connection_idx').on(table.whatsapp_connection_id),
  createdAtIdx: index('messages_created_at_idx').on(table.created_at),
  messageIdUnique: unique().on(table.message_id, table.whatsapp_connection_id),
}));

// Usage statistics table
export const usageStatisticsTable = pgTable('usage_statistics', {
  id: serial('id').primaryKey(),
  tenant_id: integer('tenant_id').notNull().references(() => tenantsTable.id, { onDelete: 'cascade' }),
  date: timestamp('date').notNull(),
  messages_sent: integer('messages_sent').notNull().default(0),
  messages_received: integer('messages_received').notNull().default(0),
  ai_requests: integer('ai_requests').notNull().default(0),
  knowledge_base_queries: integer('knowledge_base_queries').notNull().default(0),
  active_connections: integer('active_connections').notNull().default(0),
  created_at: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  tenantDateUnique: unique().on(table.tenant_id, table.date),
  tenantIdx: index('usage_statistics_tenant_idx').on(table.tenant_id),
  dateIdx: index('usage_statistics_date_idx').on(table.date),
}));

// Relations
export const usersRelations = relations(usersTable, ({ many }) => ({
  userTenants: many(userTenantsTable),
}));

export const tenantsRelations = relations(tenantsTable, ({ many, one }) => ({
  userTenants: many(userTenantsTable),
  whatsappConnections: many(whatsappConnectionsTable),
  aiProviders: many(aiProvidersTable),
  knowledgeBaseDocuments: many(knowledgeBaseDocumentsTable),
  botConfiguration: one(botConfigurationsTable),
  messages: many(messagesTable),
  usageStatistics: many(usageStatisticsTable),
}));

export const userTenantsRelations = relations(userTenantsTable, ({ one }) => ({
  user: one(usersTable, {
    fields: [userTenantsTable.user_id],
    references: [usersTable.id],
  }),
  tenant: one(tenantsTable, {
    fields: [userTenantsTable.tenant_id],
    references: [tenantsTable.id],
  }),
}));

export const whatsappConnectionsRelations = relations(whatsappConnectionsTable, ({ one, many }) => ({
  tenant: one(tenantsTable, {
    fields: [whatsappConnectionsTable.tenant_id],
    references: [tenantsTable.id],
  }),
  messages: many(messagesTable),
}));

export const aiProvidersRelations = relations(aiProvidersTable, ({ one }) => ({
  tenant: one(tenantsTable, {
    fields: [aiProvidersTable.tenant_id],
    references: [tenantsTable.id],
  }),
}));

export const knowledgeBaseDocumentsRelations = relations(knowledgeBaseDocumentsTable, ({ one }) => ({
  tenant: one(tenantsTable, {
    fields: [knowledgeBaseDocumentsTable.tenant_id],
    references: [tenantsTable.id],
  }),
}));

export const botConfigurationsRelations = relations(botConfigurationsTable, ({ one }) => ({
  tenant: one(tenantsTable, {
    fields: [botConfigurationsTable.tenant_id],
    references: [tenantsTable.id],
  }),
}));

export const messagesRelations = relations(messagesTable, ({ one }) => ({
  tenant: one(tenantsTable, {
    fields: [messagesTable.tenant_id],
    references: [tenantsTable.id],
  }),
  whatsappConnection: one(whatsappConnectionsTable, {
    fields: [messagesTable.whatsapp_connection_id],
    references: [whatsappConnectionsTable.id],
  }),
}));

export const usageStatisticsRelations = relations(usageStatisticsTable, ({ one }) => ({
  tenant: one(tenantsTable, {
    fields: [usageStatisticsTable.tenant_id],
    references: [tenantsTable.id],
  }),
}));

// Export all tables for query building
export const tables = {
  users: usersTable,
  tenants: tenantsTable,
  userTenants: userTenantsTable,
  whatsappConnections: whatsappConnectionsTable,
  aiProviders: aiProvidersTable,
  knowledgeBaseDocuments: knowledgeBaseDocumentsTable,
  botConfigurations: botConfigurationsTable,
  messages: messagesTable,
  usageStatistics: usageStatisticsTable,
};

// Type exports for better TypeScript support
export type User = typeof usersTable.$inferSelect;
export type NewUser = typeof usersTable.$inferInsert;
export type Tenant = typeof tenantsTable.$inferSelect;
export type NewTenant = typeof tenantsTable.$inferInsert;
export type UserTenant = typeof userTenantsTable.$inferSelect;
export type NewUserTenant = typeof userTenantsTable.$inferInsert;
export type WhatsappConnection = typeof whatsappConnectionsTable.$inferSelect;
export type NewWhatsappConnection = typeof whatsappConnectionsTable.$inferInsert;
export type AIProvider = typeof aiProvidersTable.$inferSelect;
export type NewAIProvider = typeof aiProvidersTable.$inferInsert;
export type KnowledgeBaseDocument = typeof knowledgeBaseDocumentsTable.$inferSelect;
export type NewKnowledgeBaseDocument = typeof knowledgeBaseDocumentsTable.$inferInsert;
export type BotConfiguration = typeof botConfigurationsTable.$inferSelect;
export type NewBotConfiguration = typeof botConfigurationsTable.$inferInsert;
export type Message = typeof messagesTable.$inferSelect;
export type NewMessage = typeof messagesTable.$inferInsert;
export type UsageStatistics = typeof usageStatisticsTable.$inferSelect;
export type NewUsageStatistics = typeof usageStatisticsTable.$inferInsert;