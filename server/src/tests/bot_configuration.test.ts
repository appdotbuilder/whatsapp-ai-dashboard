import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { tenantsTable, botConfigurationsTable, aiProvidersTable } from '../db/schema';
import { 
    type CreateBotConfigurationInput,
    type UpdateBotConfigurationInput
} from '../schema';
import { 
    createBotConfiguration,
    getBotConfiguration,
    updateBotConfiguration,
    testBotConfiguration
} from '../handlers/bot_configuration';
import { eq } from 'drizzle-orm';

describe('Bot Configuration Handlers', () => {
    beforeEach(createDB);
    afterEach(resetDB);

    // Helper function to create a test tenant
    async function createTestTenant() {
        const result = await db.insert(tenantsTable)
            .values({
                name: 'Test Tenant',
                slug: 'test-tenant',
                plan: 'basic',
                is_active: true,
            })
            .returning()
            .execute();
        return result[0];
    }

    // Helper function to create a test AI provider
    async function createTestAIProvider(tenantId: number) {
        const result = await db.insert(aiProvidersTable)
            .values({
                tenant_id: tenantId,
                provider_name: 'openai',
                api_key: 'test-api-key',
                model_name: 'gpt-3.5-turbo',
                is_active: true,
                configuration: '{}',
            })
            .returning()
            .execute();
        return result[0];
    }

    describe('createBotConfiguration', () => {
        it('should create a bot configuration successfully', async () => {
            const tenant = await createTestTenant();
            
            const input: CreateBotConfigurationInput = {
                tenant_id: tenant.id,
                bot_name: 'Customer Service Bot',
                system_prompt: 'You are a helpful customer service assistant',
                language: 'en',
                response_tone: 'friendly',
                max_response_length: 300,
                enable_fallback: true,
                fallback_message: 'I apologize, but I cannot help with that.',
                business_hours_start: '09:00',
                business_hours_end: '17:00',
                timezone: 'America/New_York',
            };

            const result = await createBotConfiguration(input);

            expect(result.id).toBeDefined();
            expect(result.tenant_id).toEqual(tenant.id);
            expect(result.bot_name).toEqual('Customer Service Bot');
            expect(result.system_prompt).toEqual('You are a helpful customer service assistant');
            expect(result.language).toEqual('en');
            expect(result.response_tone).toEqual('friendly');
            expect(result.max_response_length).toEqual(300);
            expect(result.enable_fallback).toEqual(true);
            expect(result.fallback_message).toEqual('I apologize, but I cannot help with that.');
            expect(result.business_hours_start).toEqual('09:00');
            expect(result.business_hours_end).toEqual('17:00');
            expect(result.timezone).toEqual('America/New_York');
            expect(result.created_at).toBeInstanceOf(Date);
            expect(result.updated_at).toBeInstanceOf(Date);
        });

        it('should create bot configuration with optional fields as null', async () => {
            const tenant = await createTestTenant();
            
            const input: CreateBotConfigurationInput = {
                tenant_id: tenant.id,
                bot_name: 'Simple Bot',
                system_prompt: 'You are a simple assistant',
                language: 'es',
                response_tone: 'professional',
                max_response_length: 500,
                enable_fallback: false,
                timezone: 'UTC',
            };

            const result = await createBotConfiguration(input);

            expect(result.fallback_message).toBeNull();
            expect(result.business_hours_start).toBeNull();
            expect(result.business_hours_end).toBeNull();
            expect(result.timezone).toEqual('UTC');
            expect(result.enable_fallback).toEqual(false);
        });

        it('should save bot configuration to database', async () => {
            const tenant = await createTestTenant();
            
            const input: CreateBotConfigurationInput = {
                tenant_id: tenant.id,
                bot_name: 'Test Bot',
                system_prompt: 'Test prompt',
                language: 'en',
                response_tone: 'casual',
                max_response_length: 200,
                enable_fallback: true,
                timezone: 'UTC',
            };

            const result = await createBotConfiguration(input);

            const savedConfig = await db.select()
                .from(botConfigurationsTable)
                .where(eq(botConfigurationsTable.id, result.id))
                .execute();

            expect(savedConfig).toHaveLength(1);
            expect(savedConfig[0].bot_name).toEqual('Test Bot');
            expect(savedConfig[0].tenant_id).toEqual(tenant.id);
        });

        it('should throw error for non-existent tenant', async () => {
            const input: CreateBotConfigurationInput = {
                tenant_id: 99999,
                bot_name: 'Test Bot',
                system_prompt: 'Test prompt',
                language: 'en',
                response_tone: 'professional',
                max_response_length: 500,
                enable_fallback: true,
                timezone: 'UTC',
            };

            await expect(createBotConfiguration(input)).rejects.toThrow(/tenant.*not found/i);
        });

        it('should throw error when bot configuration already exists for tenant', async () => {
            const tenant = await createTestTenant();
            
            const input: CreateBotConfigurationInput = {
                tenant_id: tenant.id,
                bot_name: 'Test Bot',
                system_prompt: 'Test prompt',
                language: 'en',
                response_tone: 'professional',
                max_response_length: 500,
                enable_fallback: true,
                timezone: 'UTC',
            };

            // Create first configuration
            await createBotConfiguration(input);

            // Try to create second configuration for same tenant
            await expect(createBotConfiguration(input)).rejects.toThrow(/already exists/i);
        });
    });

    describe('getBotConfiguration', () => {
        it('should return bot configuration for existing tenant', async () => {
            const tenant = await createTestTenant();
            
            // Create a bot configuration first
            const createInput: CreateBotConfigurationInput = {
                tenant_id: tenant.id,
                bot_name: 'Test Bot',
                system_prompt: 'Test prompt',
                language: 'en',
                response_tone: 'professional',
                max_response_length: 500,
                enable_fallback: true,
                timezone: 'UTC',
            };
            await createBotConfiguration(createInput);

            const result = await getBotConfiguration(tenant.id);

            expect(result).not.toBeNull();
            expect(result!.tenant_id).toEqual(tenant.id);
            expect(result!.bot_name).toEqual('Test Bot');
            expect(result!.system_prompt).toEqual('Test prompt');
        });

        it('should return null for tenant without bot configuration', async () => {
            const tenant = await createTestTenant();
            
            const result = await getBotConfiguration(tenant.id);

            expect(result).toBeNull();
        });

        it('should return null for non-existent tenant', async () => {
            const result = await getBotConfiguration(99999);

            expect(result).toBeNull();
        });
    });

    describe('updateBotConfiguration', () => {
        it('should update bot configuration successfully', async () => {
            const tenant = await createTestTenant();
            
            // Create initial configuration
            const createInput: CreateBotConfigurationInput = {
                tenant_id: tenant.id,
                bot_name: 'Original Bot',
                system_prompt: 'Original prompt',
                language: 'en',
                response_tone: 'professional',
                max_response_length: 500,
                enable_fallback: true,
                timezone: 'UTC',
            };
            const created = await createBotConfiguration(createInput);

            // Update configuration
            const updateInput: UpdateBotConfigurationInput = {
                id: created.id,
                bot_name: 'Updated Bot',
                system_prompt: 'Updated prompt',
                response_tone: 'friendly',
                max_response_length: 750,
                enable_fallback: false,
            };

            const result = await updateBotConfiguration(updateInput);

            expect(result.id).toEqual(created.id);
            expect(result.bot_name).toEqual('Updated Bot');
            expect(result.system_prompt).toEqual('Updated prompt');
            expect(result.response_tone).toEqual('friendly');
            expect(result.max_response_length).toEqual(750);
            expect(result.enable_fallback).toEqual(false);
            expect(result.language).toEqual('en'); // Unchanged
            expect(result.timezone).toEqual('UTC'); // Unchanged
            expect(result.updated_at.getTime()).toBeGreaterThan(created.updated_at.getTime());
        });

        it('should update only specified fields', async () => {
            const tenant = await createTestTenant();
            
            // Create initial configuration
            const createInput: CreateBotConfigurationInput = {
                tenant_id: tenant.id,
                bot_name: 'Original Bot',
                system_prompt: 'Original prompt',
                language: 'en',
                response_tone: 'professional',
                max_response_length: 500,
                enable_fallback: true,
                timezone: 'UTC',
            };
            const created = await createBotConfiguration(createInput);

            // Update only bot name
            const updateInput: UpdateBotConfigurationInput = {
                id: created.id,
                bot_name: 'New Name Only',
            };

            const result = await updateBotConfiguration(updateInput);

            expect(result.bot_name).toEqual('New Name Only');
            expect(result.system_prompt).toEqual('Original prompt'); // Unchanged
            expect(result.response_tone).toEqual('professional'); // Unchanged
            expect(result.max_response_length).toEqual(500); // Unchanged
        });

        it('should update configuration in database', async () => {
            const tenant = await createTestTenant();
            
            // Create initial configuration
            const createInput: CreateBotConfigurationInput = {
                tenant_id: tenant.id,
                bot_name: 'Original Bot',
                system_prompt: 'Original prompt',
                language: 'en',
                response_tone: 'professional',
                max_response_length: 500,
                enable_fallback: true,
                timezone: 'UTC',
            };
            const created = await createBotConfiguration(createInput);

            // Update configuration
            const updateInput: UpdateBotConfigurationInput = {
                id: created.id,
                bot_name: 'Database Updated Bot',
            };

            await updateBotConfiguration(updateInput);

            const savedConfig = await db.select()
                .from(botConfigurationsTable)
                .where(eq(botConfigurationsTable.id, created.id))
                .execute();

            expect(savedConfig).toHaveLength(1);
            expect(savedConfig[0].bot_name).toEqual('Database Updated Bot');
        });

        it('should throw error for non-existent bot configuration', async () => {
            const updateInput: UpdateBotConfigurationInput = {
                id: 99999,
                bot_name: 'Non-existent',
            };

            await expect(updateBotConfiguration(updateInput)).rejects.toThrow(/not found/i);
        });
    });

    describe('testBotConfiguration', () => {
        it('should test bot configuration successfully', async () => {
            const tenant = await createTestTenant();
            await createTestAIProvider(tenant.id);
            
            // Create bot configuration
            const createInput: CreateBotConfigurationInput = {
                tenant_id: tenant.id,
                bot_name: 'Test Bot',
                system_prompt: 'You are a helpful assistant',
                language: 'en',
                response_tone: 'friendly',
                max_response_length: 300,
                enable_fallback: true,
                timezone: 'UTC',
            };
            await createBotConfiguration(createInput);

            const result = await testBotConfiguration(tenant.id, 'Hello, how are you?');

            expect(result.response).toBeDefined();
            expect(typeof result.response).toEqual('string');
            expect(result.response.length).toBeLessThanOrEqual(300); // Respects max length
            expect(result.response_time_ms).toBeDefined();
            expect(typeof result.response_time_ms).toEqual('number');
            expect(result.response_time_ms).toBeGreaterThan(0);
        });

        it('should include bot configuration details in test response', async () => {
            const tenant = await createTestTenant();
            await createTestAIProvider(tenant.id);
            
            const createInput: CreateBotConfigurationInput = {
                tenant_id: tenant.id,
                bot_name: 'Customer Support Bot',
                system_prompt: 'You are a professional customer support agent',
                language: 'en',
                response_tone: 'professional',
                max_response_length: 500,
                enable_fallback: true,
                timezone: 'UTC',
            };
            await createBotConfiguration(createInput);

            const result = await testBotConfiguration(tenant.id, 'Test message');

            expect(result.response).toContain('Customer Support Bot');
            expect(result.response).toContain('professional');
            expect(result.response).toContain('Test message');
        });

        it('should throw error when no bot configuration exists', async () => {
            const tenant = await createTestTenant();
            
            await expect(testBotConfiguration(tenant.id, 'Test message'))
                .rejects.toThrow(/no bot configuration found/i);
        });

        it('should throw error when no active AI provider exists', async () => {
            const tenant = await createTestTenant();
            
            // Create bot configuration but no AI provider
            const createInput: CreateBotConfigurationInput = {
                tenant_id: tenant.id,
                bot_name: 'Test Bot',
                system_prompt: 'Test prompt',
                language: 'en',
                response_tone: 'professional',
                max_response_length: 500,
                enable_fallback: true,
                timezone: 'UTC',
            };
            await createBotConfiguration(createInput);

            await expect(testBotConfiguration(tenant.id, 'Test message'))
                .rejects.toThrow(/no active ai provider found/i);
        });

        it('should respect max response length', async () => {
            const tenant = await createTestTenant();
            await createTestAIProvider(tenant.id);
            
            const createInput: CreateBotConfigurationInput = {
                tenant_id: tenant.id,
                bot_name: 'Limited Response Bot',
                system_prompt: 'You provide very detailed responses with lots of information',
                language: 'en',
                response_tone: 'professional',
                max_response_length: 50, // Very short limit
                enable_fallback: true,
                timezone: 'UTC',
            };
            await createBotConfiguration(createInput);

            const result = await testBotConfiguration(tenant.id, 'Tell me everything about your service');

            expect(result.response.length).toBeLessThanOrEqual(50);
        });
    });
});