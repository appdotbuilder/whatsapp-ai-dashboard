import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { knowledgeBaseDocumentsTable, tenantsTable } from '../db/schema';
import { 
  type CreateKnowledgeBaseDocumentInput, 
  type UpdateKnowledgeBaseDocumentInput 
} from '../schema';
import { 
  createKnowledgeBaseDocument,
  getKnowledgeBaseDocuments,
  getKnowledgeBaseDocumentById,
  updateKnowledgeBaseDocument,
  deleteKnowledgeBaseDocument,
  uploadKnowledgeBaseDocument,
  processDocumentEmbeddings
} from '../handlers/knowledge_base';
import { eq } from 'drizzle-orm';

// Test data setup
let testTenantId: number;

const createTestTenant = async () => {
  const result = await db.insert(tenantsTable)
    .values({
      name: 'Test Tenant',
      slug: 'test-tenant',
      plan: 'free',
      is_active: true
    })
    .returning()
    .execute();

  return result[0].id;
};

const testDocumentInput: CreateKnowledgeBaseDocumentInput = {
  tenant_id: 0, // Will be set in beforeEach
  title: 'Test Knowledge Document',
  content: 'This is a test knowledge base document with important information.',
  file_name: 'test-doc.txt',
  file_size: 1024,
  file_type: 'text/plain'
};

describe('Knowledge Base Handlers', () => {
  beforeEach(async () => {
    await createDB();
    testTenantId = await createTestTenant();
    testDocumentInput.tenant_id = testTenantId;
  });

  afterEach(resetDB);

  describe('createKnowledgeBaseDocument', () => {
    it('should create a knowledge base document', async () => {
      const result = await createKnowledgeBaseDocument(testDocumentInput);

      expect(result.id).toBeDefined();
      expect(result.tenant_id).toEqual(testTenantId);
      expect(result.title).toEqual('Test Knowledge Document');
      expect(result.content).toEqual(testDocumentInput.content);
      expect(result.file_name).toEqual('test-doc.txt');
      expect(result.file_size).toEqual(1024);
      expect(result.file_type).toEqual('text/plain');
      expect(result.is_processed).toBe(false);
      expect(result.embedding_status).toEqual('pending');
      expect(result.created_at).toBeInstanceOf(Date);
      expect(result.updated_at).toBeInstanceOf(Date);
    });

    it('should create document without optional file metadata', async () => {
      const inputWithoutFile: CreateKnowledgeBaseDocumentInput = {
        tenant_id: testTenantId,
        title: 'Simple Document',
        content: 'Simple content without file metadata'
      };

      const result = await createKnowledgeBaseDocument(inputWithoutFile);

      expect(result.title).toEqual('Simple Document');
      expect(result.content).toEqual('Simple content without file metadata');
      expect(result.file_name).toBeNull();
      expect(result.file_size).toBeNull();
      expect(result.file_type).toBeNull();
    });

    it('should save document to database', async () => {
      const result = await createKnowledgeBaseDocument(testDocumentInput);

      const documents = await db.select()
        .from(knowledgeBaseDocumentsTable)
        .where(eq(knowledgeBaseDocumentsTable.id, result.id))
        .execute();

      expect(documents).toHaveLength(1);
      expect(documents[0].title).toEqual('Test Knowledge Document');
      expect(documents[0].tenant_id).toEqual(testTenantId);
    });

    it('should throw error for non-existent tenant', async () => {
      const invalidInput: CreateKnowledgeBaseDocumentInput = {
        ...testDocumentInput,
        tenant_id: 99999
      };

      expect(createKnowledgeBaseDocument(invalidInput)).rejects.toThrow(/tenant.*not found/i);
    });
  });

  describe('getKnowledgeBaseDocuments', () => {
    it('should return empty array for tenant with no documents', async () => {
      const result = await getKnowledgeBaseDocuments(testTenantId);
      expect(result).toEqual([]);
    });

    it('should return all documents for a tenant', async () => {
      // Create multiple documents
      await createKnowledgeBaseDocument(testDocumentInput);
      await createKnowledgeBaseDocument({
        ...testDocumentInput,
        title: 'Second Document',
        content: 'Second document content'
      });

      const result = await getKnowledgeBaseDocuments(testTenantId);

      expect(result).toHaveLength(2);
      expect(result[0].title).toEqual('Test Knowledge Document');
      expect(result[1].title).toEqual('Second Document');
      expect(result.every(doc => doc.tenant_id === testTenantId)).toBe(true);
    });

    it('should only return documents for specified tenant', async () => {
      // Create second tenant
      const secondTenant = await db.insert(tenantsTable)
        .values({
          name: 'Second Tenant',
          slug: 'second-tenant',
          plan: 'basic'
        })
        .returning()
        .execute();

      // Create documents for different tenants
      await createKnowledgeBaseDocument(testDocumentInput);
      await createKnowledgeBaseDocument({
        ...testDocumentInput,
        tenant_id: secondTenant[0].id,
        title: 'Other Tenant Document'
      });

      const result = await getKnowledgeBaseDocuments(testTenantId);

      expect(result).toHaveLength(1);
      expect(result[0].tenant_id).toEqual(testTenantId);
    });
  });

  describe('getKnowledgeBaseDocumentById', () => {
    it('should return document by id', async () => {
      const created = await createKnowledgeBaseDocument(testDocumentInput);
      
      const result = await getKnowledgeBaseDocumentById(created.id);

      expect(result).not.toBeNull();
      expect(result!.id).toEqual(created.id);
      expect(result!.title).toEqual('Test Knowledge Document');
    });

    it('should return null for non-existent document', async () => {
      const result = await getKnowledgeBaseDocumentById(99999);
      expect(result).toBeNull();
    });
  });

  describe('updateKnowledgeBaseDocument', () => {
    it('should update document title', async () => {
      const created = await createKnowledgeBaseDocument(testDocumentInput);

      const updateInput: UpdateKnowledgeBaseDocumentInput = {
        id: created.id,
        title: 'Updated Title'
      };

      const result = await updateKnowledgeBaseDocument(updateInput);

      expect(result.id).toEqual(created.id);
      expect(result.title).toEqual('Updated Title');
      expect(result.content).toEqual(testDocumentInput.content); // Unchanged
    });

    it('should update document content and reset embedding status', async () => {
      const created = await createKnowledgeBaseDocument(testDocumentInput);

      // First, mark as processed
      await db.update(knowledgeBaseDocumentsTable)
        .set({
          embedding_status: 'completed',
          is_processed: true
        })
        .where(eq(knowledgeBaseDocumentsTable.id, created.id))
        .execute();

      const updateInput: UpdateKnowledgeBaseDocumentInput = {
        id: created.id,
        content: 'Updated content that requires re-embedding'
      };

      const result = await updateKnowledgeBaseDocument(updateInput);

      expect(result.content).toEqual('Updated content that requires re-embedding');
      expect(result.embedding_status).toEqual('pending');
      expect(result.is_processed).toBe(false);
    });

    it('should update embedding status', async () => {
      const created = await createKnowledgeBaseDocument(testDocumentInput);

      const updateInput: UpdateKnowledgeBaseDocumentInput = {
        id: created.id,
        embedding_status: 'completed',
        is_processed: true
      };

      const result = await updateKnowledgeBaseDocument(updateInput);

      expect(result.embedding_status).toEqual('completed');
      expect(result.is_processed).toBe(true);
    });

    it('should throw error for non-existent document', async () => {
      const updateInput: UpdateKnowledgeBaseDocumentInput = {
        id: 99999,
        title: 'Updated Title'
      };

      expect(updateKnowledgeBaseDocument(updateInput)).rejects.toThrow(/document.*not found/i);
    });

    it('should update updated_at timestamp', async () => {
      const created = await createKnowledgeBaseDocument(testDocumentInput);
      const originalUpdatedAt = created.updated_at;

      // Wait a small amount to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 10));

      const updateInput: UpdateKnowledgeBaseDocumentInput = {
        id: created.id,
        title: 'Updated Title'
      };

      const result = await updateKnowledgeBaseDocument(updateInput);

      expect(result.updated_at.getTime()).toBeGreaterThan(originalUpdatedAt.getTime());
    });
  });

  describe('deleteKnowledgeBaseDocument', () => {
    it('should delete existing document', async () => {
      const created = await createKnowledgeBaseDocument(testDocumentInput);

      const result = await deleteKnowledgeBaseDocument(created.id);

      expect(result.success).toBe(true);

      // Verify deletion
      const documents = await db.select()
        .from(knowledgeBaseDocumentsTable)
        .where(eq(knowledgeBaseDocumentsTable.id, created.id))
        .execute();

      expect(documents).toHaveLength(0);
    });

    it('should throw error for non-existent document', async () => {
      expect(deleteKnowledgeBaseDocument(99999)).rejects.toThrow(/document.*not found/i);
    });
  });

  describe('uploadKnowledgeBaseDocument', () => {
    const testFile = {
      name: 'uploaded-file.pdf',
      content: 'Content extracted from uploaded PDF file',
      type: 'application/pdf',
      size: 2048
    };

    it('should create document from uploaded file', async () => {
      const result = await uploadKnowledgeBaseDocument(testTenantId, testFile);

      expect(result.title).toEqual('uploaded-file.pdf');
      expect(result.content).toEqual('Content extracted from uploaded PDF file');
      expect(result.file_name).toEqual('uploaded-file.pdf');
      expect(result.file_size).toEqual(2048);
      expect(result.file_type).toEqual('application/pdf');
      expect(result.is_processed).toBe(false);
      expect(result.embedding_status).toEqual('pending');
    });

    it('should throw error for non-existent tenant', async () => {
      expect(uploadKnowledgeBaseDocument(99999, testFile)).rejects.toThrow(/tenant.*not found/i);
    });
  });

  describe('processDocumentEmbeddings', () => {
    it('should process document embeddings successfully', async () => {
      const created = await createKnowledgeBaseDocument(testDocumentInput);

      const result = await processDocumentEmbeddings(created.id);

      expect(result.success).toBe(true);
      expect(result.message).toEqual('Document embeddings processed successfully');

      // Verify document status was updated
      const updated = await getKnowledgeBaseDocumentById(created.id);
      expect(updated!.embedding_status).toEqual('completed');
      expect(updated!.is_processed).toBe(true);
    });

    it('should update status to processing then completed', async () => {
      const created = await createKnowledgeBaseDocument(testDocumentInput);

      await processDocumentEmbeddings(created.id);

      const final = await getKnowledgeBaseDocumentById(created.id);
      expect(final!.embedding_status).toEqual('completed');
      expect(final!.is_processed).toBe(true);
    });

    it('should throw error for non-existent document', async () => {
      expect(processDocumentEmbeddings(99999)).rejects.toThrow(/document.*not found/i);
    });
  });
});