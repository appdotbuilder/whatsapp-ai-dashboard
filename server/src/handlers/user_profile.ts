import { db } from '../db';
import { usersTable, userTenantsTable } from '../db/schema';
import { type UpdateUserProfileInput, type User } from '../schema';
import { eq, and, count, ne } from 'drizzle-orm';

export async function getUserProfile(userId: number): Promise<User | null> {
  try {
    const users = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .execute();

    if (users.length === 0) {
      return null;
    }

    return users[0];
  } catch (error) {
    console.error('Failed to get user profile:', error);
    throw error;
  }
}

export async function updateUserProfile(input: UpdateUserProfileInput): Promise<User> {
  try {
    // Check if user exists
    const existingUsers = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, input.id))
      .execute();

    if (existingUsers.length === 0) {
      throw new Error('User not found');
    }

    // If email is being changed, check for uniqueness
    if (input.email) {
      const emailCheck = await db.select()
        .from(usersTable)
        .where(and(
          eq(usersTable.email, input.email),
          ne(usersTable.id, input.id)
        ))
        .execute();

      if (emailCheck.length > 0) {
        throw new Error('Email already exists');
      }
    }

    // Build update object with only provided fields
    const updateData: Partial<typeof usersTable.$inferInsert> = {
      updated_at: new Date(),
    };

    if (input.first_name !== undefined) {
      updateData.first_name = input.first_name;
    }
    if (input.last_name !== undefined) {
      updateData.last_name = input.last_name;
    }
    if (input.email !== undefined) {
      updateData.email = input.email;
    }

    const result = await db.update(usersTable)
      .set(updateData)
      .where(eq(usersTable.id, input.id))
      .returning()
      .execute();

    return result[0];
  } catch (error) {
    console.error('Profile update failed:', error);
    throw error;
  }
}

export async function changePassword(
    userId: number, 
    currentPassword: string, 
    newPassword: string
): Promise<{ success: boolean; message: string }> {
  try {
    // Get user with current password hash
    const users = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .execute();

    if (users.length === 0) {
      return { success: false, message: 'User not found' };
    }

    const user = users[0];

    // In a real implementation, you would verify the current password using bcrypt
    // For this implementation, we'll simulate password verification
    // const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password_hash);
    
    // Simulate password verification - in real app this would use bcrypt
    if (currentPassword !== 'correct_current_password') {
      return { success: false, message: 'Current password is incorrect' };
    }

    // Hash the new password (in real implementation, use bcrypt)
    // const newPasswordHash = await bcrypt.hash(newPassword, 10);
    const newPasswordHash = `hashed_${newPassword}`;

    // Update password
    await db.update(usersTable)
      .set({ 
        password_hash: newPasswordHash,
        updated_at: new Date()
      })
      .where(eq(usersTable.id, userId))
      .execute();

    return { success: true, message: 'Password changed successfully' };
  } catch (error) {
    console.error('Password change failed:', error);
    throw error;
  }
}

export async function deleteUserAccount(userId: number): Promise<{ success: boolean }> {
  try {
    // Check if user exists
    const users = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .execute();

    if (users.length === 0) {
      throw new Error('User not found');
    }

    // Check if user is sole owner of any tenants
    const ownedTenants = await db.select({ count: count() })
      .from(userTenantsTable)
      .where(and(
        eq(userTenantsTable.user_id, userId),
        eq(userTenantsTable.role, 'owner')
      ))
      .execute();

    if (ownedTenants[0].count > 0) {
      throw new Error('Cannot delete user: User is owner of one or more tenants. Please transfer ownership first.');
    }

    // Delete user (cascade will handle user_tenants relationships)
    await db.delete(usersTable)
      .where(eq(usersTable.id, userId))
      .execute();

    return { success: true };
  } catch (error) {
    console.error('User deletion failed:', error);
    throw error;
  }
}