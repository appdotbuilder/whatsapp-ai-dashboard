import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { whatsappConnectionsTable, tenantsTable } from '../db/schema';
import { 
    type CreateWhatsappConnectionInput, 
    type UpdateWhatsappConnectionInput 
} from '../schema';
import {
    createWhatsappConnection,
    getWhatsappConnections,
    getWhatsappConnectionById,
    updateWhatsappConnection,
    deleteWhatsappConnection,
    generateQRCode
} from '../handlers/whatsapp_connections';
import { eq } from 'drizzle-orm';

describe('WhatsApp Connections Handlers', () => {
    beforeEach(createDB);
    afterEach(resetDB);

    let testTenantId: number;

    beforeEach(async () => {
        // Create a test tenant
        const tenantResult = await db.insert(tenantsTable)
            .values({
                name: 'Test Tenant',
                slug: 'test-tenant',
                plan: 'free',
                is_active: true,
            })
            .returning()
            .execute();
        
        testTenantId = tenantResult[0].id;
    });

    describe('createWhatsappConnection', () => {
        const testInput: CreateWhatsappConnectionInput = {
            tenant_id: 0, // Will be set to testTenantId
            phone_number: '+1234567890',
        };

        it('should create a WhatsApp connection', async () => {
            testInput.tenant_id = testTenantId;
            
            const result = await createWhatsappConnection(testInput);

            expect(result.tenant_id).toEqual(testTenantId);
            expect(result.phone_number).toEqual('+1234567890');
            expect(result.connection_status).toEqual('pending');
            expect(result.qr_code).toBeNull();
            expect(result.last_connected_at).toBeNull();
            expect(result.webhook_url).toBeNull();
            expect(result.access_token).toBeNull();
            expect(result.id).toBeDefined();
            expect(result.created_at).toBeInstanceOf(Date);
            expect(result.updated_at).toBeInstanceOf(Date);
        });

        it('should save connection to database', async () => {
            testInput.tenant_id = testTenantId;
            
            const result = await createWhatsappConnection(testInput);

            const connections = await db.select()
                .from(whatsappConnectionsTable)
                .where(eq(whatsappConnectionsTable.id, result.id))
                .execute();

            expect(connections).toHaveLength(1);
            expect(connections[0].tenant_id).toEqual(testTenantId);
            expect(connections[0].phone_number).toEqual('+1234567890');
            expect(connections[0].connection_status).toEqual('pending');
        });

        it('should throw error for non-existent tenant', async () => {
            const invalidInput: CreateWhatsappConnectionInput = {
                tenant_id: 99999,
                phone_number: '+1234567890',
            };

            await expect(createWhatsappConnection(invalidInput)).rejects.toThrow(/tenant not found/i);
        });
    });

    describe('getWhatsappConnections', () => {
        it('should return empty array when no connections exist', async () => {
            const connections = await getWhatsappConnections(testTenantId);
            expect(connections).toEqual([]);
        });

        it('should return all connections for a tenant', async () => {
            // Create multiple connections
            await createWhatsappConnection({
                tenant_id: testTenantId,
                phone_number: '+1111111111',
            });
            
            await createWhatsappConnection({
                tenant_id: testTenantId,
                phone_number: '+2222222222',
            });

            const connections = await getWhatsappConnections(testTenantId);

            expect(connections).toHaveLength(2);
            expect(connections[0].tenant_id).toEqual(testTenantId);
            expect(connections[1].tenant_id).toEqual(testTenantId);
            expect(connections.map(c => c.phone_number)).toContain('+1111111111');
            expect(connections.map(c => c.phone_number)).toContain('+2222222222');
        });

        it('should only return connections for the specified tenant', async () => {
            // Create another tenant
            const otherTenantResult = await db.insert(tenantsTable)
                .values({
                    name: 'Other Tenant',
                    slug: 'other-tenant',
                    plan: 'basic',
                    is_active: true,
                })
                .returning()
                .execute();
            
            const otherTenantId = otherTenantResult[0].id;

            // Create connections for both tenants
            await createWhatsappConnection({
                tenant_id: testTenantId,
                phone_number: '+1111111111',
            });

            await createWhatsappConnection({
                tenant_id: otherTenantId,
                phone_number: '+2222222222',
            });

            const connections = await getWhatsappConnections(testTenantId);

            expect(connections).toHaveLength(1);
            expect(connections[0].tenant_id).toEqual(testTenantId);
            expect(connections[0].phone_number).toEqual('+1111111111');
        });
    });

    describe('getWhatsappConnectionById', () => {
        it('should return null when connection does not exist', async () => {
            const connection = await getWhatsappConnectionById(99999);
            expect(connection).toBeNull();
        });

        it('should return connection when it exists', async () => {
            const created = await createWhatsappConnection({
                tenant_id: testTenantId,
                phone_number: '+1234567890',
            });

            const connection = await getWhatsappConnectionById(created.id);

            expect(connection).not.toBeNull();
            expect(connection!.id).toEqual(created.id);
            expect(connection!.tenant_id).toEqual(testTenantId);
            expect(connection!.phone_number).toEqual('+1234567890');
        });
    });

    describe('updateWhatsappConnection', () => {
        let connectionId: number;

        beforeEach(async () => {
            const created = await createWhatsappConnection({
                tenant_id: testTenantId,
                phone_number: '+1234567890',
            });
            connectionId = created.id;
        });

        it('should update connection status', async () => {
            const updateInput: UpdateWhatsappConnectionInput = {
                id: connectionId,
                connection_status: 'connected',
            };

            const result = await updateWhatsappConnection(updateInput);

            expect(result.id).toEqual(connectionId);
            expect(result.connection_status).toEqual('connected');
            expect(result.last_connected_at).toBeInstanceOf(Date);
            expect(result.updated_at).toBeInstanceOf(Date);
        });

        it('should update QR code', async () => {
            const qrCode = 'data:image/png;base64,testqrcode';
            const updateInput: UpdateWhatsappConnectionInput = {
                id: connectionId,
                qr_code: qrCode,
            };

            const result = await updateWhatsappConnection(updateInput);

            expect(result.qr_code).toEqual(qrCode);
        });

        it('should update webhook URL and access token', async () => {
            const updateInput: UpdateWhatsappConnectionInput = {
                id: connectionId,
                webhook_url: 'https://example.com/webhook',
                access_token: 'test_token_123',
            };

            const result = await updateWhatsappConnection(updateInput);

            expect(result.webhook_url).toEqual('https://example.com/webhook');
            expect(result.access_token).toEqual('test_token_123');
        });

        it('should only update provided fields', async () => {
            const updateInput: UpdateWhatsappConnectionInput = {
                id: connectionId,
                connection_status: 'error',
            };

            const result = await updateWhatsappConnection(updateInput);

            expect(result.connection_status).toEqual('error');
            expect(result.phone_number).toEqual('+1234567890'); // Original value preserved
            expect(result.qr_code).toBeNull(); // Original value preserved
        });

        it('should throw error for non-existent connection', async () => {
            const updateInput: UpdateWhatsappConnectionInput = {
                id: 99999,
                connection_status: 'connected',
            };

            await expect(updateWhatsappConnection(updateInput)).rejects.toThrow(/connection not found/i);
        });

        it('should save updates to database', async () => {
            const updateInput: UpdateWhatsappConnectionInput = {
                id: connectionId,
                connection_status: 'connected',
                webhook_url: 'https://test.com/hook',
            };

            await updateWhatsappConnection(updateInput);

            const updated = await db.select()
                .from(whatsappConnectionsTable)
                .where(eq(whatsappConnectionsTable.id, connectionId))
                .execute();

            expect(updated[0].connection_status).toEqual('connected');
            expect(updated[0].webhook_url).toEqual('https://test.com/hook');
            expect(updated[0].last_connected_at).toBeInstanceOf(Date);
        });
    });

    describe('deleteWhatsappConnection', () => {
        let connectionId: number;

        beforeEach(async () => {
            const created = await createWhatsappConnection({
                tenant_id: testTenantId,
                phone_number: '+1234567890',
            });
            connectionId = created.id;
        });

        it('should delete existing connection', async () => {
            const result = await deleteWhatsappConnection(connectionId);

            expect(result.success).toBe(true);

            const deleted = await getWhatsappConnectionById(connectionId);
            expect(deleted).toBeNull();
        });

        it('should remove connection from database', async () => {
            await deleteWhatsappConnection(connectionId);

            const connections = await db.select()
                .from(whatsappConnectionsTable)
                .where(eq(whatsappConnectionsTable.id, connectionId))
                .execute();

            expect(connections).toHaveLength(0);
        });

        it('should throw error for non-existent connection', async () => {
            await expect(deleteWhatsappConnection(99999)).rejects.toThrow(/connection not found/i);
        });
    });

    describe('generateQRCode', () => {
        let connectionId: number;

        beforeEach(async () => {
            const created = await createWhatsappConnection({
                tenant_id: testTenantId,
                phone_number: '+1234567890',
            });
            connectionId = created.id;
        });

        it('should generate QR code for existing connection', async () => {
            const result = await generateQRCode(connectionId);

            expect(result.qr_code).toBeDefined();
            expect(result.qr_code).toMatch(/^data:image\/png;base64,/);
        });

        it('should update connection with QR code in database', async () => {
            const result = await generateQRCode(connectionId);

            const updated = await getWhatsappConnectionById(connectionId);

            expect(updated!.qr_code).toEqual(result.qr_code);
            expect(updated!.connection_status).toEqual('pending');
            expect(updated!.updated_at).toBeInstanceOf(Date);
        });

        it('should throw error for non-existent connection', async () => {
            await expect(generateQRCode(99999)).rejects.toThrow(/connection not found/i);
        });
    });
});