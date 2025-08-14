import { db } from '../db';
import { aiProvidersTable, tenantsTable } from '../db/schema';
import { 
    type CreateAIProviderInput, 
    type UpdateAIProviderInput, 
    type AIProvider 
} from '../schema';
import { eq, and } from 'drizzle-orm';

export const createAIProvider = async (input: CreateAIProviderInput): Promise<AIProvider> => {
  try {
    // Verify tenant exists
    const tenant = await db.select()
      .from(tenantsTable)
      .where(eq(tenantsTable.id, input.tenant_id))
      .limit(1)
      .execute();

    if (tenant.length === 0) {
      throw new Error('Tenant not found');
    }

    // Check if provider already exists for this tenant
    const existingProvider = await db.select()
      .from(aiProvidersTable)
      .where(and(
        eq(aiProvidersTable.tenant_id, input.tenant_id),
        eq(aiProvidersTable.provider_name, input.provider_name)
      ))
      .limit(1)
      .execute();

    if (existingProvider.length > 0) {
      throw new Error(`AI provider ${input.provider_name} already exists for this tenant`);
    }

    // Create provider record
    const result = await db.insert(aiProvidersTable)
      .values({
        tenant_id: input.tenant_id,
        provider_name: input.provider_name,
        api_key: input.api_key,
        model_name: input.model_name,
        configuration: input.configuration || '{}',
        is_active: true
      })
      .returning()
      .execute();

    return result[0];
  } catch (error) {
    console.error('AI provider creation failed:', error);
    throw error;
  }
};

export const getAIProviders = async (tenantId: number): Promise<AIProvider[]> => {
  try {
    // Verify tenant exists
    const tenant = await db.select()
      .from(tenantsTable)
      .where(eq(tenantsTable.id, tenantId))
      .limit(1)
      .execute();

    if (tenant.length === 0) {
      throw new Error('Tenant not found');
    }

    const providers = await db.select()
      .from(aiProvidersTable)
      .where(eq(aiProvidersTable.tenant_id, tenantId))
      .execute();

    return providers;
  } catch (error) {
    console.error('Failed to get AI providers:', error);
    throw error;
  }
};

export const getAIProviderById = async (providerId: number): Promise<AIProvider | null> => {
  try {
    const result = await db.select()
      .from(aiProvidersTable)
      .where(eq(aiProvidersTable.id, providerId))
      .limit(1)
      .execute();

    return result.length > 0 ? result[0] : null;
  } catch (error) {
    console.error('Failed to get AI provider:', error);
    throw error;
  }
};

export const updateAIProvider = async (input: UpdateAIProviderInput): Promise<AIProvider> => {
  try {
    // Get existing provider
    const existing = await getAIProviderById(input.id);
    if (!existing) {
      throw new Error('AI provider not found');
    }

    // Build update object with only provided fields
    const updateData: Partial<typeof aiProvidersTable.$inferInsert> = {
      updated_at: new Date()
    };

    if (input.api_key !== undefined) {
      updateData.api_key = input.api_key;
    }
    if (input.model_name !== undefined) {
      updateData.model_name = input.model_name;
    }
    if (input.is_active !== undefined) {
      updateData.is_active = input.is_active;
    }
    if (input.configuration !== undefined) {
      updateData.configuration = input.configuration;
    }

    const result = await db.update(aiProvidersTable)
      .set(updateData)
      .where(eq(aiProvidersTable.id, input.id))
      .returning()
      .execute();

    return result[0];
  } catch (error) {
    console.error('AI provider update failed:', error);
    throw error;
  }
};

export const deleteAIProvider = async (providerId: number): Promise<{ success: boolean }> => {
  try {
    // Check if provider exists
    const provider = await getAIProviderById(providerId);
    if (!provider) {
      throw new Error('AI provider not found');
    }

    // Delete the provider
    await db.delete(aiProvidersTable)
      .where(eq(aiProvidersTable.id, providerId))
      .execute();

    return { success: true };
  } catch (error) {
    console.error('AI provider deletion failed:', error);
    throw error;
  }
};

export const testAIProvider = async (providerId: number): Promise<{ success: boolean; message: string }> => {
  try {
    // Get provider configuration
    const provider = await getAIProviderById(providerId);
    if (!provider) {
      throw new Error('AI provider not found');
    }

    if (!provider.is_active) {
      return {
        success: false,
        message: 'AI provider is not active'
      };
    }

    // Basic validation of required fields
    if (!provider.api_key || !provider.model_name) {
      return {
        success: false,
        message: 'AI provider configuration is incomplete'
      };
    }

    // In a real implementation, you would make an actual API call here
    // For now, we'll just validate the configuration exists
    return {
      success: true,
      message: `AI provider ${provider.provider_name} configuration is valid`
    };
  } catch (error) {
    console.error('AI provider test failed:', error);
    return {
      success: false,
      message: `AI provider test failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
};