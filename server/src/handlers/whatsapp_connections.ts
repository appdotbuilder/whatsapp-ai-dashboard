import { db } from '../db';
import { whatsappConnectionsTable, tenantsTable } from '../db/schema';
import { 
    type CreateWhatsappConnectionInput, 
    type UpdateWhatsappConnectionInput, 
    type WhatsappConnection 
} from '../schema';
import { eq, and } from 'drizzle-orm';

export async function createWhatsappConnection(input: CreateWhatsappConnectionInput): Promise<WhatsappConnection> {
    try {
        // Verify that the tenant exists
        const tenant = await db.select()
            .from(tenantsTable)
            .where(eq(tenantsTable.id, input.tenant_id))
            .execute();

        if (tenant.length === 0) {
            throw new Error('Tenant not found');
        }

        // Create the WhatsApp connection record
        const result = await db.insert(whatsappConnectionsTable)
            .values({
                tenant_id: input.tenant_id,
                phone_number: input.phone_number,
                connection_status: 'pending',
                qr_code: null,
                last_connected_at: null,
                webhook_url: null,
                access_token: null,
            })
            .returning()
            .execute();

        return result[0];
    } catch (error) {
        console.error('WhatsApp connection creation failed:', error);
        throw error;
    }
}

export async function getWhatsappConnections(tenantId: number): Promise<WhatsappConnection[]> {
    try {
        const connections = await db.select()
            .from(whatsappConnectionsTable)
            .where(eq(whatsappConnectionsTable.tenant_id, tenantId))
            .execute();

        return connections;
    } catch (error) {
        console.error('Failed to fetch WhatsApp connections:', error);
        throw error;
    }
}

export async function getWhatsappConnectionById(connectionId: number): Promise<WhatsappConnection | null> {
    try {
        const connections = await db.select()
            .from(whatsappConnectionsTable)
            .where(eq(whatsappConnectionsTable.id, connectionId))
            .execute();

        return connections.length > 0 ? connections[0] : null;
    } catch (error) {
        console.error('Failed to fetch WhatsApp connection by ID:', error);
        throw error;
    }
}

export async function updateWhatsappConnection(input: UpdateWhatsappConnectionInput): Promise<WhatsappConnection> {
    try {
        // Check if the connection exists
        const existingConnection = await getWhatsappConnectionById(input.id);
        if (!existingConnection) {
            throw new Error('WhatsApp connection not found');
        }

        // Build update object with only provided fields
        const updateData: any = {
            updated_at: new Date(),
        };

        if (input.connection_status !== undefined) {
            updateData.connection_status = input.connection_status;
        }
        if (input.qr_code !== undefined) {
            updateData.qr_code = input.qr_code;
        }
        if (input.webhook_url !== undefined) {
            updateData.webhook_url = input.webhook_url;
        }
        if (input.access_token !== undefined) {
            updateData.access_token = input.access_token;
        }

        // Update last_connected_at when status changes to connected
        if (input.connection_status === 'connected') {
            updateData.last_connected_at = new Date();
        }

        const result = await db.update(whatsappConnectionsTable)
            .set(updateData)
            .where(eq(whatsappConnectionsTable.id, input.id))
            .returning()
            .execute();

        return result[0];
    } catch (error) {
        console.error('WhatsApp connection update failed:', error);
        throw error;
    }
}

export async function deleteWhatsappConnection(connectionId: number): Promise<{ success: boolean }> {
    try {
        // Check if the connection exists
        const existingConnection = await getWhatsappConnectionById(connectionId);
        if (!existingConnection) {
            throw new Error('WhatsApp connection not found');
        }

        // Delete the connection record
        await db.delete(whatsappConnectionsTable)
            .where(eq(whatsappConnectionsTable.id, connectionId))
            .execute();

        return { success: true };
    } catch (error) {
        console.error('WhatsApp connection deletion failed:', error);
        throw error;
    }
}

export async function generateQRCode(connectionId: number): Promise<{ qr_code: string }> {
    try {
        // Check if the connection exists
        const existingConnection = await getWhatsappConnectionById(connectionId);
        if (!existingConnection) {
            throw new Error('WhatsApp connection not found');
        }

        // Generate a mock QR code (in real implementation, this would integrate with WhatsApp Business API)
        const mockQRCode = `data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==`;

        // Update the connection with the new QR code
        await db.update(whatsappConnectionsTable)
            .set({
                qr_code: mockQRCode,
                connection_status: 'pending',
                updated_at: new Date(),
            })
            .where(eq(whatsappConnectionsTable.id, connectionId))
            .execute();

        return { qr_code: mockQRCode };
    } catch (error) {
        console.error('QR code generation failed:', error);
        throw error;
    }
}