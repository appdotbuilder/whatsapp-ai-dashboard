import { db } from '../db';
import { usersTable, tenantsTable, userTenantsTable } from '../db/schema';
import { type Tenant, type UserTenant } from '../schema';
import { eq, and } from 'drizzle-orm';

export async function getTenantsByUser(userId: number): Promise<Tenant[]> {
  try {
    // Join user_tenants with tenants table to get all tenants for a user
    const results = await db.select({
      id: tenantsTable.id,
      name: tenantsTable.name,
      slug: tenantsTable.slug,
      plan: tenantsTable.plan,
      is_active: tenantsTable.is_active,
      created_at: tenantsTable.created_at,
      updated_at: tenantsTable.updated_at,
    })
    .from(userTenantsTable)
    .innerJoin(tenantsTable, eq(userTenantsTable.tenant_id, tenantsTable.id))
    .where(eq(userTenantsTable.user_id, userId))
    .execute();

    return results;
  } catch (error) {
    console.error('Failed to get tenants for user:', error);
    throw error;
  }
}

export async function getTenantById(tenantId: number): Promise<Tenant | null> {
  try {
    const results = await db.select()
      .from(tenantsTable)
      .where(eq(tenantsTable.id, tenantId))
      .execute();

    return results.length > 0 ? results[0] : null;
  } catch (error) {
    console.error('Failed to get tenant by ID:', error);
    throw error;
  }
}

export async function getUserTenantRole(userId: number, tenantId: number): Promise<UserTenant | null> {
  try {
    const results = await db.select()
      .from(userTenantsTable)
      .where(
        and(
          eq(userTenantsTable.user_id, userId),
          eq(userTenantsTable.tenant_id, tenantId)
        )
      )
      .execute();

    return results.length > 0 ? results[0] : null;
  } catch (error) {
    console.error('Failed to get user tenant role:', error);
    throw error;
  }
}

export async function getTenantMembers(tenantId: number): Promise<Array<{ user: any; role: string }>> {
  try {
    // Join user_tenants with users table to get all members of a tenant
    const results = await db.select({
      user: {
        id: usersTable.id,
        email: usersTable.email,
        first_name: usersTable.first_name,
        last_name: usersTable.last_name,
        role: usersTable.role,
        is_active: usersTable.is_active,
        created_at: usersTable.created_at,
        updated_at: usersTable.updated_at,
      },
      role: userTenantsTable.role,
    })
    .from(userTenantsTable)
    .innerJoin(usersTable, eq(userTenantsTable.user_id, usersTable.id))
    .where(eq(userTenantsTable.tenant_id, tenantId))
    .execute();

    return results.map(result => ({
      user: result.user,
      role: result.role,
    }));
  } catch (error) {
    console.error('Failed to get tenant members:', error);
    throw error;
  }
}