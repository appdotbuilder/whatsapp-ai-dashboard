import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { tenantsTable, whatsappConnectionsTable, messagesTable } from '../db/schema';
import { type GetMessagesInput } from '../schema';
import { getMessages } from '../handlers/messages';
import { eq, desc } from 'drizzle-orm';

// Test data
const testTenant = {
  name: 'Test Company',
  slug: 'test-company',
  plan: 'basic' as const,
  is_active: true,
};

const testWhatsappConnection = {
  phone_number: '+1234567890',
  connection_status: 'connected' as const,
};

const testMessages = [
  {
    message_id: 'msg_001',
    sender_phone: '+9876543210',
    sender_name: 'John Doe',
    message_type: 'text' as const,
    content: 'Hello, this is a test message',
    direction: 'inbound' as const,
    is_bot_response: false,
    status: 'read' as const,
  },
  {
    message_id: 'msg_002',
    sender_phone: '+1234567890',
    sender_name: null,
    message_type: 'text' as const,
    content: 'Bot response message',
    direction: 'outbound' as const,
    is_bot_response: true,
    ai_provider_used: 'openai',
    response_time_ms: 250,
    status: 'delivered' as const,
  },
  {
    message_id: 'msg_003',
    sender_phone: '+5555555555',
    sender_name: 'Jane Smith',
    message_type: 'image' as const,
    content: 'Image message content',
    direction: 'inbound' as const,
    is_bot_response: false,
    status: 'read' as const,
  },
];

describe('getMessages', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should get messages for a tenant', async () => {
    // Create test tenant
    const tenantResult = await db.insert(tenantsTable)
      .values(testTenant)
      .returning()
      .execute();
    const tenant = tenantResult[0];

    // Create WhatsApp connection
    const connectionResult = await db.insert(whatsappConnectionsTable)
      .values({
        ...testWhatsappConnection,
        tenant_id: tenant.id,
      })
      .returning()
      .execute();
    const connection = connectionResult[0];

    // Create messages
    const messageValues = testMessages.map(msg => ({
      ...msg,
      tenant_id: tenant.id,
      whatsapp_connection_id: connection.id,
    }));

    await db.insert(messagesTable)
      .values(messageValues)
      .execute();

    // Test basic query
    const input: GetMessagesInput = {
      tenant_id: tenant.id,
    };

    const result = await getMessages(input);

    // Should return all messages for the tenant
    expect(result).toHaveLength(3);
    
    // Should be ordered by created_at descending (most recent first)
    expect(result[0].created_at >= result[1].created_at).toBe(true);
    expect(result[1].created_at >= result[2].created_at).toBe(true);

    // Verify message content
    const messageIds = result.map(msg => msg.message_id).sort();
    expect(messageIds).toEqual(['msg_001', 'msg_002', 'msg_003']);
    
    // Verify tenant_id filtering worked
    result.forEach(message => {
      expect(message.tenant_id).toEqual(tenant.id);
      expect(message.whatsapp_connection_id).toEqual(connection.id);
    });
  });

  it('should filter messages by whatsapp_connection_id', async () => {
    // Create test tenant
    const tenantResult = await db.insert(tenantsTable)
      .values(testTenant)
      .returning()
      .execute();
    const tenant = tenantResult[0];

    // Create two WhatsApp connections
    const connection1Result = await db.insert(whatsappConnectionsTable)
      .values({
        ...testWhatsappConnection,
        tenant_id: tenant.id,
        phone_number: '+1111111111',
      })
      .returning()
      .execute();
    const connection1 = connection1Result[0];

    const connection2Result = await db.insert(whatsappConnectionsTable)
      .values({
        ...testWhatsappConnection,
        tenant_id: tenant.id,
        phone_number: '+2222222222',
      })
      .returning()
      .execute();
    const connection2 = connection2Result[0];

    // Create messages for different connections
    await db.insert(messagesTable)
      .values([
        {
          ...testMessages[0],
          tenant_id: tenant.id,
          whatsapp_connection_id: connection1.id,
        },
        {
          ...testMessages[1],
          tenant_id: tenant.id,
          whatsapp_connection_id: connection2.id,
        },
      ])
      .execute();

    // Test filtering by specific connection
    const input: GetMessagesInput = {
      tenant_id: tenant.id,
      whatsapp_connection_id: connection1.id,
    };

    const result = await getMessages(input);

    // Should return only messages for connection1
    expect(result).toHaveLength(1);
    expect(result[0].whatsapp_connection_id).toEqual(connection1.id);
    expect(result[0].message_id).toEqual('msg_001');
  });

  it('should apply pagination correctly', async () => {
    // Create test tenant
    const tenantResult = await db.insert(tenantsTable)
      .values(testTenant)
      .returning()
      .execute();
    const tenant = tenantResult[0];

    // Create WhatsApp connection
    const connectionResult = await db.insert(whatsappConnectionsTable)
      .values({
        ...testWhatsappConnection,
        tenant_id: tenant.id,
      })
      .returning()
      .execute();
    const connection = connectionResult[0];

    // Create 5 messages with different timestamps
    const messages = [];
    for (let i = 0; i < 5; i++) {
      messages.push({
        message_id: `msg_${i.toString().padStart(3, '0')}`,
        sender_phone: '+9876543210',
        sender_name: `User ${i}`,
        message_type: 'text' as const,
        content: `Test message ${i}`,
        direction: 'inbound' as const,
        is_bot_response: false,
        status: 'read' as const,
        tenant_id: tenant.id,
        whatsapp_connection_id: connection.id,
      });
    }

    await db.insert(messagesTable)
      .values(messages)
      .execute();

    // Test limit
    const limitInput: GetMessagesInput = {
      tenant_id: tenant.id,
      limit: 3,
    };

    const limitResult = await getMessages(limitInput);
    expect(limitResult).toHaveLength(3);

    // Test offset
    const offsetInput: GetMessagesInput = {
      tenant_id: tenant.id,
      limit: 3,
      offset: 2,
    };

    const offsetResult = await getMessages(offsetInput);
    expect(offsetResult).toHaveLength(3);

    // Should not overlap with limit result (assuming proper ordering)
    const limitIds = limitResult.map(msg => msg.id);
    const offsetIds = offsetResult.map(msg => msg.id);
    const intersection = limitIds.filter(id => offsetIds.includes(id));
    expect(intersection).toHaveLength(1); // Only 1 overlap due to offset of 2 and limit of 3
  });

  it('should use default pagination values', async () => {
    // Create test tenant
    const tenantResult = await db.insert(tenantsTable)
      .values(testTenant)
      .returning()
      .execute();
    const tenant = tenantResult[0];

    // Create WhatsApp connection
    const connectionResult = await db.insert(whatsappConnectionsTable)
      .values({
        ...testWhatsappConnection,
        tenant_id: tenant.id,
      })
      .returning()
      .execute();
    const connection = connectionResult[0];

    // Create message
    await db.insert(messagesTable)
      .values({
        ...testMessages[0],
        tenant_id: tenant.id,
        whatsapp_connection_id: connection.id,
      })
      .execute();

    // Test without pagination parameters
    const input: GetMessagesInput = {
      tenant_id: tenant.id,
    };

    const result = await getMessages(input);

    // Should still work with defaults
    expect(result).toHaveLength(1);
    expect(result[0].tenant_id).toEqual(tenant.id);
  });

  it('should return empty array when no messages exist', async () => {
    // Create test tenant
    const tenantResult = await db.insert(tenantsTable)
      .values(testTenant)
      .returning()
      .execute();
    const tenant = tenantResult[0];

    const input: GetMessagesInput = {
      tenant_id: tenant.id,
    };

    const result = await getMessages(input);

    expect(result).toHaveLength(0);
    expect(Array.isArray(result)).toBe(true);
  });

  it('should return empty array for non-existent tenant', async () => {
    const input: GetMessagesInput = {
      tenant_id: 99999, // Non-existent tenant ID
    };

    const result = await getMessages(input);

    expect(result).toHaveLength(0);
    expect(Array.isArray(result)).toBe(true);
  });

  it('should verify message properties and types', async () => {
    // Create test tenant
    const tenantResult = await db.insert(tenantsTable)
      .values(testTenant)
      .returning()
      .execute();
    const tenant = tenantResult[0];

    // Create WhatsApp connection
    const connectionResult = await db.insert(whatsappConnectionsTable)
      .values({
        ...testWhatsappConnection,
        tenant_id: tenant.id,
      })
      .returning()
      .execute();
    const connection = connectionResult[0];

    // Create message with specific values
    await db.insert(messagesTable)
      .values({
        ...testMessages[1], // Bot response with response_time_ms
        tenant_id: tenant.id,
        whatsapp_connection_id: connection.id,
      })
      .execute();

    const input: GetMessagesInput = {
      tenant_id: tenant.id,
    };

    const result = await getMessages(input);

    expect(result).toHaveLength(1);
    
    const message = result[0];
    
    // Verify all expected properties exist
    expect(message.id).toBeDefined();
    expect(message.tenant_id).toEqual(tenant.id);
    expect(message.whatsapp_connection_id).toEqual(connection.id);
    expect(message.message_id).toEqual('msg_002');
    expect(message.sender_phone).toEqual('+1234567890');
    expect(message.sender_name).toBeNull();
    expect(message.message_type).toEqual('text');
    expect(message.content).toEqual('Bot response message');
    expect(message.direction).toEqual('outbound');
    expect(message.is_bot_response).toBe(true);
    expect(message.ai_provider_used).toEqual('openai');
    expect(message.response_time_ms).toEqual(250);
    expect(message.status).toEqual('delivered');
    expect(message.created_at).toBeInstanceOf(Date);

    // Verify integer types
    expect(typeof message.id).toBe('number');
    expect(typeof message.tenant_id).toBe('number');
    expect(typeof message.whatsapp_connection_id).toBe('number');
    expect(typeof message.response_time_ms).toBe('number');
  });
});