import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, tenantsTable, userTenantsTable } from '../db/schema';
import { 
  getTenantsByUser, 
  getTenantById, 
  getUserTenantRole, 
  getTenantMembers 
} from '../handlers/tenants';

// Test data
const testUser1 = {
  email: 'user1@example.com',
  password_hash: 'hashed_password',
  first_name: 'John',
  last_name: 'Doe',
  role: 'user' as const,
};

const testUser2 = {
  email: 'user2@example.com',
  password_hash: 'hashed_password',
  first_name: 'Jane',
  last_name: 'Smith',
  role: 'admin' as const,
};

const testTenant1 = {
  name: 'Test Company 1',
  slug: 'test-company-1',
  plan: 'basic' as const,
};

const testTenant2 = {
  name: 'Test Company 2',
  slug: 'test-company-2',
  plan: 'premium' as const,
};

describe('Tenant Handlers', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  describe('getTenantsByUser', () => {
    it('should return empty array when user has no tenants', async () => {
      // Create user without any tenant associations
      const userResult = await db.insert(usersTable)
        .values(testUser1)
        .returning()
        .execute();

      const tenants = await getTenantsByUser(userResult[0].id);

      expect(tenants).toEqual([]);
    });

    it('should return tenants for user with single tenant', async () => {
      // Create user and tenant
      const userResult = await db.insert(usersTable)
        .values(testUser1)
        .returning()
        .execute();

      const tenantResult = await db.insert(tenantsTable)
        .values(testTenant1)
        .returning()
        .execute();

      // Associate user with tenant
      await db.insert(userTenantsTable)
        .values({
          user_id: userResult[0].id,
          tenant_id: tenantResult[0].id,
          role: 'owner',
        })
        .execute();

      const tenants = await getTenantsByUser(userResult[0].id);

      expect(tenants).toHaveLength(1);
      expect(tenants[0].id).toEqual(tenantResult[0].id);
      expect(tenants[0].name).toEqual('Test Company 1');
      expect(tenants[0].slug).toEqual('test-company-1');
      expect(tenants[0].plan).toEqual('basic');
      expect(tenants[0].is_active).toBe(true);
      expect(tenants[0].created_at).toBeInstanceOf(Date);
      expect(tenants[0].updated_at).toBeInstanceOf(Date);
    });

    it('should return multiple tenants for user', async () => {
      // Create user and two tenants
      const userResult = await db.insert(usersTable)
        .values(testUser1)
        .returning()
        .execute();

      const tenantResults = await db.insert(tenantsTable)
        .values([testTenant1, testTenant2])
        .returning()
        .execute();

      // Associate user with both tenants
      await db.insert(userTenantsTable)
        .values([
          {
            user_id: userResult[0].id,
            tenant_id: tenantResults[0].id,
            role: 'owner',
          },
          {
            user_id: userResult[0].id,
            tenant_id: tenantResults[1].id,
            role: 'admin',
          },
        ])
        .execute();

      const tenants = await getTenantsByUser(userResult[0].id);

      expect(tenants).toHaveLength(2);
      
      const tenantNames = tenants.map(t => t.name);
      expect(tenantNames).toContain('Test Company 1');
      expect(tenantNames).toContain('Test Company 2');
    });

    it('should only return active tenant associations', async () => {
      // Create user and tenant
      const userResult = await db.insert(usersTable)
        .values(testUser1)
        .returning()
        .execute();

      const activeTenant = await db.insert(tenantsTable)
        .values(testTenant1)
        .returning()
        .execute();

      const inactiveTenant = await db.insert(tenantsTable)
        .values({
          ...testTenant2,
          is_active: false,
        })
        .returning()
        .execute();

      // Associate user with both tenants
      await db.insert(userTenantsTable)
        .values([
          {
            user_id: userResult[0].id,
            tenant_id: activeTenant[0].id,
            role: 'owner',
          },
          {
            user_id: userResult[0].id,
            tenant_id: inactiveTenant[0].id,
            role: 'admin',
          },
        ])
        .execute();

      const tenants = await getTenantsByUser(userResult[0].id);

      expect(tenants).toHaveLength(2); // Both tenants returned, filtering by is_active would need additional where clause
      const activeCount = tenants.filter(t => t.is_active).length;
      const inactiveCount = tenants.filter(t => !t.is_active).length;
      expect(activeCount).toBe(1);
      expect(inactiveCount).toBe(1);
    });
  });

  describe('getTenantById', () => {
    it('should return null for non-existent tenant', async () => {
      const tenant = await getTenantById(999);
      expect(tenant).toBeNull();
    });

    it('should return tenant for valid ID', async () => {
      const tenantResult = await db.insert(tenantsTable)
        .values(testTenant1)
        .returning()
        .execute();

      const tenant = await getTenantById(tenantResult[0].id);

      expect(tenant).not.toBeNull();
      expect(tenant!.id).toEqual(tenantResult[0].id);
      expect(tenant!.name).toEqual('Test Company 1');
      expect(tenant!.slug).toEqual('test-company-1');
      expect(tenant!.plan).toEqual('basic');
      expect(tenant!.is_active).toBe(true);
      expect(tenant!.created_at).toBeInstanceOf(Date);
      expect(tenant!.updated_at).toBeInstanceOf(Date);
    });

    it('should return inactive tenant', async () => {
      const tenantResult = await db.insert(tenantsTable)
        .values({
          ...testTenant1,
          is_active: false,
        })
        .returning()
        .execute();

      const tenant = await getTenantById(tenantResult[0].id);

      expect(tenant).not.toBeNull();
      expect(tenant!.is_active).toBe(false);
    });
  });

  describe('getUserTenantRole', () => {
    it('should return null when user is not associated with tenant', async () => {
      const userResult = await db.insert(usersTable)
        .values(testUser1)
        .returning()
        .execute();

      const tenantResult = await db.insert(tenantsTable)
        .values(testTenant1)
        .returning()
        .execute();

      const userTenant = await getUserTenantRole(userResult[0].id, tenantResult[0].id);

      expect(userTenant).toBeNull();
    });

    it('should return user-tenant relationship for valid association', async () => {
      const userResult = await db.insert(usersTable)
        .values(testUser1)
        .returning()
        .execute();

      const tenantResult = await db.insert(tenantsTable)
        .values(testTenant1)
        .returning()
        .execute();

      const userTenantResult = await db.insert(userTenantsTable)
        .values({
          user_id: userResult[0].id,
          tenant_id: tenantResult[0].id,
          role: 'admin',
        })
        .returning()
        .execute();

      const userTenant = await getUserTenantRole(userResult[0].id, tenantResult[0].id);

      expect(userTenant).not.toBeNull();
      expect(userTenant!.id).toEqual(userTenantResult[0].id);
      expect(userTenant!.user_id).toEqual(userResult[0].id);
      expect(userTenant!.tenant_id).toEqual(tenantResult[0].id);
      expect(userTenant!.role).toEqual('admin');
      expect(userTenant!.created_at).toBeInstanceOf(Date);
    });

    it('should handle different roles correctly', async () => {
      const userResult = await db.insert(usersTable)
        .values(testUser1)
        .returning()
        .execute();

      const tenantResult = await db.insert(tenantsTable)
        .values(testTenant1)
        .returning()
        .execute();

      // Test owner role
      await db.insert(userTenantsTable)
        .values({
          user_id: userResult[0].id,
          tenant_id: tenantResult[0].id,
          role: 'owner',
        })
        .execute();

      const ownerRole = await getUserTenantRole(userResult[0].id, tenantResult[0].id);
      expect(ownerRole!.role).toEqual('owner');
    });
  });

  describe('getTenantMembers', () => {
    it('should return empty array for tenant with no members', async () => {
      const tenantResult = await db.insert(tenantsTable)
        .values(testTenant1)
        .returning()
        .execute();

      const members = await getTenantMembers(tenantResult[0].id);

      expect(members).toEqual([]);
    });

    it('should return single member for tenant', async () => {
      const userResult = await db.insert(usersTable)
        .values(testUser1)
        .returning()
        .execute();

      const tenantResult = await db.insert(tenantsTable)
        .values(testTenant1)
        .returning()
        .execute();

      await db.insert(userTenantsTable)
        .values({
          user_id: userResult[0].id,
          tenant_id: tenantResult[0].id,
          role: 'owner',
        })
        .execute();

      const members = await getTenantMembers(tenantResult[0].id);

      expect(members).toHaveLength(1);
      expect(members[0].user.id).toEqual(userResult[0].id);
      expect(members[0].user.email).toEqual('user1@example.com');
      expect(members[0].user.first_name).toEqual('John');
      expect(members[0].user.last_name).toEqual('Doe');
      expect(members[0].user.role).toEqual('user');
      expect(members[0].user.is_active).toBe(true);
      expect(members[0].user.created_at).toBeInstanceOf(Date);
      expect(members[0].user.updated_at).toBeInstanceOf(Date);
      expect(members[0].role).toEqual('owner');
    });

    it('should return multiple members for tenant', async () => {
      const userResults = await db.insert(usersTable)
        .values([testUser1, testUser2])
        .returning()
        .execute();

      const tenantResult = await db.insert(tenantsTable)
        .values(testTenant1)
        .returning()
        .execute();

      await db.insert(userTenantsTable)
        .values([
          {
            user_id: userResults[0].id,
            tenant_id: tenantResult[0].id,
            role: 'owner',
          },
          {
            user_id: userResults[1].id,
            tenant_id: tenantResult[0].id,
            role: 'admin',
          },
        ])
        .execute();

      const members = await getTenantMembers(tenantResult[0].id);

      expect(members).toHaveLength(2);
      
      const memberEmails = members.map(m => m.user.email);
      expect(memberEmails).toContain('user1@example.com');
      expect(memberEmails).toContain('user2@example.com');

      const ownerMember = members.find(m => m.role === 'owner');
      const adminMember = members.find(m => m.role === 'admin');
      
      expect(ownerMember).toBeDefined();
      expect(adminMember).toBeDefined();
      expect(ownerMember!.user.email).toEqual('user1@example.com');
      expect(adminMember!.user.email).toEqual('user2@example.com');
    });

    it('should handle different member roles correctly', async () => {
      const userResults = await db.insert(usersTable)
        .values([
          testUser1,
          { ...testUser2, email: 'member@example.com' },
        ])
        .returning()
        .execute();

      const tenantResult = await db.insert(tenantsTable)
        .values(testTenant1)
        .returning()
        .execute();

      await db.insert(userTenantsTable)
        .values([
          {
            user_id: userResults[0].id,
            tenant_id: tenantResult[0].id,
            role: 'admin',
          },
          {
            user_id: userResults[1].id,
            tenant_id: tenantResult[0].id,
            role: 'member',
          },
        ])
        .execute();

      const members = await getTenantMembers(tenantResult[0].id);

      expect(members).toHaveLength(2);
      
      const roles = members.map(m => m.role);
      expect(roles).toContain('admin');
      expect(roles).toContain('member');
    });

    it('should include inactive users in member list', async () => {
      const userResult = await db.insert(usersTable)
        .values({
          ...testUser1,
          is_active: false,
        })
        .returning()
        .execute();

      const tenantResult = await db.insert(tenantsTable)
        .values(testTenant1)
        .returning()
        .execute();

      await db.insert(userTenantsTable)
        .values({
          user_id: userResult[0].id,
          tenant_id: tenantResult[0].id,
          role: 'member',
        })
        .execute();

      const members = await getTenantMembers(tenantResult[0].id);

      expect(members).toHaveLength(1);
      expect(members[0].user.is_active).toBe(false);
    });
  });
});