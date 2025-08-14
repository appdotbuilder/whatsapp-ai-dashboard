import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { 
  usersTable, 
  tenantsTable, 
  userTenantsTable,
  messagesTable,
  usageStatisticsTable,
  whatsappConnectionsTable,
  knowledgeBaseDocumentsTable,
  aiProvidersTable
} from '../db/schema';
import {
  getAllUsers,
  getAllTenants,
  getUsersWithStats,
  getSystemUsageStatistics,
  toggleUserStatus,
  toggleTenantStatus,
  getTenantUsage
} from '../handlers/admin';
import { eq } from 'drizzle-orm';

// Helper function to create test user
const createTestUser = async (overrides: Partial<any> = {}) => {
  const userData = {
    email: `user${Date.now()}@test.com`,
    password_hash: 'hashed_password',
    first_name: 'John',
    last_name: 'Doe',
    role: 'user' as const,
    is_active: true,
    ...overrides
  };

  const [user] = await db.insert(usersTable)
    .values(userData)
    .returning()
    .execute();

  return user;
};

// Helper function to create test tenant
const createTestTenant = async (overrides: Partial<any> = {}) => {
  const tenantData = {
    name: `Test Tenant ${Date.now()}`,
    slug: `test-tenant-${Date.now()}`,
    plan: 'free' as const,
    is_active: true,
    ...overrides
  };

  const [tenant] = await db.insert(tenantsTable)
    .values(tenantData)
    .returning()
    .execute();

  return tenant;
};

describe('admin handlers', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  describe('getAllUsers', () => {
    it('should return all users without password hashes', async () => {
      // Create test users
      const user1 = await createTestUser({ first_name: 'Alice' });
      const user2 = await createTestUser({ first_name: 'Bob', is_active: false });

      const users = await getAllUsers();

      expect(users).toHaveLength(2);
      expect(users[0].password_hash).toBe(''); // Password hash should be empty
      expect(users[0].first_name).toBeDefined();
      expect(users[0].email).toBeDefined();
      expect(users[0].created_at).toBeInstanceOf(Date);
      
      // Should be ordered by created_at desc (most recent first)
      expect(users[0].id).toBe(user2.id);
      expect(users[1].id).toBe(user1.id);
    });

    it('should return empty array when no users exist', async () => {
      const users = await getAllUsers();
      expect(users).toHaveLength(0);
    });
  });

  describe('getAllTenants', () => {
    it('should return all tenants', async () => {
      const tenant1 = await createTestTenant({ name: 'Tenant A' });
      const tenant2 = await createTestTenant({ name: 'Tenant B', is_active: false });

      const tenants = await getAllTenants();

      expect(tenants).toHaveLength(2);
      expect(tenants[0].name).toBeDefined();
      expect(tenants[0].slug).toBeDefined();
      expect(tenants[0].plan).toBeDefined();
      expect(tenants[0].created_at).toBeInstanceOf(Date);
      
      // Should be ordered by created_at desc
      expect(tenants[0].id).toBe(tenant2.id);
      expect(tenants[1].id).toBe(tenant1.id);
    });

    it('should return empty array when no tenants exist', async () => {
      const tenants = await getAllTenants();
      expect(tenants).toHaveLength(0);
    });
  });

  describe('getUsersWithStats', () => {
    it('should return users with statistics', async () => {
      const user = await createTestUser();
      const tenant1 = await createTestTenant();
      const tenant2 = await createTestTenant();

      // Link user to tenants
      await db.insert(userTenantsTable).values([
        { user_id: user.id, tenant_id: tenant1.id, role: 'owner' },
        { user_id: user.id, tenant_id: tenant2.id, role: 'member' }
      ]).execute();

      // Create WhatsApp connection for messages
      const [connection] = await db.insert(whatsappConnectionsTable)
        .values({
          tenant_id: tenant1.id,
          phone_number: '+1234567890',
          connection_status: 'connected'
        })
        .returning()
        .execute();

      // Create some messages
      await db.insert(messagesTable).values([
        {
          tenant_id: tenant1.id,
          whatsapp_connection_id: connection.id,
          message_id: 'msg1',
          sender_phone: '+1234567890',
          message_type: 'text',
          content: 'Hello',
          direction: 'inbound',
          is_bot_response: false,
          status: 'delivered'
        },
        {
          tenant_id: tenant1.id,
          whatsapp_connection_id: connection.id,
          message_id: 'msg2',
          sender_phone: '+1234567890',
          message_type: 'text',
          content: 'Hi there',
          direction: 'outbound',
          is_bot_response: true,
          status: 'delivered'
        }
      ]).execute();

      const usersWithStats = await getUsersWithStats();

      expect(usersWithStats).toHaveLength(1);
      expect(usersWithStats[0].user.id).toBe(user.id);
      expect(usersWithStats[0].user.password_hash).toBe(''); // No password hash
      expect(usersWithStats[0].tenant_count).toBe(2);
      expect(usersWithStats[0].total_messages).toBe(2);
      expect(usersWithStats[0].last_active).toBeInstanceOf(Date);
    });

    it('should handle users with no tenants or messages', async () => {
      const user = await createTestUser();

      const usersWithStats = await getUsersWithStats();

      expect(usersWithStats).toHaveLength(1);
      expect(usersWithStats[0].user.id).toBe(user.id);
      expect(usersWithStats[0].tenant_count).toBe(0);
      expect(usersWithStats[0].total_messages).toBe(0);
      expect(usersWithStats[0].last_active).toBeNull();
    });
  });

  describe('getSystemUsageStatistics', () => {
    it('should return system-wide statistics', async () => {
      // Create test data
      const user1 = await createTestUser({ is_active: true });
      const user2 = await createTestUser({ is_active: false });
      const tenant1 = await createTestTenant({ is_active: true });
      const tenant2 = await createTestTenant({ is_active: false });

      // Create WhatsApp connection for messages
      const [connection] = await db.insert(whatsappConnectionsTable)
        .values({
          tenant_id: tenant1.id,
          phone_number: '+1234567890',
          connection_status: 'connected'
        })
        .returning()
        .execute();

      // Create messages
      await db.insert(messagesTable).values([
        {
          tenant_id: tenant1.id,
          whatsapp_connection_id: connection.id,
          message_id: 'msg1',
          sender_phone: '+1234567890',
          message_type: 'text',
          content: 'Hello',
          direction: 'inbound',
          is_bot_response: false,
          status: 'delivered'
        }
      ]).execute();

      // Create usage statistics
      await db.insert(usageStatisticsTable).values([
        {
          tenant_id: tenant1.id,
          date: new Date('2024-01-01'),
          messages_sent: 10,
          messages_received: 5,
          ai_requests: 8,
          knowledge_base_queries: 3,
          active_connections: 1
        }
      ]).execute();

      const stats = await getSystemUsageStatistics();

      expect(stats.total_users).toBe(2);
      expect(stats.active_users).toBe(1);
      expect(stats.total_tenants).toBe(2);
      expect(stats.active_tenants).toBe(1);
      expect(stats.total_messages).toBe(1);
      expect(stats.total_ai_requests).toBe(8);
      expect(stats.daily_stats).toHaveLength(1);
      expect(stats.daily_stats[0].tenant_id).toBe(tenant1.id);
    });

    it('should filter daily stats by date range', async () => {
      const tenant = await createTestTenant();

      // Create usage statistics for different dates
      await db.insert(usageStatisticsTable).values([
        {
          tenant_id: tenant.id,
          date: new Date('2024-01-01'),
          messages_sent: 10,
          messages_received: 5,
          ai_requests: 8,
          knowledge_base_queries: 3,
          active_connections: 1
        },
        {
          tenant_id: tenant.id,
          date: new Date('2024-01-15'),
          messages_sent: 15,
          messages_received: 8,
          ai_requests: 12,
          knowledge_base_queries: 5,
          active_connections: 1
        }
      ]).execute();

      const stats = await getSystemUsageStatistics({
        start_date: new Date('2024-01-10'),
        end_date: new Date('2024-01-20')
      });

      expect(stats.daily_stats).toHaveLength(1);
      expect(stats.daily_stats[0].date).toEqual(new Date('2024-01-15'));
    });
  });

  describe('toggleUserStatus', () => {
    it('should activate a user', async () => {
      const user = await createTestUser({ is_active: false });

      const updatedUser = await toggleUserStatus(user.id, true);

      expect(updatedUser.id).toBe(user.id);
      expect(updatedUser.is_active).toBe(true);
      expect(updatedUser.password_hash).toBe(''); // No password hash
      expect(updatedUser.updated_at).toBeInstanceOf(Date);
      expect(updatedUser.updated_at.getTime()).toBeGreaterThan(user.updated_at.getTime());

      // Verify in database
      const [dbUser] = await db.select()
        .from(usersTable)
        .where(eq(usersTable.id, user.id))
        .execute();
      
      expect(dbUser.is_active).toBe(true);
    });

    it('should deactivate a user', async () => {
      const user = await createTestUser({ is_active: true });

      const updatedUser = await toggleUserStatus(user.id, false);

      expect(updatedUser.is_active).toBe(false);
      expect(updatedUser.updated_at).toBeInstanceOf(Date);
    });

    it('should throw error for non-existent user', async () => {
      await expect(toggleUserStatus(99999, true)).rejects.toThrow(/User with ID 99999 not found/);
    });
  });

  describe('toggleTenantStatus', () => {
    it('should activate a tenant', async () => {
      const tenant = await createTestTenant({ is_active: false });

      const updatedTenant = await toggleTenantStatus(tenant.id, true);

      expect(updatedTenant.id).toBe(tenant.id);
      expect(updatedTenant.is_active).toBe(true);
      expect(updatedTenant.updated_at).toBeInstanceOf(Date);
      expect(updatedTenant.updated_at.getTime()).toBeGreaterThan(tenant.updated_at.getTime());
    });

    it('should deactivate a tenant and disconnect WhatsApp connections', async () => {
      const tenant = await createTestTenant({ is_active: true });

      // Create WhatsApp connection
      const [connection] = await db.insert(whatsappConnectionsTable)
        .values({
          tenant_id: tenant.id,
          phone_number: '+1234567890',
          connection_status: 'connected'
        })
        .returning()
        .execute();

      const updatedTenant = await toggleTenantStatus(tenant.id, false);

      expect(updatedTenant.is_active).toBe(false);

      // Verify WhatsApp connection was disconnected
      const [updatedConnection] = await db.select()
        .from(whatsappConnectionsTable)
        .where(eq(whatsappConnectionsTable.id, connection.id))
        .execute();
      
      expect(updatedConnection.connection_status).toBe('disconnected');
    });

    it('should throw error for non-existent tenant', async () => {
      await expect(toggleTenantStatus(99999, true)).rejects.toThrow(/Tenant with ID 99999 not found/);
    });
  });

  describe('getTenantUsage', () => {
    it('should return comprehensive tenant usage data', async () => {
      const tenant = await createTestTenant();
      const user = await createTestUser();

      // Link user to tenant
      await db.insert(userTenantsTable).values({
        user_id: user.id,
        tenant_id: tenant.id,
        role: 'owner'
      }).execute();

      // Create WhatsApp connection
      await db.insert(whatsappConnectionsTable).values({
        tenant_id: tenant.id,
        phone_number: '+1234567890',
        connection_status: 'connected'
      }).execute();

      // Create knowledge base document
      await db.insert(knowledgeBaseDocumentsTable).values({
        tenant_id: tenant.id,
        title: 'Test Document',
        content: 'Test content',
        is_processed: true,
        embedding_status: 'completed'
      }).execute();

      // Create AI provider
      await db.insert(aiProvidersTable).values({
        tenant_id: tenant.id,
        provider_name: 'openai',
        api_key: 'test-key',
        model_name: 'gpt-3.5-turbo',
        is_active: true,
        configuration: '{}'
      }).execute();

      // Create usage statistics
      await db.insert(usageStatisticsTable).values([
        {
          tenant_id: tenant.id,
          date: new Date('2024-01-01'),
          messages_sent: 10,
          messages_received: 5,
          ai_requests: 8,
          knowledge_base_queries: 3,
          active_connections: 1
        }
      ]).execute();

      const usage = await getTenantUsage(tenant.id);

      expect(usage.tenant.id).toBe(tenant.id);
      expect(usage.tenant.name).toBe(tenant.name);
      expect(usage.usage_stats).toHaveLength(1);
      expect(usage.usage_stats[0].messages_sent).toBe(10);
      expect(usage.total_users).toBe(1);
      expect(usage.connections_count).toBe(1);
      expect(usage.documents_count).toBe(1);
      expect(usage.ai_providers_count).toBe(1);
    });

    it('should handle tenant with no associated data', async () => {
      const tenant = await createTestTenant();

      const usage = await getTenantUsage(tenant.id);

      expect(usage.tenant.id).toBe(tenant.id);
      expect(usage.usage_stats).toHaveLength(0);
      expect(usage.total_users).toBe(0);
      expect(usage.connections_count).toBe(0);
      expect(usage.documents_count).toBe(0);
      expect(usage.ai_providers_count).toBe(0);
    });

    it('should throw error for non-existent tenant', async () => {
      await expect(getTenantUsage(99999)).rejects.toThrow(/Tenant with ID 99999 not found/);
    });
  });
});