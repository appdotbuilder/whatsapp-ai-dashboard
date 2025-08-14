import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, tenantsTable, userTenantsTable } from '../db/schema';
import { type UpdateUserProfileInput } from '../schema';
import { getUserProfile, updateUserProfile, changePassword, deleteUserAccount } from '../handlers/user_profile';
import { eq } from 'drizzle-orm';

describe('User Profile Handlers', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  describe('getUserProfile', () => {
    it('should get user profile by ID', async () => {
      // Create test user
      const testUser = await db.insert(usersTable)
        .values({
          email: 'test@example.com',
          password_hash: 'hashed_password',
          first_name: 'John',
          last_name: 'Doe',
          role: 'user',
          is_active: true
        })
        .returning()
        .execute();

      const result = await getUserProfile(testUser[0].id);

      expect(result).not.toBeNull();
      expect(result!.id).toEqual(testUser[0].id);
      expect(result!.email).toEqual('test@example.com');
      expect(result!.first_name).toEqual('John');
      expect(result!.last_name).toEqual('Doe');
      expect(result!.role).toEqual('user');
      expect(result!.is_active).toEqual(true);
      expect(result!.created_at).toBeInstanceOf(Date);
      expect(result!.updated_at).toBeInstanceOf(Date);
    });

    it('should return null for non-existent user', async () => {
      const result = await getUserProfile(999);
      expect(result).toBeNull();
    });

    it('should include password hash in result', async () => {
      const testUser = await db.insert(usersTable)
        .values({
          email: 'test@example.com',
          password_hash: 'hashed_password',
          first_name: 'John',
          last_name: 'Doe'
        })
        .returning()
        .execute();

      const result = await getUserProfile(testUser[0].id);

      expect(result!.password_hash).toEqual('hashed_password');
    });
  });

  describe('updateUserProfile', () => {
    it('should update user profile with all fields', async () => {
      // Create test user
      const testUser = await db.insert(usersTable)
        .values({
          email: 'original@example.com',
          password_hash: 'hashed_password',
          first_name: 'Original',
          last_name: 'Name',
          role: 'user',
          is_active: true
        })
        .returning()
        .execute();

      const updateInput: UpdateUserProfileInput = {
        id: testUser[0].id,
        email: 'updated@example.com',
        first_name: 'Updated',
        last_name: 'User'
      };

      const result = await updateUserProfile(updateInput);

      expect(result.id).toEqual(testUser[0].id);
      expect(result.email).toEqual('updated@example.com');
      expect(result.first_name).toEqual('Updated');
      expect(result.last_name).toEqual('User');
      expect(result.updated_at > testUser[0].updated_at).toBe(true);
    });

    it('should update user profile with partial fields', async () => {
      const testUser = await db.insert(usersTable)
        .values({
          email: 'test@example.com',
          password_hash: 'hashed_password',
          first_name: 'John',
          last_name: 'Doe'
        })
        .returning()
        .execute();

      const updateInput: UpdateUserProfileInput = {
        id: testUser[0].id,
        first_name: 'UpdatedFirst'
      };

      const result = await updateUserProfile(updateInput);

      expect(result.first_name).toEqual('UpdatedFirst');
      expect(result.last_name).toEqual('Doe'); // Should remain unchanged
      expect(result.email).toEqual('test@example.com'); // Should remain unchanged
    });

    it('should save updated profile to database', async () => {
      const testUser = await db.insert(usersTable)
        .values({
          email: 'test@example.com',
          password_hash: 'hashed_password',
          first_name: 'John',
          last_name: 'Doe'
        })
        .returning()
        .execute();

      const updateInput: UpdateUserProfileInput = {
        id: testUser[0].id,
        email: 'updated@example.com',
        first_name: 'Updated'
      };

      await updateUserProfile(updateInput);

      // Verify changes were saved
      const updatedUser = await db.select()
        .from(usersTable)
        .where(eq(usersTable.id, testUser[0].id))
        .execute();

      expect(updatedUser[0].email).toEqual('updated@example.com');
      expect(updatedUser[0].first_name).toEqual('Updated');
    });

    it('should throw error for non-existent user', async () => {
      const updateInput: UpdateUserProfileInput = {
        id: 999,
        first_name: 'Test'
      };

      await expect(updateUserProfile(updateInput)).rejects.toThrow(/user not found/i);
    });

    it('should throw error for duplicate email', async () => {
      // Create two users
      const user1 = await db.insert(usersTable)
        .values({
          email: 'user1@example.com',
          password_hash: 'hash1',
          first_name: 'User',
          last_name: 'One'
        })
        .returning()
        .execute();

      await db.insert(usersTable)
        .values({
          email: 'user2@example.com',
          password_hash: 'hash2',
          first_name: 'User',
          last_name: 'Two'
        })
        .execute();

      // Try to update user1's email to user2's email
      const updateInput: UpdateUserProfileInput = {
        id: user1[0].id,
        email: 'user2@example.com'
      };

      await expect(updateUserProfile(updateInput)).rejects.toThrow(/email already exists/i);
    });

    it('should allow updating to same email', async () => {
      const testUser = await db.insert(usersTable)
        .values({
          email: 'test@example.com',
          password_hash: 'hashed_password',
          first_name: 'John',
          last_name: 'Doe'
        })
        .returning()
        .execute();

      const updateInput: UpdateUserProfileInput = {
        id: testUser[0].id,
        email: 'test@example.com', // Same email
        first_name: 'Updated'
      };

      const result = await updateUserProfile(updateInput);
      
      expect(result.email).toEqual('test@example.com');
      expect(result.first_name).toEqual('Updated');
    });
  });

  describe('changePassword', () => {
    it('should change password successfully with correct current password', async () => {
      const testUser = await db.insert(usersTable)
        .values({
          email: 'test@example.com',
          password_hash: 'old_hash',
          first_name: 'John',
          last_name: 'Doe'
        })
        .returning()
        .execute();

      const result = await changePassword(
        testUser[0].id,
        'correct_current_password',
        'new_password'
      );

      expect(result.success).toBe(true);
      expect(result.message).toEqual('Password changed successfully');

      // Verify password was updated in database
      const updatedUser = await db.select()
        .from(usersTable)
        .where(eq(usersTable.id, testUser[0].id))
        .execute();

      expect(updatedUser[0].password_hash).toEqual('hashed_new_password');
    });

    it('should fail with incorrect current password', async () => {
      const testUser = await db.insert(usersTable)
        .values({
          email: 'test@example.com',
          password_hash: 'old_hash',
          first_name: 'John',
          last_name: 'Doe'
        })
        .returning()
        .execute();

      const result = await changePassword(
        testUser[0].id,
        'wrong_password',
        'new_password'
      );

      expect(result.success).toBe(false);
      expect(result.message).toEqual('Current password is incorrect');
    });

    it('should fail for non-existent user', async () => {
      const result = await changePassword(
        999,
        'correct_current_password',
        'new_password'
      );

      expect(result.success).toBe(false);
      expect(result.message).toEqual('User not found');
    });

    it('should update updated_at timestamp', async () => {
      const testUser = await db.insert(usersTable)
        .values({
          email: 'test@example.com',
          password_hash: 'old_hash',
          first_name: 'John',
          last_name: 'Doe'
        })
        .returning()
        .execute();

      const originalUpdatedAt = testUser[0].updated_at;

      await changePassword(
        testUser[0].id,
        'correct_current_password',
        'new_password'
      );

      const updatedUser = await db.select()
        .from(usersTable)
        .where(eq(usersTable.id, testUser[0].id))
        .execute();

      expect(updatedUser[0].updated_at > originalUpdatedAt).toBe(true);
    });
  });

  describe('deleteUserAccount', () => {
    it('should delete user account successfully', async () => {
      const testUser = await db.insert(usersTable)
        .values({
          email: 'test@example.com',
          password_hash: 'hashed_password',
          first_name: 'John',
          last_name: 'Doe'
        })
        .returning()
        .execute();

      const result = await deleteUserAccount(testUser[0].id);

      expect(result.success).toBe(true);

      // Verify user was deleted
      const deletedUser = await db.select()
        .from(usersTable)
        .where(eq(usersTable.id, testUser[0].id))
        .execute();

      expect(deletedUser).toHaveLength(0);
    });

    it('should throw error for non-existent user', async () => {
      await expect(deleteUserAccount(999)).rejects.toThrow(/user not found/i);
    });

    it('should prevent deletion if user owns tenants', async () => {
      // Create test user and tenant
      const testUser = await db.insert(usersTable)
        .values({
          email: 'owner@example.com',
          password_hash: 'hashed_password',
          first_name: 'Owner',
          last_name: 'User'
        })
        .returning()
        .execute();

      const testTenant = await db.insert(tenantsTable)
        .values({
          name: 'Test Tenant',
          slug: 'test-tenant',
          plan: 'free'
        })
        .returning()
        .execute();

      // Make user an owner of the tenant
      await db.insert(userTenantsTable)
        .values({
          user_id: testUser[0].id,
          tenant_id: testTenant[0].id,
          role: 'owner'
        })
        .execute();

      await expect(deleteUserAccount(testUser[0].id))
        .rejects.toThrow(/cannot delete user.*owner.*tenant/i);
    });

    it('should allow deletion if user is not an owner', async () => {
      // Create test users and tenant
      const testUser = await db.insert(usersTable)
        .values({
          email: 'member@example.com',
          password_hash: 'hashed_password',
          first_name: 'Member',
          last_name: 'User'
        })
        .returning()
        .execute();

      const ownerUser = await db.insert(usersTable)
        .values({
          email: 'owner@example.com',
          password_hash: 'hashed_password',
          first_name: 'Owner',
          last_name: 'User'
        })
        .returning()
        .execute();

      const testTenant = await db.insert(tenantsTable)
        .values({
          name: 'Test Tenant',
          slug: 'test-tenant',
          plan: 'free'
        })
        .returning()
        .execute();

      // Make one user owner and another a member
      await db.insert(userTenantsTable)
        .values({
          user_id: ownerUser[0].id,
          tenant_id: testTenant[0].id,
          role: 'owner'
        })
        .execute();

      await db.insert(userTenantsTable)
        .values({
          user_id: testUser[0].id,
          tenant_id: testTenant[0].id,
          role: 'member'
        })
        .execute();

      const result = await deleteUserAccount(testUser[0].id);

      expect(result.success).toBe(true);

      // Verify user was deleted
      const deletedUser = await db.select()
        .from(usersTable)
        .where(eq(usersTable.id, testUser[0].id))
        .execute();

      expect(deletedUser).toHaveLength(0);

      // Verify user-tenant relationship was also deleted (cascade)
      const deletedRelation = await db.select()
        .from(userTenantsTable)
        .where(eq(userTenantsTable.user_id, testUser[0].id))
        .execute();

      expect(deletedRelation).toHaveLength(0);
    });
  });
});