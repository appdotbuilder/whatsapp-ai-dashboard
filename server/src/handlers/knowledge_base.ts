import { db } from '../db';
import { knowledgeBaseDocumentsTable, tenantsTable } from '../db/schema';
import { 
    type CreateKnowledgeBaseDocumentInput, 
    type UpdateKnowledgeBaseDocumentInput, 
    type KnowledgeBaseDocument 
} from '../schema';
import { eq } from 'drizzle-orm';

export const createKnowledgeBaseDocument = async (input: CreateKnowledgeBaseDocumentInput): Promise<KnowledgeBaseDocument> => {
  try {
    // Verify tenant exists
    const tenant = await db.select()
      .from(tenantsTable)
      .where(eq(tenantsTable.id, input.tenant_id))
      .limit(1)
      .execute();

    if (!tenant.length) {
      throw new Error(`Tenant with id ${input.tenant_id} not found`);
    }

    // Insert knowledge base document
    const result = await db.insert(knowledgeBaseDocumentsTable)
      .values({
        tenant_id: input.tenant_id,
        title: input.title,
        content: input.content,
        file_name: input.file_name || null,
        file_size: input.file_size || null,
        file_type: input.file_type || null,
        is_processed: false,
        embedding_status: 'pending'
      })
      .returning()
      .execute();

    return result[0];
  } catch (error) {
    console.error('Knowledge base document creation failed:', error);
    throw error;
  }
};

export const getKnowledgeBaseDocuments = async (tenantId: number): Promise<KnowledgeBaseDocument[]> => {
  try {
    const result = await db.select()
      .from(knowledgeBaseDocumentsTable)
      .where(eq(knowledgeBaseDocumentsTable.tenant_id, tenantId))
      .execute();

    return result;
  } catch (error) {
    console.error('Failed to fetch knowledge base documents:', error);
    throw error;
  }
};

export const getKnowledgeBaseDocumentById = async (documentId: number): Promise<KnowledgeBaseDocument | null> => {
  try {
    const result = await db.select()
      .from(knowledgeBaseDocumentsTable)
      .where(eq(knowledgeBaseDocumentsTable.id, documentId))
      .limit(1)
      .execute();

    return result.length > 0 ? result[0] : null;
  } catch (error) {
    console.error('Failed to fetch knowledge base document:', error);
    throw error;
  }
};

export const updateKnowledgeBaseDocument = async (input: UpdateKnowledgeBaseDocumentInput): Promise<KnowledgeBaseDocument> => {
  try {
    // Check if document exists
    const existing = await db.select()
      .from(knowledgeBaseDocumentsTable)
      .where(eq(knowledgeBaseDocumentsTable.id, input.id))
      .limit(1)
      .execute();

    if (!existing.length) {
      throw new Error(`Knowledge base document with id ${input.id} not found`);
    }

    // Prepare update values, filtering out undefined fields
    const updateValues: Partial<typeof knowledgeBaseDocumentsTable.$inferInsert> = {
      updated_at: new Date()
    };

    if (input.title !== undefined) {
      updateValues.title = input.title;
    }
    if (input.content !== undefined) {
      updateValues.content = input.content;
      // Reset embedding status if content changed
      updateValues.embedding_status = 'pending';
      updateValues.is_processed = false;
    }
    if (input.is_processed !== undefined) {
      updateValues.is_processed = input.is_processed;
    }
    if (input.embedding_status !== undefined) {
      updateValues.embedding_status = input.embedding_status;
    }

    // Update document
    const result = await db.update(knowledgeBaseDocumentsTable)
      .set(updateValues)
      .where(eq(knowledgeBaseDocumentsTable.id, input.id))
      .returning()
      .execute();

    return result[0];
  } catch (error) {
    console.error('Knowledge base document update failed:', error);
    throw error;
  }
};

export const deleteKnowledgeBaseDocument = async (documentId: number): Promise<{ success: boolean }> => {
  try {
    // Check if document exists
    const existing = await db.select()
      .from(knowledgeBaseDocumentsTable)
      .where(eq(knowledgeBaseDocumentsTable.id, documentId))
      .limit(1)
      .execute();

    if (!existing.length) {
      throw new Error(`Knowledge base document with id ${documentId} not found`);
    }

    // Delete document
    await db.delete(knowledgeBaseDocumentsTable)
      .where(eq(knowledgeBaseDocumentsTable.id, documentId))
      .execute();

    return { success: true };
  } catch (error) {
    console.error('Knowledge base document deletion failed:', error);
    throw error;
  }
};

export const uploadKnowledgeBaseDocument = async (
    tenantId: number,
    file: { name: string; content: string; type: string; size: number }
): Promise<KnowledgeBaseDocument> => {
  try {
    // Verify tenant exists
    const tenant = await db.select()
      .from(tenantsTable)
      .where(eq(tenantsTable.id, tenantId))
      .limit(1)
      .execute();

    if (!tenant.length) {
      throw new Error(`Tenant with id ${tenantId} not found`);
    }

    // Create document from uploaded file
    const result = await db.insert(knowledgeBaseDocumentsTable)
      .values({
        tenant_id: tenantId,
        title: file.name,
        content: file.content,
        file_name: file.name,
        file_size: file.size,
        file_type: file.type,
        is_processed: false,
        embedding_status: 'pending'
      })
      .returning()
      .execute();

    return result[0];
  } catch (error) {
    console.error('Knowledge base document upload failed:', error);
    throw error;
  }
};

export const processDocumentEmbeddings = async (documentId: number): Promise<{ success: boolean; message: string }> => {
  try {
    // Check if document exists
    const document = await db.select()
      .from(knowledgeBaseDocumentsTable)
      .where(eq(knowledgeBaseDocumentsTable.id, documentId))
      .limit(1)
      .execute();

    if (!document.length) {
      throw new Error(`Knowledge base document with id ${documentId} not found`);
    }

    // Update embedding status to processing
    await db.update(knowledgeBaseDocumentsTable)
      .set({
        embedding_status: 'processing',
        updated_at: new Date()
      })
      .where(eq(knowledgeBaseDocumentsTable.id, documentId))
      .execute();

    // Simulate processing (in real implementation, this would call an AI service)
    // For now, we'll just mark it as completed
    await db.update(knowledgeBaseDocumentsTable)
      .set({
        embedding_status: 'completed',
        is_processed: true,
        updated_at: new Date()
      })
      .where(eq(knowledgeBaseDocumentsTable.id, documentId))
      .execute();

    return {
      success: true,
      message: 'Document embeddings processed successfully'
    };
  } catch (error) {
    // Update status to failed on error
    await db.update(knowledgeBaseDocumentsTable)
      .set({
        embedding_status: 'failed',
        updated_at: new Date()
      })
      .where(eq(knowledgeBaseDocumentsTable.id, documentId))
      .execute();

    console.error('Document embedding processing failed:', error);
    throw error;
  }
};