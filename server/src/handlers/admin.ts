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
import { type GetUsageStatisticsInput, type UsageStatistics, type User, type Tenant } from '../schema';
import { eq, count, sql, and, gte, lte, desc, sum } from 'drizzle-orm';

export async function getAllUsers(): Promise<User[]> {
  try {
    const results = await db.select({
      id: usersTable.id,
      email: usersTable.email,
      password_hash: sql<string>`''`.as('password_hash'), // Don't expose password hashes
      first_name: usersTable.first_name,
      last_name: usersTable.last_name,
      role: usersTable.role,
      is_active: usersTable.is_active,
      created_at: usersTable.created_at,
      updated_at: usersTable.updated_at,
    })
    .from(usersTable)
    .orderBy(desc(usersTable.created_at))
    .execute();

    return results;
  } catch (error) {
    console.error('Failed to get all users:', error);
    throw error;
  }
}

export async function getAllTenants(): Promise<Tenant[]> {
  try {
    const results = await db.select()
      .from(tenantsTable)
      .orderBy(desc(tenantsTable.created_at))
      .execute();

    return results;
  } catch (error) {
    console.error('Failed to get all tenants:', error);
    throw error;
  }
}

export async function getUsersWithStats(): Promise<Array<{
  user: User;
  tenant_count: number;
  total_messages: number;
  last_active: Date | null;
}>> {
  try {
    const results = await db.select({
      user_id: usersTable.id,
      email: usersTable.email,
      first_name: usersTable.first_name,
      last_name: usersTable.last_name,
      role: usersTable.role,
      is_active: usersTable.is_active,
      created_at: usersTable.created_at,
      updated_at: usersTable.updated_at,
      tenant_count: sql<number>`COUNT(DISTINCT ${userTenantsTable.tenant_id})`.as('tenant_count'),
      total_messages: sql<number>`COUNT(DISTINCT ${messagesTable.id})`.as('total_messages'),
      last_active: sql<Date | null>`MAX(${messagesTable.created_at})`.as('last_active')
    })
    .from(usersTable)
    .leftJoin(userTenantsTable, eq(usersTable.id, userTenantsTable.user_id))
    .leftJoin(tenantsTable, eq(userTenantsTable.tenant_id, tenantsTable.id))
    .leftJoin(messagesTable, eq(tenantsTable.id, messagesTable.tenant_id))
    .groupBy(
      usersTable.id,
      usersTable.email,
      usersTable.first_name,
      usersTable.last_name,
      usersTable.role,
      usersTable.is_active,
      usersTable.created_at,
      usersTable.updated_at
    )
    .orderBy(desc(usersTable.created_at))
    .execute();

    return results.map(result => ({
      user: {
        id: result.user_id,
        email: result.email,
        password_hash: '', // Don't expose password hashes
        first_name: result.first_name,
        last_name: result.last_name,
        role: result.role,
        is_active: result.is_active,
        created_at: result.created_at,
        updated_at: result.updated_at,
      },
      tenant_count: Number(result.tenant_count),
      total_messages: Number(result.total_messages),
      last_active: result.last_active ? new Date(result.last_active) : null,
    }));
  } catch (error) {
    console.error('Failed to get users with stats:', error);
    throw error;
  }
}

export async function getSystemUsageStatistics(input?: {
  start_date?: Date;
  end_date?: Date;
}): Promise<{
  total_users: number;
  active_users: number;
  total_tenants: number;
  active_tenants: number;
  total_messages: number;
  total_ai_requests: number;
  daily_stats: UsageStatistics[];
}> {
  try {
    // Get basic counts
    const [totalUsers] = await db.select({ count: count() })
      .from(usersTable)
      .execute();

    const [activeUsers] = await db.select({ count: count() })
      .from(usersTable)
      .where(eq(usersTable.is_active, true))
      .execute();

    const [totalTenants] = await db.select({ count: count() })
      .from(tenantsTable)
      .execute();

    const [activeTenants] = await db.select({ count: count() })
      .from(tenantsTable)
      .where(eq(tenantsTable.is_active, true))
      .execute();

    const [totalMessages] = await db.select({ count: count() })
      .from(messagesTable)
      .execute();

    const [totalAIRequests] = await db.select({
      count: sum(usageStatisticsTable.ai_requests)
    })
    .from(usageStatisticsTable)
    .execute();

    // Get daily stats with optional date filtering
    let dailyStats;
    
    if (input?.start_date || input?.end_date) {
      const conditions = [];
      if (input.start_date) {
        conditions.push(gte(usageStatisticsTable.date, input.start_date));
      }
      if (input.end_date) {
        conditions.push(lte(usageStatisticsTable.date, input.end_date));
      }
      
      dailyStats = await db.select()
        .from(usageStatisticsTable)
        .where(conditions.length === 1 ? conditions[0] : and(...conditions))
        .orderBy(desc(usageStatisticsTable.date))
        .execute();
    } else {
      dailyStats = await db.select()
        .from(usageStatisticsTable)
        .orderBy(desc(usageStatisticsTable.date))
        .execute();
    }

    return {
      total_users: totalUsers.count,
      active_users: activeUsers.count,
      total_tenants: totalTenants.count,
      active_tenants: activeTenants.count,
      total_messages: totalMessages.count,
      total_ai_requests: Number(totalAIRequests.count) || 0,
      daily_stats: dailyStats,
    };
  } catch (error) {
    console.error('Failed to get system usage statistics:', error);
    throw error;
  }
}

export async function toggleUserStatus(userId: number, isActive: boolean): Promise<User> {
  try {
    const results = await db.update(usersTable)
      .set({ 
        is_active: isActive,
        updated_at: new Date()
      })
      .where(eq(usersTable.id, userId))
      .returning({
        id: usersTable.id,
        email: usersTable.email,
        password_hash: sql<string>`''`.as('password_hash'), // Don't expose password hash
        first_name: usersTable.first_name,
        last_name: usersTable.last_name,
        role: usersTable.role,
        is_active: usersTable.is_active,
        created_at: usersTable.created_at,
        updated_at: usersTable.updated_at,
      })
      .execute();

    if (results.length === 0) {
      throw new Error(`User with ID ${userId} not found`);
    }

    return results[0];
  } catch (error) {
    console.error('Failed to toggle user status:', error);
    throw error;
  }
}

export async function toggleTenantStatus(tenantId: number, isActive: boolean): Promise<Tenant> {
  try {
    // If deactivating tenant, disconnect WhatsApp connections
    if (!isActive) {
      await db.update(whatsappConnectionsTable)
        .set({
          connection_status: 'disconnected',
          updated_at: new Date()
        })
        .where(eq(whatsappConnectionsTable.tenant_id, tenantId))
        .execute();
    }

    const results = await db.update(tenantsTable)
      .set({ 
        is_active: isActive,
        updated_at: new Date()
      })
      .where(eq(tenantsTable.id, tenantId))
      .returning()
      .execute();

    if (results.length === 0) {
      throw new Error(`Tenant with ID ${tenantId} not found`);
    }

    return results[0];
  } catch (error) {
    console.error('Failed to toggle tenant status:', error);
    throw error;
  }
}

export async function getTenantUsage(tenantId: number): Promise<{
  tenant: Tenant;
  usage_stats: UsageStatistics[];
  total_users: number;
  connections_count: number;
  documents_count: number;
  ai_providers_count: number;
}> {
  try {
    // Get tenant details
    const tenants = await db.select()
      .from(tenantsTable)
      .where(eq(tenantsTable.id, tenantId))
      .execute();

    if (tenants.length === 0) {
      throw new Error(`Tenant with ID ${tenantId} not found`);
    }

    const tenant = tenants[0];

    // Get usage statistics
    const usage_stats = await db.select()
      .from(usageStatisticsTable)
      .where(eq(usageStatisticsTable.tenant_id, tenantId))
      .orderBy(desc(usageStatisticsTable.date))
      .execute();

    // Get total users count
    const [totalUsers] = await db.select({ count: count() })
      .from(userTenantsTable)
      .where(eq(userTenantsTable.tenant_id, tenantId))
      .execute();

    // Get connections count
    const [connectionsCount] = await db.select({ count: count() })
      .from(whatsappConnectionsTable)
      .where(eq(whatsappConnectionsTable.tenant_id, tenantId))
      .execute();

    // Get documents count
    const [documentsCount] = await db.select({ count: count() })
      .from(knowledgeBaseDocumentsTable)
      .where(eq(knowledgeBaseDocumentsTable.tenant_id, tenantId))
      .execute();

    // Get AI providers count
    const [aiProvidersCount] = await db.select({ count: count() })
      .from(aiProvidersTable)
      .where(eq(aiProvidersTable.tenant_id, tenantId))
      .execute();

    return {
      tenant,
      usage_stats,
      total_users: totalUsers.count,
      connections_count: connectionsCount.count,
      documents_count: documentsCount.count,
      ai_providers_count: aiProvidersCount.count,
    };
  } catch (error) {
    console.error('Failed to get tenant usage:', error);
    throw error;
  }
}