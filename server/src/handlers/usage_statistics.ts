import { db } from '../db';
import { 
  usageStatisticsTable, 
  messagesTable, 
  tenantsTable,
  whatsappConnectionsTable,
  knowledgeBaseDocumentsTable
} from '../db/schema';
import { type GetUsageStatisticsInput, type UsageStatistics } from '../schema';
import { eq, and, gte, lte, count, sum, SQL, desc, asc } from 'drizzle-orm';

export async function getUsageStatistics(input: GetUsageStatisticsInput): Promise<UsageStatistics[]> {
  try {
    const conditions: SQL<unknown>[] = [];
    
    // Always filter by tenant_id
    conditions.push(eq(usageStatisticsTable.tenant_id, input.tenant_id));
    
    // Add date range filters if provided
    if (input.start_date) {
      conditions.push(gte(usageStatisticsTable.date, input.start_date));
    }
    
    if (input.end_date) {
      conditions.push(lte(usageStatisticsTable.date, input.end_date));
    }
    
    // Build and execute query
    const results = await db.select()
      .from(usageStatisticsTable)
      .where(and(...conditions))
      .orderBy(asc(usageStatisticsTable.date))
      .execute();
    
    return results;
  } catch (error) {
    console.error('Failed to get usage statistics:', error);
    throw error;
  }
}

export async function recordDailyUsage(tenantId: number, date: Date): Promise<UsageStatistics> {
  try {
    // Normalize date to start of day for consistency (this should be the canonical date)
    const normalizedDate = new Date(date);
    normalizedDate.setHours(0, 0, 0, 0);
    
    // Create date range for the specific day
    const startOfDay = new Date(normalizedDate);
    const endOfDay = new Date(normalizedDate);
    endOfDay.setHours(23, 59, 59, 999);
    
    // Count messages by direction
    const sentMessages = await db.select({
      count: count(),
    }).from(messagesTable)
      .where(and(
        eq(messagesTable.tenant_id, tenantId),
        eq(messagesTable.direction, 'outbound'),
        gte(messagesTable.created_at, startOfDay),
        lte(messagesTable.created_at, endOfDay)
      ))
      .execute();
    
    const receivedMessages = await db.select({
      count: count(),
    }).from(messagesTable)
      .where(and(
        eq(messagesTable.tenant_id, tenantId),
        eq(messagesTable.direction, 'inbound'),
        gte(messagesTable.created_at, startOfDay),
        lte(messagesTable.created_at, endOfDay)
      ))
      .execute();
    
    // Count AI requests (bot responses)
    const aiRequests = await db.select({
      count: count(),
    }).from(messagesTable)
      .where(and(
        eq(messagesTable.tenant_id, tenantId),
        eq(messagesTable.is_bot_response, true),
        gte(messagesTable.created_at, startOfDay),
        lte(messagesTable.created_at, endOfDay)
      ))
      .execute();
    
    // Count knowledge base queries (approximate as processed documents)
    const kbQueries = await db.select({
      count: count(),
    }).from(knowledgeBaseDocumentsTable)
      .where(and(
        eq(knowledgeBaseDocumentsTable.tenant_id, tenantId),
        eq(knowledgeBaseDocumentsTable.is_processed, true),
        gte(knowledgeBaseDocumentsTable.updated_at, startOfDay),
        lte(knowledgeBaseDocumentsTable.updated_at, endOfDay)
      ))
      .execute();
    
    // Count active WhatsApp connections
    const activeConnections = await db.select({
      count: count(),
    }).from(whatsappConnectionsTable)
      .where(and(
        eq(whatsappConnectionsTable.tenant_id, tenantId),
        eq(whatsappConnectionsTable.connection_status, 'connected')
      ))
      .execute();
    
    const messagesSent = sentMessages[0]?.count || 0;
    const messagesReceived = receivedMessages[0]?.count || 0;
    const aiRequestCount = aiRequests[0]?.count || 0;
    const kbQueryCount = kbQueries[0]?.count || 0;
    const activeConnectionCount = activeConnections[0]?.count || 0;
    
    // Check if record exists for this exact date
    const existingRecord = await db.select()
      .from(usageStatisticsTable)
      .where(and(
        eq(usageStatisticsTable.tenant_id, tenantId),
        eq(usageStatisticsTable.date, normalizedDate)
      ))
      .execute();
    
    let result: UsageStatistics[];
    
    if (existingRecord.length > 0) {
      // Update existing record using the same normalized date
      result = await db.update(usageStatisticsTable)
        .set({
          messages_sent: messagesSent,
          messages_received: messagesReceived,
          ai_requests: aiRequestCount,
          knowledge_base_queries: kbQueryCount,
          active_connections: activeConnectionCount,
        })
        .where(and(
          eq(usageStatisticsTable.tenant_id, tenantId),
          eq(usageStatisticsTable.date, normalizedDate)
        ))
        .returning()
        .execute();
    } else {
      // Insert new record
      result = await db.insert(usageStatisticsTable)
        .values({
          tenant_id: tenantId,
          date: normalizedDate,
          messages_sent: messagesSent,
          messages_received: messagesReceived,
          ai_requests: aiRequestCount,
          knowledge_base_queries: kbQueryCount,
          active_connections: activeConnectionCount,
        })
        .returning()
        .execute();
    }
    
    return result[0];
  } catch (error) {
    console.error('Failed to record daily usage:', error);
    throw error;
  }
}

export async function getCurrentUsage(tenantId: number): Promise<{
  messages_today: number;
  messages_this_month: number;
  ai_requests_today: number;
  ai_requests_this_month: number;
  storage_used_mb: number;
  plan_limits: {
    max_messages_per_month: number;
    max_ai_requests_per_month: number;
    max_storage_mb: number;
  };
}> {
  try {
    const now = new Date();
    
    // Get start of today
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    
    // Get start of current month
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    
    // Get tenant plan
    const tenant = await db.select()
      .from(tenantsTable)
      .where(eq(tenantsTable.id, tenantId))
      .execute();
    
    const tenantPlan = tenant[0]?.plan || 'free';
    
    // Define plan limits
    const planLimits = {
      free: {
        max_messages_per_month: 100,
        max_ai_requests_per_month: 50,
        max_storage_mb: 10,
      },
      basic: {
        max_messages_per_month: 1000,
        max_ai_requests_per_month: 500,
        max_storage_mb: 100,
      },
      premium: {
        max_messages_per_month: 10000,
        max_ai_requests_per_month: 5000,
        max_storage_mb: 1000,
      },
      enterprise: {
        max_messages_per_month: 100000,
        max_ai_requests_per_month: 50000,
        max_storage_mb: 10000,
      },
    };
    
    // Count messages today
    const messagesToday = await db.select({
      count: count(),
    }).from(messagesTable)
      .where(and(
        eq(messagesTable.tenant_id, tenantId),
        gte(messagesTable.created_at, startOfToday)
      ))
      .execute();
    
    // Count messages this month
    const messagesThisMonth = await db.select({
      count: count(),
    }).from(messagesTable)
      .where(and(
        eq(messagesTable.tenant_id, tenantId),
        gte(messagesTable.created_at, startOfMonth)
      ))
      .execute();
    
    // Count AI requests today
    const aiRequestsToday = await db.select({
      count: count(),
    }).from(messagesTable)
      .where(and(
        eq(messagesTable.tenant_id, tenantId),
        eq(messagesTable.is_bot_response, true),
        gte(messagesTable.created_at, startOfToday)
      ))
      .execute();
    
    // Count AI requests this month
    const aiRequestsThisMonth = await db.select({
      count: count(),
    }).from(messagesTable)
      .where(and(
        eq(messagesTable.tenant_id, tenantId),
        eq(messagesTable.is_bot_response, true),
        gte(messagesTable.created_at, startOfMonth)
      ))
      .execute();
    
    // Calculate storage used (approximate based on document sizes)
    const storageUsed = await db.select({
      total_size: sum(knowledgeBaseDocumentsTable.file_size),
    }).from(knowledgeBaseDocumentsTable)
      .where(eq(knowledgeBaseDocumentsTable.tenant_id, tenantId))
      .execute();
    
    const totalSizeBytes = Number(storageUsed[0]?.total_size || 0);
    const storageUsedMb = Math.ceil(totalSizeBytes / (1024 * 1024));
    
    return {
      messages_today: messagesToday[0]?.count || 0,
      messages_this_month: messagesThisMonth[0]?.count || 0,
      ai_requests_today: aiRequestsToday[0]?.count || 0,
      ai_requests_this_month: aiRequestsThisMonth[0]?.count || 0,
      storage_used_mb: storageUsedMb,
      plan_limits: planLimits[tenantPlan],
    };
  } catch (error) {
    console.error('Failed to get current usage:', error);
    throw error;
  }
}

export async function generateUsageReport(
  tenantId: number,
  startDate: Date,
  endDate: Date
): Promise<{
  summary: {
    total_messages: number;
    total_ai_requests: number;
    avg_daily_messages: number;
    peak_day: Date | null;
    peak_day_messages: number;
  };
  daily_breakdown: Array<{
    date: Date;
    messages_sent: number;
    messages_received: number;
    ai_requests: number;
  }>;
}> {
  try {
    // Get usage statistics for the date range
    const usageStats = await db.select()
      .from(usageStatisticsTable)
      .where(and(
        eq(usageStatisticsTable.tenant_id, tenantId),
        gte(usageStatisticsTable.date, startDate),
        lte(usageStatisticsTable.date, endDate)
      ))
      .orderBy(asc(usageStatisticsTable.date))
      .execute();
    
    // Calculate summary metrics
    let totalMessages = 0;
    let totalAiRequests = 0;
    let peakDay: Date | null = null;
    let peakDayMessages = 0;
    
    const dailyBreakdown = usageStats.map(stat => {
      const dayMessages = stat.messages_sent + stat.messages_received;
      totalMessages += dayMessages;
      totalAiRequests += stat.ai_requests;
      
      // Track peak day
      if (dayMessages > peakDayMessages) {
        peakDayMessages = dayMessages;
        peakDay = stat.date;
      }
      
      return {
        date: stat.date,
        messages_sent: stat.messages_sent,
        messages_received: stat.messages_received,
        ai_requests: stat.ai_requests,
      };
    });
    
    // Calculate average daily messages
    const dayCount = usageStats.length || 1;
    const avgDailyMessages = Math.round(totalMessages / dayCount);
    
    return {
      summary: {
        total_messages: totalMessages,
        total_ai_requests: totalAiRequests,
        avg_daily_messages: avgDailyMessages,
        peak_day: peakDay,
        peak_day_messages: peakDayMessages,
      },
      daily_breakdown: dailyBreakdown,
    };
  } catch (error) {
    console.error('Failed to generate usage report:', error);
    throw error;
  }
}