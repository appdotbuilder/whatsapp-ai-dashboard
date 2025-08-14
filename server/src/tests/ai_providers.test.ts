import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { tenantsTable, aiProvidersTable } from '../db/schema';
import { type CreateAIProviderInput, type UpdateAIProviderInput } from '../schema';
import { 
  createAIProvider, 
  getAIProviders, 
  getAIProviderById, 
  updateAIProvider, 
  deleteAIProvider, 
  testAIProvider 
} from '../handlers/ai_providers';
import { eq } from 'drizzle-orm';

// Test data
const testTenant = {
  name: 'Test Tenant',
  slug: 'test-tenant',
  plan: 'basic' as const,
  is_active: true
};

const testAIProviderInput: CreateAIProviderInput = {
  tenant_id: 1,
  provider_name: 'openai',
  api_key: 'sk-test-key-12345',
  model_name: 'gpt-4',
  configuration: '{"temperature": 0.7, "max_tokens": 1000}'
};

describe('AI Providers', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  describe('createAIProvider', () => {
    it('should create an AI provider', async () => {
      // Create tenant first
      const tenantResult = await db.insert(tenantsTable)
        .values(testTenant)
        .returning()
        .execute();
      
      const input = { ...testAIProviderInput, tenant_id: tenantResult[0].id };
      const result = await createAIProvider(input);

      expect(result.tenant_id).toEqual(tenantResult[0].id);
      expect(result.provider_name).toEqual('openai');
      expect(result.api_key).toEqual('sk-test-key-12345');
      expect(result.model_name).toEqual('gpt-4');
      expect(result.configuration).toEqual('{"temperature": 0.7, "max_tokens": 1000}');
      expect(result.is_active).toEqual(true);
      expect(result.id).toBeDefined();
      expect(result.created_at).toBeInstanceOf(Date);
      expect(result.updated_at).toBeInstanceOf(Date);
    });

    it('should use default configuration when not provided', async () => {
      const tenantResult = await db.insert(tenantsTable)
        .values(testTenant)
        .returning()
        .execute();
      
      const input: CreateAIProviderInput = {
        tenant_id: tenantResult[0].id,
        provider_name: 'anthropic',
        api_key: 'sk-ant-test-key',
        model_name: 'claude-3'
      };

      const result = await createAIProvider(input);
      expect(result.configuration).toEqual('{}');
    });

    it('should save AI provider to database', async () => {
      const tenantResult = await db.insert(tenantsTable)
        .values(testTenant)
        .returning()
        .execute();
      
      const input = { ...testAIProviderInput, tenant_id: tenantResult[0].id };
      const result = await createAIProvider(input);

      const providers = await db.select()
        .from(aiProvidersTable)
        .where(eq(aiProvidersTable.id, result.id))
        .execute();

      expect(providers).toHaveLength(1);
      expect(providers[0].provider_name).toEqual('openai');
      expect(providers[0].api_key).toEqual('sk-test-key-12345');
      expect(providers[0].is_active).toEqual(true);
    });

    it('should throw error if tenant does not exist', async () => {
      const input = { ...testAIProviderInput, tenant_id: 999 };
      
      await expect(createAIProvider(input)).rejects.toThrow(/tenant not found/i);
    });

    it('should throw error if provider already exists for tenant', async () => {
      const tenantResult = await db.insert(tenantsTable)
        .values(testTenant)
        .returning()
        .execute();
      
      const input = { ...testAIProviderInput, tenant_id: tenantResult[0].id };
      
      // Create first provider
      await createAIProvider(input);
      
      // Try to create duplicate
      await expect(createAIProvider(input)).rejects.toThrow(/already exists/i);
    });

    it('should allow same provider for different tenants', async () => {
      // Create two tenants
      const tenant1 = await db.insert(tenantsTable)
        .values(testTenant)
        .returning()
        .execute();
      
      const tenant2 = await db.insert(tenantsTable)
        .values({ ...testTenant, slug: 'test-tenant-2' })
        .returning()
        .execute();
      
      // Create same provider for both tenants
      const input1 = { ...testAIProviderInput, tenant_id: tenant1[0].id };
      const input2 = { ...testAIProviderInput, tenant_id: tenant2[0].id };
      
      const result1 = await createAIProvider(input1);
      const result2 = await createAIProvider(input2);
      
      expect(result1.tenant_id).toEqual(tenant1[0].id);
      expect(result2.tenant_id).toEqual(tenant2[0].id);
      expect(result1.provider_name).toEqual(result2.provider_name);
    });
  });

  describe('getAIProviders', () => {
    it('should return empty array for tenant with no providers', async () => {
      const tenantResult = await db.insert(tenantsTable)
        .values(testTenant)
        .returning()
        .execute();

      const providers = await getAIProviders(tenantResult[0].id);
      expect(providers).toEqual([]);
    });

    it('should return all providers for a tenant', async () => {
      const tenantResult = await db.insert(tenantsTable)
        .values(testTenant)
        .returning()
        .execute();
      
      // Create multiple providers
      const input1 = { ...testAIProviderInput, tenant_id: tenantResult[0].id };
      const input2 = { 
        ...testAIProviderInput, 
        tenant_id: tenantResult[0].id, 
        provider_name: 'anthropic' as const,
        model_name: 'claude-3'
      };
      
      await createAIProvider(input1);
      await createAIProvider(input2);
      
      const providers = await getAIProviders(tenantResult[0].id);
      
      expect(providers).toHaveLength(2);
      expect(providers.map(p => p.provider_name)).toContain('openai');
      expect(providers.map(p => p.provider_name)).toContain('anthropic');
    });

    it('should throw error if tenant does not exist', async () => {
      await expect(getAIProviders(999)).rejects.toThrow(/tenant not found/i);
    });

    it('should not return providers from other tenants', async () => {
      // Create two tenants
      const tenant1 = await db.insert(tenantsTable)
        .values(testTenant)
        .returning()
        .execute();
      
      const tenant2 = await db.insert(tenantsTable)
        .values({ ...testTenant, slug: 'test-tenant-2' })
        .returning()
        .execute();
      
      // Create provider for tenant1 only
      const input = { ...testAIProviderInput, tenant_id: tenant1[0].id };
      await createAIProvider(input);
      
      // Get providers for tenant2
      const providers = await getAIProviders(tenant2[0].id);
      expect(providers).toHaveLength(0);
    });
  });

  describe('getAIProviderById', () => {
    it('should return AI provider by ID', async () => {
      const tenantResult = await db.insert(tenantsTable)
        .values(testTenant)
        .returning()
        .execute();
      
      const input = { ...testAIProviderInput, tenant_id: tenantResult[0].id };
      const created = await createAIProvider(input);
      
      const result = await getAIProviderById(created.id);
      
      expect(result).not.toBeNull();
      expect(result!.id).toEqual(created.id);
      expect(result!.provider_name).toEqual('openai');
      expect(result!.api_key).toEqual('sk-test-key-12345');
    });

    it('should return null for non-existent provider', async () => {
      const result = await getAIProviderById(999);
      expect(result).toBeNull();
    });
  });

  describe('updateAIProvider', () => {
    it('should update AI provider fields', async () => {
      const tenantResult = await db.insert(tenantsTable)
        .values(testTenant)
        .returning()
        .execute();
      
      const input = { ...testAIProviderInput, tenant_id: tenantResult[0].id };
      const created = await createAIProvider(input);
      
      const updateInput: UpdateAIProviderInput = {
        id: created.id,
        api_key: 'sk-new-key-67890',
        model_name: 'gpt-4-turbo',
        is_active: false,
        configuration: '{"temperature": 0.5}'
      };
      
      const result = await updateAIProvider(updateInput);
      
      expect(result.id).toEqual(created.id);
      expect(result.api_key).toEqual('sk-new-key-67890');
      expect(result.model_name).toEqual('gpt-4-turbo');
      expect(result.is_active).toEqual(false);
      expect(result.configuration).toEqual('{"temperature": 0.5}');
      expect(result.updated_at.getTime()).toBeGreaterThan(created.updated_at.getTime());
    });

    it('should update only provided fields', async () => {
      const tenantResult = await db.insert(tenantsTable)
        .values(testTenant)
        .returning()
        .execute();
      
      const input = { ...testAIProviderInput, tenant_id: tenantResult[0].id };
      const created = await createAIProvider(input);
      
      const updateInput: UpdateAIProviderInput = {
        id: created.id,
        model_name: 'gpt-3.5-turbo'
      };
      
      const result = await updateAIProvider(updateInput);
      
      expect(result.model_name).toEqual('gpt-3.5-turbo');
      expect(result.api_key).toEqual(created.api_key); // Should remain unchanged
      expect(result.is_active).toEqual(created.is_active); // Should remain unchanged
    });

    it('should save updated provider to database', async () => {
      const tenantResult = await db.insert(tenantsTable)
        .values(testTenant)
        .returning()
        .execute();
      
      const input = { ...testAIProviderInput, tenant_id: tenantResult[0].id };
      const created = await createAIProvider(input);
      
      const updateInput: UpdateAIProviderInput = {
        id: created.id,
        model_name: 'gpt-3.5-turbo',
        is_active: false
      };
      
      await updateAIProvider(updateInput);
      
      const providers = await db.select()
        .from(aiProvidersTable)
        .where(eq(aiProvidersTable.id, created.id))
        .execute();
      
      expect(providers).toHaveLength(1);
      expect(providers[0].model_name).toEqual('gpt-3.5-turbo');
      expect(providers[0].is_active).toEqual(false);
    });

    it('should throw error if provider does not exist', async () => {
      const updateInput: UpdateAIProviderInput = {
        id: 999,
        model_name: 'new-model'
      };
      
      await expect(updateAIProvider(updateInput)).rejects.toThrow(/not found/i);
    });
  });

  describe('deleteAIProvider', () => {
    it('should delete AI provider', async () => {
      const tenantResult = await db.insert(tenantsTable)
        .values(testTenant)
        .returning()
        .execute();
      
      const input = { ...testAIProviderInput, tenant_id: tenantResult[0].id };
      const created = await createAIProvider(input);
      
      const result = await deleteAIProvider(created.id);
      expect(result.success).toEqual(true);
      
      // Verify provider is deleted from database
      const providers = await db.select()
        .from(aiProvidersTable)
        .where(eq(aiProvidersTable.id, created.id))
        .execute();
      
      expect(providers).toHaveLength(0);
    });

    it('should throw error if provider does not exist', async () => {
      await expect(deleteAIProvider(999)).rejects.toThrow(/not found/i);
    });
  });

  describe('testAIProvider', () => {
    it('should return success for valid active provider', async () => {
      const tenantResult = await db.insert(tenantsTable)
        .values(testTenant)
        .returning()
        .execute();
      
      const input = { ...testAIProviderInput, tenant_id: tenantResult[0].id };
      const created = await createAIProvider(input);
      
      const result = await testAIProvider(created.id);
      
      expect(result.success).toEqual(true);
      expect(result.message).toContain('configuration is valid');
    });

    it('should return failure for inactive provider', async () => {
      const tenantResult = await db.insert(tenantsTable)
        .values(testTenant)
        .returning()
        .execute();
      
      const input = { ...testAIProviderInput, tenant_id: tenantResult[0].id };
      const created = await createAIProvider(input);
      
      // Deactivate provider
      await updateAIProvider({ id: created.id, is_active: false });
      
      const result = await testAIProvider(created.id);
      
      expect(result.success).toEqual(false);
      expect(result.message).toContain('not active');
    });

    it('should return failure for non-existent provider', async () => {
      const result = await testAIProvider(999);
      
      expect(result.success).toEqual(false);
      expect(result.message).toContain('not found');
    });

    it('should return failure for provider with incomplete configuration', async () => {
      const tenantResult = await db.insert(tenantsTable)
        .values(testTenant)
        .returning()
        .execute();
      
      // Create provider directly in database with missing api_key
      const providerResult = await db.insert(aiProvidersTable)
        .values({
          tenant_id: tenantResult[0].id,
          provider_name: 'openai',
          api_key: '', // Empty API key
          model_name: 'gpt-4',
          configuration: '{}',
          is_active: true
        })
        .returning()
        .execute();
      
      const result = await testAIProvider(providerResult[0].id);
      
      expect(result.success).toEqual(false);
      expect(result.message).toContain('configuration is incomplete');
    });
  });
});