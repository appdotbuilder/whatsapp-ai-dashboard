import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { 
  tenantsTable, 
  usersTable, 
  userTenantsTable,
  whatsappConnectionsTable, 
  messagesTable, 
  aiProvidersTable 
} from '../db/schema';
import { 
  getDashboardOverview, 
  getConnectionStatus, 
  getAIProviderStatus 
} from '../handlers/dashboard';

// Test data
const testUser = {
  email: 'test@example.com',
  password_hash: 'hashed_password',
  first_name: 'John',
  last_name: 'Doe',
  role: 'user' as const,
};

const testTenant = {
  name: 'Test Company',
  slug: 'test-company',
  plan: 'basic' as const,
};

const testWhatsappConnection = {
  phone_number: '+1234567890',
  connection_status: 'connected' as const,
  last_connected_at: new Date(),
};

const testAIProvider = {
  provider_name: 'openai' as const,
  api_key: 'test-api-key',
  model_name: 'gpt-4',
  is_active: true,
  configuration: '{}',
};

describe('dashboard handlers', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  describe('getDashboardOverview', () => {
    it('should return comprehensive dashboard overview', async () => {
      // Create test data
      const [user] = await db.insert(usersTable)
        .values(testUser)
        .returning()
        .execute();

      const [tenant] = await db.insert(tenantsTable)
        .values(testTenant)
        .returning()
        .execute();

      await db.insert(userTenantsTable)
        .values({
          user_id: user.id,
          tenant_id: tenant.id,
          role: 'owner',
        })
        .execute();

      // Create WhatsApp connections
      const [connection1] = await db.insert(whatsappConnectionsTable)
        .values({
          ...testWhatsappConnection,
          tenant_id: tenant.id,
        })
        .returning()
        .execute();

      await db.insert(whatsappConnectionsTable)
        .values({
          ...testWhatsappConnection,
          tenant_id: tenant.id,
          phone_number: '+0987654321',
          connection_status: 'disconnected',
        })
        .execute();

      // Create AI providers
      await db.insert(aiProvidersTable)
        .values({
          ...testAIProvider,
          tenant_id: tenant.id,
        })
        .execute();

      await db.insert(aiProvidersTable)
        .values({
          ...testAIProvider,
          tenant_id: tenant.id,
          provider_name: 'anthropic',
          is_active: false,
        })
        .execute();

      // Create messages with specific timestamps to ensure ordering
      const now = new Date();
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      
      const earlierToday = new Date(now);
      earlierToday.setHours(now.getHours() - 2);
      
      const laterToday = new Date(now);
      laterToday.setHours(now.getHours() - 1);

      // Message from yesterday (within week) - oldest
      await db.insert(messagesTable)
        .values({
          tenant_id: tenant.id,
          whatsapp_connection_id: connection1.id,
          message_id: 'msg3',
          sender_phone: '+2222222222',
          message_type: 'text',
          content: 'Yesterday message',
          direction: 'inbound',
          is_bot_response: false,
          status: 'read',
          created_at: yesterday,
        })
        .execute();

      // Earlier message today
      await db.insert(messagesTable)
        .values({
          tenant_id: tenant.id,
          whatsapp_connection_id: connection1.id,
          message_id: 'msg1',
          sender_phone: '+1111111111',
          message_type: 'text',
          content: 'Hello',
          direction: 'inbound',
          is_bot_response: false,
          status: 'read',
          created_at: earlierToday,
        })
        .execute();

      // Bot response today - most recent
      await db.insert(messagesTable)
        .values({
          tenant_id: tenant.id,
          whatsapp_connection_id: connection1.id,
          message_id: 'msg2',
          sender_phone: '+1234567890',
          message_type: 'text',
          content: 'Bot response',
          direction: 'outbound',
          is_bot_response: true,
          ai_provider_used: 'openai',
          response_time_ms: 1500,
          status: 'sent',
          created_at: laterToday,
        })
        .execute();

      const result = await getDashboardOverview(tenant.id);

      // Verify WhatsApp status
      expect(result.whatsapp_status.total_connections).toEqual(2);
      expect(result.whatsapp_status.active_connections).toEqual(1);
      expect(result.whatsapp_status.connections).toHaveLength(2);
      expect(result.whatsapp_status.connections[0].connection_status).toEqual('connected');

      // Verify recent messages
      expect(result.recent_messages).toHaveLength(3);
      expect(result.recent_messages[0].content).toEqual('Bot response'); // Most recent first

      // Verify AI providers
      expect(result.ai_providers.total_providers).toEqual(2);
      expect(result.ai_providers.active_providers).toEqual(1);
      expect(result.ai_providers.providers).toHaveLength(2);

      // Verify stats
      expect(result.stats.messages_today).toEqual(2);
      expect(result.stats.messages_this_week).toEqual(3);
      expect(result.stats.avg_response_time).toEqual(1500);
      expect(result.stats.bot_accuracy).toEqual(100); // 1 successful bot response
    });

    it('should handle tenant with no data', async () => {
      // Create minimal tenant
      const [tenant] = await db.insert(tenantsTable)
        .values(testTenant)
        .returning()
        .execute();

      const result = await getDashboardOverview(tenant.id);

      expect(result.whatsapp_status.total_connections).toEqual(0);
      expect(result.whatsapp_status.active_connections).toEqual(0);
      expect(result.whatsapp_status.connections).toHaveLength(0);
      expect(result.recent_messages).toHaveLength(0);
      expect(result.ai_providers.total_providers).toEqual(0);
      expect(result.ai_providers.active_providers).toEqual(0);
      expect(result.stats.messages_today).toEqual(0);
      expect(result.stats.messages_this_week).toEqual(0);
      expect(result.stats.avg_response_time).toEqual(0);
      expect(result.stats.bot_accuracy).toEqual(0);
    });

    it('should reject invalid tenant ID', async () => {
      await expect(getDashboardOverview(999)).rejects.toThrow(/tenant with id 999 not found/i);
    });
  });

  describe('getConnectionStatus', () => {
    it('should return connection status with message counts', async () => {
      // Create test data
      const [tenant] = await db.insert(tenantsTable)
        .values(testTenant)
        .returning()
        .execute();

      const [connection1] = await db.insert(whatsappConnectionsTable)
        .values({
          ...testWhatsappConnection,
          tenant_id: tenant.id,
        })
        .returning()
        .execute();

      const [connection2] = await db.insert(whatsappConnectionsTable)
        .values({
          ...testWhatsappConnection,
          tenant_id: tenant.id,
          phone_number: '+0987654321',
          connection_status: 'pending',
          last_connected_at: null,
        })
        .returning()
        .execute();

      // Create messages today for first connection
      const now = new Date();
      const today = new Date(now);
      today.setHours(10, 0, 0, 0); // Set to 10 AM today
      
      await db.insert(messagesTable)
        .values({
          tenant_id: tenant.id,
          whatsapp_connection_id: connection1.id,
          message_id: 'msg1',
          sender_phone: '+1111111111',
          message_type: 'text',
          content: 'Today message 1',
          direction: 'inbound',
          is_bot_response: false,
          status: 'read',
          created_at: today,
        })
        .execute();

      await db.insert(messagesTable)
        .values({
          tenant_id: tenant.id,
          whatsapp_connection_id: connection1.id,
          message_id: 'msg2',
          sender_phone: '+1111111111',
          message_type: 'text',
          content: 'Today message 2',
          direction: 'outbound',
          is_bot_response: true,
          status: 'sent',
          created_at: today,
        })
        .execute();

      // Create message yesterday (should not count)
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(10, 0, 0, 0);
      await db.insert(messagesTable)
        .values({
          tenant_id: tenant.id,
          whatsapp_connection_id: connection1.id,
          message_id: 'msg3',
          sender_phone: '+1111111111',
          message_type: 'text',
          content: 'Yesterday message',
          direction: 'inbound',
          is_bot_response: false,
          status: 'read',
          created_at: yesterday,
        })
        .execute();

      const result = await getConnectionStatus(tenant.id);

      expect(result.connections).toHaveLength(2);
      
      const conn1 = result.connections.find(c => c.phone_number === '+1234567890');
      expect(conn1).toBeDefined();
      expect(conn1!.status).toEqual('connected');
      expect(conn1!.last_connected).toBeInstanceOf(Date);
      expect(conn1!.messages_today).toEqual(2);

      const conn2 = result.connections.find(c => c.phone_number === '+0987654321');
      expect(conn2).toBeDefined();
      expect(conn2!.status).toEqual('pending');
      expect(conn2!.last_connected).toBeNull();
      expect(conn2!.messages_today).toEqual(0);
    });

    it('should handle tenant with no connections', async () => {
      const [tenant] = await db.insert(tenantsTable)
        .values(testTenant)
        .returning()
        .execute();

      const result = await getConnectionStatus(tenant.id);

      expect(result.connections).toHaveLength(0);
    });

    it('should reject invalid tenant ID', async () => {
      await expect(getConnectionStatus(999)).rejects.toThrow(/tenant with id 999 not found/i);
    });
  });

  describe('getAIProviderStatus', () => {
    it('should return AI provider status with usage metrics', async () => {
      // Create test data
      const [tenant] = await db.insert(tenantsTable)
        .values(testTenant)
        .returning()
        .execute();

      const [connection] = await db.insert(whatsappConnectionsTable)
        .values({
          ...testWhatsappConnection,
          tenant_id: tenant.id,
        })
        .returning()
        .execute();

      const [provider1] = await db.insert(aiProvidersTable)
        .values({
          ...testAIProvider,
          tenant_id: tenant.id,
        })
        .returning()
        .execute();

      const [provider2] = await db.insert(aiProvidersTable)
        .values({
          ...testAIProvider,
          tenant_id: tenant.id,
          provider_name: 'anthropic',
          model_name: 'claude-3',
          is_active: false,
        })
        .returning()
        .execute();

      // Create AI requests today for first provider
      const now = new Date();
      const today = new Date(now);
      today.setHours(10, 0, 0, 0); // Set to 10 AM today
      
      await db.insert(messagesTable)
        .values({
          tenant_id: tenant.id,
          whatsapp_connection_id: connection.id,
          message_id: 'bot1',
          sender_phone: '+1234567890',
          message_type: 'text',
          content: 'Bot response 1',
          direction: 'outbound',
          is_bot_response: true,
          ai_provider_used: 'openai',
          response_time_ms: 1200,
          status: 'sent',
          created_at: today,
        })
        .execute();

      await db.insert(messagesTable)
        .values({
          tenant_id: tenant.id,
          whatsapp_connection_id: connection.id,
          message_id: 'bot2',
          sender_phone: '+1234567890',
          message_type: 'text',
          content: 'Bot response 2',
          direction: 'outbound',
          is_bot_response: true,
          ai_provider_used: 'openai',
          response_time_ms: 800,
          status: 'delivered',
          created_at: today,
        })
        .execute();

      // Failed response
      await db.insert(messagesTable)
        .values({
          tenant_id: tenant.id,
          whatsapp_connection_id: connection.id,
          message_id: 'bot3',
          sender_phone: '+1234567890',
          message_type: 'text',
          content: 'Failed bot response',
          direction: 'outbound',
          is_bot_response: true,
          ai_provider_used: 'openai',
          response_time_ms: 2000,
          status: 'failed',
          created_at: today,
        })
        .execute();

      // Request from yesterday (should not count)
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(10, 0, 0, 0);
      await db.insert(messagesTable)
        .values({
          tenant_id: tenant.id,
          whatsapp_connection_id: connection.id,
          message_id: 'bot4',
          sender_phone: '+1234567890',
          message_type: 'text',
          content: 'Yesterday bot response',
          direction: 'outbound',
          is_bot_response: true,
          ai_provider_used: 'openai',
          response_time_ms: 1000,
          status: 'sent',
          created_at: yesterday,
        })
        .execute();

      const result = await getAIProviderStatus(tenant.id);

      expect(result.providers).toHaveLength(2);

      const openaiProvider = result.providers.find(p => p.provider_name === 'openai');
      expect(openaiProvider).toBeDefined();
      expect(openaiProvider!.model_name).toEqual('gpt-4');
      expect(openaiProvider!.is_active).toEqual(true);
      expect(openaiProvider!.requests_today).toEqual(3);
      expect(openaiProvider!.avg_response_time).toEqual(1333); // (1200+800+2000)/3
      expect(openaiProvider!.success_rate).toEqual(66.67); // 2 successful out of 3

      const anthropicProvider = result.providers.find(p => p.provider_name === 'anthropic');
      expect(anthropicProvider).toBeDefined();
      expect(anthropicProvider!.model_name).toEqual('claude-3');
      expect(anthropicProvider!.is_active).toEqual(false);
      expect(anthropicProvider!.requests_today).toEqual(0);
      expect(anthropicProvider!.avg_response_time).toEqual(0);
      expect(anthropicProvider!.success_rate).toEqual(100); // No requests, default success rate
    });

    it('should handle tenant with no providers', async () => {
      const [tenant] = await db.insert(tenantsTable)
        .values(testTenant)
        .returning()
        .execute();

      const result = await getAIProviderStatus(tenant.id);

      expect(result.providers).toHaveLength(0);
    });

    it('should reject invalid tenant ID', async () => {
      await expect(getAIProviderStatus(999)).rejects.toThrow(/tenant with id 999 not found/i);
    });
  });
});