import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { 
  usageStatisticsTable, 
  tenantsTable, 
  messagesTable, 
  whatsappConnectionsTable,
  knowledgeBaseDocumentsTable,
  usersTable,
  userTenantsTable
} from '../db/schema';
import { type GetUsageStatisticsInput } from '../schema';
import { 
  getUsageStatistics, 
  recordDailyUsage, 
  getCurrentUsage, 
  generateUsageReport 
} from '../handlers/usage_statistics';
import { eq } from 'drizzle-orm';

describe('usage statistics handlers', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  let testTenantId: number;
  let testUserId: number;
  let testWhatsappConnectionId: number;

  // Setup test data
  const setupTestData = async () => {
    // Create test user
    const user = await db.insert(usersTable).values({
      email: 'test@example.com',
      password_hash: 'hash123',
      first_name: 'Test',
      last_name: 'User',
      role: 'user',
    }).returning().execute();
    testUserId = user[0].id;

    // Create test tenant
    const tenant = await db.insert(tenantsTable).values({
      name: 'Test Tenant',
      slug: 'test-tenant',
      plan: 'basic',
    }).returning().execute();
    testTenantId = tenant[0].id;

    // Create user-tenant relationship
    await db.insert(userTenantsTable).values({
      user_id: testUserId,
      tenant_id: testTenantId,
      role: 'owner',
    }).execute();

    // Create WhatsApp connection
    const connection = await db.insert(whatsappConnectionsTable).values({
      tenant_id: testTenantId,
      phone_number: '+1234567890',
      connection_status: 'connected',
    }).returning().execute();
    testWhatsappConnectionId = connection[0].id;
  };

  describe('getUsageStatistics', () => {
    it('should get usage statistics for a tenant', async () => {
      await setupTestData();

      // Create some usage statistics
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      await db.insert(usageStatisticsTable).values([
        {
          tenant_id: testTenantId,
          date: today,
          messages_sent: 50,
          messages_received: 30,
          ai_requests: 20,
          knowledge_base_queries: 10,
          active_connections: 2,
        },
        {
          tenant_id: testTenantId,
          date: yesterday,
          messages_sent: 40,
          messages_received: 25,
          ai_requests: 15,
          knowledge_base_queries: 8,
          active_connections: 1,
        }
      ]).execute();

      const input: GetUsageStatisticsInput = {
        tenant_id: testTenantId,
      };

      const result = await getUsageStatistics(input);

      expect(result).toHaveLength(2);
      expect(result[0].tenant_id).toEqual(testTenantId);
      expect(result[0].messages_sent).toEqual(40); // yesterday first (ascending order)
      expect(result[1].messages_sent).toEqual(50); // today second
    });

    it('should filter usage statistics by date range', async () => {
      await setupTestData();

      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const dayBeforeYesterday = new Date(today);
      dayBeforeYesterday.setDate(dayBeforeYesterday.getDate() - 2);

      // Create stats for 3 days
      await db.insert(usageStatisticsTable).values([
        {
          tenant_id: testTenantId,
          date: dayBeforeYesterday,
          messages_sent: 30,
          messages_received: 20,
          ai_requests: 10,
          knowledge_base_queries: 5,
          active_connections: 1,
        },
        {
          tenant_id: testTenantId,
          date: yesterday,
          messages_sent: 40,
          messages_received: 25,
          ai_requests: 15,
          knowledge_base_queries: 8,
          active_connections: 1,
        },
        {
          tenant_id: testTenantId,
          date: today,
          messages_sent: 50,
          messages_received: 30,
          ai_requests: 20,
          knowledge_base_queries: 10,
          active_connections: 2,
        }
      ]).execute();

      // Filter to get only yesterday and today
      const input: GetUsageStatisticsInput = {
        tenant_id: testTenantId,
        start_date: yesterday,
        end_date: today,
      };

      const result = await getUsageStatistics(input);

      expect(result).toHaveLength(2);
      expect(result[0].messages_sent).toEqual(40); // yesterday
      expect(result[1].messages_sent).toEqual(50); // today
    });

    it('should return empty array for tenant with no statistics', async () => {
      await setupTestData();

      const input: GetUsageStatisticsInput = {
        tenant_id: testTenantId,
      };

      const result = await getUsageStatistics(input);

      expect(result).toHaveLength(0);
    });
  });

  describe('recordDailyUsage', () => {
    it('should record daily usage statistics', async () => {
      await setupTestData();

      const today = new Date();
      
      // Create some messages for today
      const startOfDay = new Date(today);
      startOfDay.setHours(0, 0, 0, 0);
      
      await db.insert(messagesTable).values([
        {
          tenant_id: testTenantId,
          whatsapp_connection_id: testWhatsappConnectionId,
          message_id: 'msg1',
          sender_phone: '+1111111111',
          message_type: 'text',
          content: 'Hello',
          direction: 'inbound',
          is_bot_response: false,
          status: 'delivered',
          created_at: new Date(startOfDay.getTime() + 1000),
        },
        {
          tenant_id: testTenantId,
          whatsapp_connection_id: testWhatsappConnectionId,
          message_id: 'msg2',
          sender_phone: '+1111111111',
          message_type: 'text',
          content: 'Hi there!',
          direction: 'outbound',
          is_bot_response: true,
          status: 'sent',
          created_at: new Date(startOfDay.getTime() + 2000),
        },
        {
          tenant_id: testTenantId,
          whatsapp_connection_id: testWhatsappConnectionId,
          message_id: 'msg3',
          sender_phone: '+1111111111',
          message_type: 'text',
          content: 'Another message',
          direction: 'outbound',
          is_bot_response: false,
          status: 'sent',
          created_at: new Date(startOfDay.getTime() + 3000),
        }
      ]).execute();

      // Create a knowledge base document
      await db.insert(knowledgeBaseDocumentsTable).values({
        tenant_id: testTenantId,
        title: 'Test Doc',
        content: 'Test content',
        is_processed: true,
        embedding_status: 'completed',
        updated_at: new Date(startOfDay.getTime() + 4000),
      }).execute();

      const result = await recordDailyUsage(testTenantId, today);

      expect(result.tenant_id).toEqual(testTenantId);
      expect(result.messages_sent).toEqual(2); // 2 outbound messages
      expect(result.messages_received).toEqual(1); // 1 inbound message
      expect(result.ai_requests).toEqual(1); // 1 bot response
      expect(result.knowledge_base_queries).toEqual(1); // 1 processed document
      expect(result.active_connections).toEqual(1); // 1 connected WhatsApp connection
      expect(result.date).toBeInstanceOf(Date);
    });

    it('should update existing usage statistics', async () => {
      await setupTestData();

      const today = new Date();
      // Normalize the date to match what recordDailyUsage will use
      const normalizedToday = new Date(today);
      normalizedToday.setHours(0, 0, 0, 0);
      
      // Create initial usage record with normalized date
      await db.insert(usageStatisticsTable).values({
        tenant_id: testTenantId,
        date: normalizedToday,
        messages_sent: 10,
        messages_received: 5,
        ai_requests: 3,
        knowledge_base_queries: 2,
        active_connections: 1,
      }).execute();

      // Record daily usage again (should update)
      const result = await recordDailyUsage(testTenantId, today);

      expect(result.tenant_id).toEqual(testTenantId);
      expect(result.messages_sent).toEqual(0); // Updated with actual count (0 for this test)
      expect(result.messages_received).toEqual(0);
      
      // Verify only one record exists
      const allStats = await db.select()
        .from(usageStatisticsTable)
        .where(eq(usageStatisticsTable.tenant_id, testTenantId))
        .execute();
      
      expect(allStats).toHaveLength(1);
    });
  });

  describe('getCurrentUsage', () => {
    it('should get current usage with plan limits', async () => {
      await setupTestData();

      const now = new Date();
      const startOfToday = new Date(now);
      startOfToday.setHours(0, 0, 0, 0);
      
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      // Create messages for today and this month
      await db.insert(messagesTable).values([
        // Today's messages
        {
          tenant_id: testTenantId,
          whatsapp_connection_id: testWhatsappConnectionId,
          message_id: 'msg_today_1',
          sender_phone: '+1111111111',
          message_type: 'text',
          content: 'Today message 1',
          direction: 'inbound',
          is_bot_response: false,
          status: 'delivered',
          created_at: new Date(startOfToday.getTime() + 1000),
        },
        {
          tenant_id: testTenantId,
          whatsapp_connection_id: testWhatsappConnectionId,
          message_id: 'msg_today_2',
          sender_phone: '+1111111111',
          message_type: 'text',
          content: 'Bot response today',
          direction: 'outbound',
          is_bot_response: true,
          status: 'sent',
          created_at: new Date(startOfToday.getTime() + 2000),
        },
        // Month's messages (but not today)
        {
          tenant_id: testTenantId,
          whatsapp_connection_id: testWhatsappConnectionId,
          message_id: 'msg_month_1',
          sender_phone: '+1111111111',
          message_type: 'text',
          content: 'Month message',
          direction: 'inbound',
          is_bot_response: false,
          status: 'delivered',
          created_at: new Date(startOfMonth.getTime() + 86400000), // +1 day from start of month
        }
      ]).execute();

      // Create knowledge base document with file size
      await db.insert(knowledgeBaseDocumentsTable).values({
        tenant_id: testTenantId,
        title: 'Large Doc',
        content: 'Large content',
        file_size: 2048000, // 2MB
        is_processed: true,
        embedding_status: 'completed',
      }).execute();

      const result = await getCurrentUsage(testTenantId);

      expect(result.messages_today).toEqual(2); // 2 messages today
      expect(result.messages_this_month).toEqual(3); // 3 messages this month
      expect(result.ai_requests_today).toEqual(1); // 1 AI request today
      expect(result.ai_requests_this_month).toEqual(1); // 1 AI request this month
      expect(result.storage_used_mb).toEqual(2); // 2MB storage used
      
      // Basic plan limits
      expect(result.plan_limits.max_messages_per_month).toEqual(1000);
      expect(result.plan_limits.max_ai_requests_per_month).toEqual(500);
      expect(result.plan_limits.max_storage_mb).toEqual(100);
    });

    it('should return correct limits for different tenant plans', async () => {
      await setupTestData();

      // Update tenant to premium plan
      await db.update(tenantsTable)
        .set({ plan: 'premium' })
        .where(eq(tenantsTable.id, testTenantId))
        .execute();

      const result = await getCurrentUsage(testTenantId);

      // Premium plan limits
      expect(result.plan_limits.max_messages_per_month).toEqual(10000);
      expect(result.plan_limits.max_ai_requests_per_month).toEqual(5000);
      expect(result.plan_limits.max_storage_mb).toEqual(1000);
    });
  });

  describe('generateUsageReport', () => {
    it('should generate comprehensive usage report', async () => {
      await setupTestData();

      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const dayBefore = new Date(today);
      dayBefore.setDate(dayBefore.getDate() - 2);

      // Create usage statistics for 3 days
      await db.insert(usageStatisticsTable).values([
        {
          tenant_id: testTenantId,
          date: dayBefore,
          messages_sent: 20,
          messages_received: 15,
          ai_requests: 10,
          knowledge_base_queries: 5,
          active_connections: 1,
        },
        {
          tenant_id: testTenantId,
          date: yesterday,
          messages_sent: 30,
          messages_received: 25,
          ai_requests: 15,
          knowledge_base_queries: 8,
          active_connections: 2,
        },
        {
          tenant_id: testTenantId,
          date: today,
          messages_sent: 10,
          messages_received: 8,
          ai_requests: 5,
          knowledge_base_queries: 3,
          active_connections: 1,
        }
      ]).execute();

      const startDate = dayBefore;
      const endDate = today;

      const result = await generateUsageReport(testTenantId, startDate, endDate);

      // Check summary
      expect(result.summary.total_messages).toEqual(108); // (20+15) + (30+25) + (10+8)
      expect(result.summary.total_ai_requests).toEqual(30); // 10 + 15 + 5
      expect(result.summary.avg_daily_messages).toEqual(36); // 108 / 3 days
      expect(result.summary.peak_day).toEqual(yesterday); // yesterday had most messages (55)
      expect(result.summary.peak_day_messages).toEqual(55); // 30 + 25

      // Check daily breakdown
      expect(result.daily_breakdown).toHaveLength(3);
      expect(result.daily_breakdown[0].date).toEqual(dayBefore);
      expect(result.daily_breakdown[0].messages_sent).toEqual(20);
      expect(result.daily_breakdown[0].messages_received).toEqual(15);
      expect(result.daily_breakdown[0].ai_requests).toEqual(10);

      expect(result.daily_breakdown[1].date).toEqual(yesterday);
      expect(result.daily_breakdown[1].messages_sent).toEqual(30);
      expect(result.daily_breakdown[1].messages_received).toEqual(25);
      expect(result.daily_breakdown[1].ai_requests).toEqual(15);

      expect(result.daily_breakdown[2].date).toEqual(today);
      expect(result.daily_breakdown[2].messages_sent).toEqual(10);
      expect(result.daily_breakdown[2].messages_received).toEqual(8);
      expect(result.daily_breakdown[2].ai_requests).toEqual(5);
    });

    it('should return empty report for tenant with no data', async () => {
      await setupTestData();

      const startDate = new Date();
      const endDate = new Date();

      const result = await generateUsageReport(testTenantId, startDate, endDate);

      expect(result.summary.total_messages).toEqual(0);
      expect(result.summary.total_ai_requests).toEqual(0);
      expect(result.summary.avg_daily_messages).toEqual(0);
      expect(result.summary.peak_day).toBeNull();
      expect(result.summary.peak_day_messages).toEqual(0);
      expect(result.daily_breakdown).toHaveLength(0);
    });

    it('should handle single day report correctly', async () => {
      await setupTestData();

      const today = new Date();

      // Create usage statistics for single day
      await db.insert(usageStatisticsTable).values({
        tenant_id: testTenantId,
        date: today,
        messages_sent: 25,
        messages_received: 20,
        ai_requests: 12,
        knowledge_base_queries: 5,
        active_connections: 2,
      }).execute();

      const result = await generateUsageReport(testTenantId, today, today);

      expect(result.summary.total_messages).toEqual(45); // 25 + 20
      expect(result.summary.total_ai_requests).toEqual(12);
      expect(result.summary.avg_daily_messages).toEqual(45); // Same as total for single day
      expect(result.summary.peak_day).toEqual(today);
      expect(result.summary.peak_day_messages).toEqual(45);
      expect(result.daily_breakdown).toHaveLength(1);
    });
  });
});