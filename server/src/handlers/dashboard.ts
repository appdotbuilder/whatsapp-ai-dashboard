import { db } from '../db';
import { 
  whatsappConnectionsTable, 
  messagesTable, 
  aiProvidersTable,
  tenantsTable 
} from '../db/schema';
import { type WhatsappConnection, type Message, type AIProvider } from '../schema';
import { eq, and, gte, desc, sql, count, avg } from 'drizzle-orm';

export async function getDashboardOverview(tenantId: number): Promise<{
    whatsapp_status: {
        connections: WhatsappConnection[];
        active_connections: number;
        total_connections: number;
    };
    recent_messages: Message[];
    ai_providers: {
        providers: AIProvider[];
        active_providers: number;
        total_providers: number;
    };
    stats: {
        messages_today: number;
        messages_this_week: number;
        avg_response_time: number;
        bot_accuracy: number;
    };
}> {
    try {
        // Verify tenant exists
        const tenant = await db.select()
            .from(tenantsTable)
            .where(eq(tenantsTable.id, tenantId))
            .limit(1)
            .execute();

        if (tenant.length === 0) {
            throw new Error(`Tenant with ID ${tenantId} not found`);
        }

        // Get WhatsApp connections
        const connections = await db.select()
            .from(whatsappConnectionsTable)
            .where(eq(whatsappConnectionsTable.tenant_id, tenantId))
            .execute();

        const active_connections = connections.filter(conn => conn.connection_status === 'connected').length;

        // Get recent messages (last 10)
        const recentMessagesResults = await db.select()
            .from(messagesTable)
            .where(eq(messagesTable.tenant_id, tenantId))
            .orderBy(desc(messagesTable.created_at))
            .limit(10)
            .execute();

        // Get AI providers
        const providers = await db.select()
            .from(aiProvidersTable)
            .where(eq(aiProvidersTable.tenant_id, tenantId))
            .execute();

        const active_providers = providers.filter(provider => provider.is_active).length;

        // Calculate date ranges
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
        oneWeekAgo.setHours(0, 0, 0, 0);

        // Get messages today count
        const messagesTodayResult = await db.select({ count: count() })
            .from(messagesTable)
            .where(and(
                eq(messagesTable.tenant_id, tenantId),
                gte(messagesTable.created_at, today)
            ))
            .execute();

        const messages_today = messagesTodayResult[0]?.count || 0;

        // Get messages this week count
        const messagesWeekResult = await db.select({ count: count() })
            .from(messagesTable)
            .where(and(
                eq(messagesTable.tenant_id, tenantId),
                gte(messagesTable.created_at, oneWeekAgo)
            ))
            .execute();

        const messages_this_week = messagesWeekResult[0]?.count || 0;

        // Calculate average response time for bot responses
        const avgResponseResult = await db.select({ 
            avg_time: avg(messagesTable.response_time_ms) 
        })
            .from(messagesTable)
            .where(and(
                eq(messagesTable.tenant_id, tenantId),
                eq(messagesTable.is_bot_response, true),
                gte(messagesTable.created_at, oneWeekAgo)
            ))
            .execute();

        const avg_response_time = parseFloat(avgResponseResult[0]?.avg_time || '0');

        // Calculate bot accuracy (successful bot responses vs failed)
        const botResponsesResult = await db.select({ 
            total: count(),
            successful: sql<number>`count(case when ${messagesTable.status} in ('sent', 'delivered', 'read') then 1 end)`
        })
            .from(messagesTable)
            .where(and(
                eq(messagesTable.tenant_id, tenantId),
                eq(messagesTable.is_bot_response, true),
                gte(messagesTable.created_at, oneWeekAgo)
            ))
            .execute();

        const totalBotResponses = botResponsesResult[0]?.total || 0;
        const successfulBotResponses = Number(botResponsesResult[0]?.successful) || 0;
        const bot_accuracy = totalBotResponses > 0 ? (successfulBotResponses / totalBotResponses) * 100 : 0;

        return {
            whatsapp_status: {
                connections,
                active_connections,
                total_connections: connections.length,
            },
            recent_messages: recentMessagesResults,
            ai_providers: {
                providers,
                active_providers,
                total_providers: providers.length,
            },
            stats: {
                messages_today,
                messages_this_week,
                avg_response_time: Math.round(avg_response_time),
                bot_accuracy: Math.round(bot_accuracy * 100) / 100, // Round to 2 decimal places
            },
        };
    } catch (error) {
        console.error('Dashboard overview failed:', error);
        throw error;
    }
}

export async function getConnectionStatus(tenantId: number): Promise<{
    connections: Array<{
        id: number;
        phone_number: string;
        status: string;
        last_connected: Date | null;
        messages_today: number;
    }>;
}> {
    try {
        // Verify tenant exists
        const tenant = await db.select()
            .from(tenantsTable)
            .where(eq(tenantsTable.id, tenantId))
            .limit(1)
            .execute();

        if (tenant.length === 0) {
            throw new Error(`Tenant with ID ${tenantId} not found`);
        }

        // Get all tenant connections
        const connections = await db.select()
            .from(whatsappConnectionsTable)
            .where(eq(whatsappConnectionsTable.tenant_id, tenantId))
            .execute();

        // Calculate today's date range
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Get message counts for each connection today
        const connectionsWithStats = await Promise.all(
            connections.map(async (connection) => {
                const messagesTodayResult = await db.select({ count: count() })
                    .from(messagesTable)
                    .where(and(
                        eq(messagesTable.whatsapp_connection_id, connection.id),
                        gte(messagesTable.created_at, today)
                    ))
                    .execute();

                const messages_today = messagesTodayResult[0]?.count || 0;

                return {
                    id: connection.id,
                    phone_number: connection.phone_number,
                    status: connection.connection_status,
                    last_connected: connection.last_connected_at,
                    messages_today,
                };
            })
        );

        return {
            connections: connectionsWithStats,
        };
    } catch (error) {
        console.error('Connection status retrieval failed:', error);
        throw error;
    }
}

export async function getAIProviderStatus(tenantId: number): Promise<{
    providers: Array<{
        id: number;
        provider_name: string;
        model_name: string;
        is_active: boolean;
        requests_today: number;
        avg_response_time: number;
        success_rate: number;
    }>;
}> {
    try {
        // Verify tenant exists
        const tenant = await db.select()
            .from(tenantsTable)
            .where(eq(tenantsTable.id, tenantId))
            .limit(1)
            .execute();

        if (tenant.length === 0) {
            throw new Error(`Tenant with ID ${tenantId} not found`);
        }

        // Get all tenant AI providers
        const providers = await db.select()
            .from(aiProvidersTable)
            .where(eq(aiProvidersTable.tenant_id, tenantId))
            .execute();

        // Calculate today's date range
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Get stats for each provider
        const providersWithStats = await Promise.all(
            providers.map(async (provider) => {
                // Count AI requests today (bot responses using this provider)
                const requestsTodayResult = await db.select({ count: count() })
                    .from(messagesTable)
                    .where(and(
                        eq(messagesTable.tenant_id, tenantId),
                        eq(messagesTable.is_bot_response, true),
                        eq(messagesTable.ai_provider_used, provider.provider_name),
                        gte(messagesTable.created_at, today)
                    ))
                    .execute();

                const requests_today = requestsTodayResult[0]?.count || 0;

                // Calculate average response time for this provider today
                const avgResponseResult = await db.select({ 
                    avg_time: avg(messagesTable.response_time_ms) 
                })
                    .from(messagesTable)
                    .where(and(
                        eq(messagesTable.tenant_id, tenantId),
                        eq(messagesTable.is_bot_response, true),
                        eq(messagesTable.ai_provider_used, provider.provider_name),
                        gte(messagesTable.created_at, today)
                    ))
                    .execute();

                const avg_response_time = parseFloat(avgResponseResult[0]?.avg_time || '0');

                // Calculate success rate for this provider today
                const successRateResult = await db.select({ 
                    total: count(),
                    successful: sql<number>`count(case when ${messagesTable.status} in ('sent', 'delivered', 'read') then 1 end)`
                })
                    .from(messagesTable)
                    .where(and(
                        eq(messagesTable.tenant_id, tenantId),
                        eq(messagesTable.is_bot_response, true),
                        eq(messagesTable.ai_provider_used, provider.provider_name),
                        gte(messagesTable.created_at, today)
                    ))
                    .execute();

                const totalRequests = successRateResult[0]?.total || 0;
                const successfulRequests = Number(successRateResult[0]?.successful) || 0;
                const success_rate = totalRequests > 0 ? (successfulRequests / totalRequests) * 100 : 100;

                return {
                    id: provider.id,
                    provider_name: provider.provider_name,
                    model_name: provider.model_name,
                    is_active: provider.is_active,
                    requests_today,
                    avg_response_time: Math.round(avg_response_time),
                    success_rate: Math.round(success_rate * 100) / 100, // Round to 2 decimal places
                };
            })
        );

        return {
            providers: providersWithStats,
        };
    } catch (error) {
        console.error('AI provider status retrieval failed:', error);
        throw error;
    }
}