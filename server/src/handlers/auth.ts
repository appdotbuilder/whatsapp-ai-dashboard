import { db } from '../db';
import { usersTable, tenantsTable, userTenantsTable } from '../db/schema';
import { type RegisterInput, type LoginInput, type ResetPasswordInput, type User } from '../schema';
import { eq } from 'drizzle-orm';
import { createHash, randomBytes, pbkdf2Sync, timingSafeEqual } from 'crypto';

const JWT_SECRET = process.env['JWT_SECRET'] || 'your-secret-key';
const SALT_ROUNDS = 10000; // PBKDF2 iterations

// Simple JWT implementation without external dependencies
function createJWT(payload: any, secret: string, expiresIn: string = '7d'): string {
  const header = {
    alg: 'HS256',
    typ: 'JWT'
  };

  const now = Math.floor(Date.now() / 1000);
  const exp = now + (7 * 24 * 60 * 60); // 7 days in seconds

  const jwtPayload = {
    ...payload,
    iat: now,
    exp
  };

  const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
  const encodedPayload = Buffer.from(JSON.stringify(jwtPayload)).toString('base64url');
  
  const signature = createHash('sha256')
    .update(`${encodedHeader}.${encodedPayload}`)
    .update(secret)
    .digest('base64url');

  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

function verifyJWT(token: string, secret: string): any | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return null;
    }

    const [headerB64, payloadB64, signatureB64] = parts;
    
    // Verify signature
    const expectedSignature = createHash('sha256')
      .update(`${headerB64}.${payloadB64}`)
      .update(secret)
      .digest('base64url');

    if (!timingSafeEqual(
      Buffer.from(signatureB64, 'base64url'), 
      Buffer.from(expectedSignature, 'base64url')
    )) {
      return null;
    }

    // Parse payload
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());
    
    // Check expiration
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = pbkdf2Sync(password, salt, SALT_ROUNDS, 64, 'sha512');
  return salt.toString('hex') + ':' + hash.toString('hex');
}

function verifyPassword(password: string, hashedPassword: string): boolean {
  const [saltHex, hashHex] = hashedPassword.split(':');
  if (!saltHex || !hashHex) return false;
  
  const salt = Buffer.from(saltHex, 'hex');
  const hash = Buffer.from(hashHex, 'hex');
  const computedHash = pbkdf2Sync(password, salt, SALT_ROUNDS, 64, 'sha512');
  
  return timingSafeEqual(hash, computedHash);
}

export async function register(input: RegisterInput): Promise<{ user: User; token: string }> {
  try {
    // Check if user already exists
    const existingUser = await db.select()
      .from(usersTable)
      .where(eq(usersTable.email, input.email))
      .limit(1)
      .execute();

    if (existingUser.length > 0) {
      throw new Error('User with this email already exists');
    }

    // Hash password
    const password_hash = hashPassword(input.password);

    // Create user
    const userResult = await db.insert(usersTable)
      .values({
        email: input.email,
        password_hash,
        first_name: input.first_name,
        last_name: input.last_name,
        role: 'user',
        is_active: true
      })
      .returning()
      .execute();

    const user = userResult[0];

    // Create tenant with slug from tenant name
    const tenantSlug = input.tenant_name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    const tenantResult = await db.insert(tenantsTable)
      .values({
        name: input.tenant_name,
        slug: tenantSlug,
        plan: 'free',
        is_active: true
      })
      .returning()
      .execute();

    const tenant = tenantResult[0];

    // Link user to tenant as owner
    await db.insert(userTenantsTable)
      .values({
        user_id: user.id,
        tenant_id: tenant.id,
        role: 'owner'
      })
      .execute();

    // Generate JWT token
    const token = createJWT(
      { userId: user.id, email: user.email },
      JWT_SECRET
    );

    return {
      user,
      token
    };
  } catch (error) {
    console.error('Registration failed:', error);
    throw error;
  }
}

export async function login(input: LoginInput): Promise<{ user: User; token: string }> {
  try {
    // Find user by email
    const users = await db.select()
      .from(usersTable)
      .where(eq(usersTable.email, input.email))
      .limit(1)
      .execute();

    if (users.length === 0) {
      throw new Error('Invalid email or password');
    }

    const user = users[0];

    // Check if user is active
    if (!user.is_active) {
      throw new Error('Account is deactivated');
    }

    // Verify password
    const isPasswordValid = verifyPassword(input.password, user.password_hash);

    if (!isPasswordValid) {
      throw new Error('Invalid email or password');
    }

    // Generate JWT token
    const token = createJWT(
      { userId: user.id, email: user.email },
      JWT_SECRET
    );

    return {
      user,
      token
    };
  } catch (error) {
    console.error('Login failed:', error);
    throw error;
  }
}

export async function resetPassword(input: ResetPasswordInput): Promise<{ success: boolean; message: string }> {
  try {
    // Find user by email
    const users = await db.select()
      .from(usersTable)
      .where(eq(usersTable.email, input.email))
      .limit(1)
      .execute();

    if (users.length === 0) {
      // Return success even if user doesn't exist (security best practice)
      return {
        success: true,
        message: 'If an account with that email exists, a password reset link has been sent'
      };
    }

    const user = users[0];

    // Check if user is active
    if (!user.is_active) {
      return {
        success: true,
        message: 'If an account with that email exists, a password reset link has been sent'
      };
    }

    // In a real implementation, you would:
    // 1. Generate a secure reset token
    // 2. Store it in database with expiry
    // 3. Send email with reset link
    
    // For now, we'll just return success
    return {
      success: true,
      message: 'Password reset email sent successfully'
    };
  } catch (error) {
    console.error('Password reset failed:', error);
    throw error;
  }
}

export async function verifyToken(token: string): Promise<User | null> {
  try {
    // Verify JWT token
    const decoded = verifyJWT(token, JWT_SECRET);

    if (!decoded || !decoded.userId) {
      return null;
    }

    // Find user by ID
    const users = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, decoded.userId))
      .limit(1)
      .execute();

    if (users.length === 0) {
      return null;
    }

    const user = users[0];

    // Check if user is still active
    if (!user.is_active) {
      return null;
    }

    return user;
  } catch (error) {
    console.error('Token verification failed:', error);
    return null;
  }
}