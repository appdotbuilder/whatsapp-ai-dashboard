import { db } from '../db';
import { botConfigurationsTable, tenantsTable, aiProvidersTable } from '../db/schema';
import { 
    type CreateBotConfigurationInput, 
    type UpdateBotConfigurationInput, 
    type BotConfiguration 
} from '../schema';
import { eq, and } from 'drizzle-orm';

export async function createBotConfiguration(input: CreateBotConfigurationInput): Promise<BotConfiguration> {
    try {
        // Validate that the tenant exists
        const tenant = await db.select()
            .from(tenantsTable)
            .where(eq(tenantsTable.id, input.tenant_id))
            .execute();
        
        if (tenant.length === 0) {
            throw new Error(`Tenant with ID ${input.tenant_id} not found`);
        }

        // Check if a bot configuration already exists for this tenant
        const existingConfig = await db.select()
            .from(botConfigurationsTable)
            .where(eq(botConfigurationsTable.tenant_id, input.tenant_id))
            .execute();
        
        if (existingConfig.length > 0) {
            throw new Error(`Bot configuration already exists for tenant ${input.tenant_id}`);
        }

        // Create the bot configuration
        const result = await db.insert(botConfigurationsTable)
            .values({
                tenant_id: input.tenant_id,
                bot_name: input.bot_name,
                system_prompt: input.system_prompt,
                language: input.language,
                response_tone: input.response_tone,
                max_response_length: input.max_response_length,
                enable_fallback: input.enable_fallback,
                fallback_message: input.fallback_message || null,
                business_hours_start: input.business_hours_start || null,
                business_hours_end: input.business_hours_end || null,
                timezone: input.timezone,
            })
            .returning()
            .execute();

        return result[0];
    } catch (error) {
        console.error('Bot configuration creation failed:', error);
        throw error;
    }
}

export async function getBotConfiguration(tenantId: number): Promise<BotConfiguration | null> {
    try {
        const result = await db.select()
            .from(botConfigurationsTable)
            .where(eq(botConfigurationsTable.tenant_id, tenantId))
            .execute();

        return result.length > 0 ? result[0] : null;
    } catch (error) {
        console.error('Failed to get bot configuration:', error);
        throw error;
    }
}

export async function updateBotConfiguration(input: UpdateBotConfigurationInput): Promise<BotConfiguration> {
    try {
        // Check if the bot configuration exists
        const existingConfig = await db.select()
            .from(botConfigurationsTable)
            .where(eq(botConfigurationsTable.id, input.id))
            .execute();
        
        if (existingConfig.length === 0) {
            throw new Error(`Bot configuration with ID ${input.id} not found`);
        }

        // Build update object with only provided fields
        const updateData: Partial<typeof botConfigurationsTable.$inferInsert> = {};
        
        if (input.bot_name !== undefined) updateData.bot_name = input.bot_name;
        if (input.system_prompt !== undefined) updateData.system_prompt = input.system_prompt;
        if (input.language !== undefined) updateData.language = input.language;
        if (input.response_tone !== undefined) updateData.response_tone = input.response_tone;
        if (input.max_response_length !== undefined) updateData.max_response_length = input.max_response_length;
        if (input.enable_fallback !== undefined) updateData.enable_fallback = input.enable_fallback;
        if (input.fallback_message !== undefined) updateData.fallback_message = input.fallback_message;
        if (input.business_hours_start !== undefined) updateData.business_hours_start = input.business_hours_start;
        if (input.business_hours_end !== undefined) updateData.business_hours_end = input.business_hours_end;
        if (input.timezone !== undefined) updateData.timezone = input.timezone;

        // Always update the updated_at timestamp
        updateData.updated_at = new Date();

        const result = await db.update(botConfigurationsTable)
            .set(updateData)
            .where(eq(botConfigurationsTable.id, input.id))
            .returning()
            .execute();

        return result[0];
    } catch (error) {
        console.error('Bot configuration update failed:', error);
        throw error;
    }
}

export async function testBotConfiguration(tenantId: number, testMessage: string): Promise<{ response: string; response_time_ms: number }> {
    try {
        const startTime = Date.now();

        // Get the bot configuration
        const botConfig = await getBotConfiguration(tenantId);
        if (!botConfig) {
            throw new Error(`No bot configuration found for tenant ${tenantId}`);
        }

        // Get an active AI provider for the tenant
        const aiProvider = await db.select()
            .from(aiProvidersTable)
            .where(and(
                eq(aiProvidersTable.tenant_id, tenantId),
                eq(aiProvidersTable.is_active, true)
            ))
            .execute();
        
        if (aiProvider.length === 0) {
            throw new Error(`No active AI provider found for tenant ${tenantId}`);
        }

        const responseTime = Date.now() - startTime;

        // For testing purposes, return a mock response based on the configuration
        // In a real implementation, this would integrate with the actual AI provider
        const response = `Test response from ${botConfig.bot_name} using ${botConfig.response_tone} tone. ` +
            `System prompt: "${botConfig.system_prompt.substring(0, 50)}..." ` +
            `Test message received: "${testMessage}"`;

        return {
            response: response.substring(0, botConfig.max_response_length),
            response_time_ms: responseTime + 500 // Add some simulated processing time
        };
    } catch (error) {
        console.error('Bot configuration test failed:', error);
        throw error;
    }
}