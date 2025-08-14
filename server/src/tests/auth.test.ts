import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, tenantsTable, userTenantsTable } from '../db/schema';
import { type RegisterInput, type LoginInput, type ResetPasswordInput } from '../schema';
import { register, login, resetPassword, verifyToken } from '../handlers/auth';
import { eq } from 'drizzle-orm';
import { createHash, timingSafeEqual } from 'crypto';

const JWT_SECRET = process.env['JWT_SECRET'] || 'your-secret-key';

// Simple JWT parser for tests
function parseJWT(token: string): any {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid JWT format');
  }
  return JSON.parse(Buffer.from(parts[1], 'base64url').toString());
}

// Simple JWT creator for tests
function createTestJWT(payload: any, secret: string, expiresIn?: number): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  
  const now = Math.floor(Date.now() / 1000);
  const exp = expiresIn ? now + expiresIn : now - 3600; // Default to expired
  
  const jwtPayload = { ...payload, iat: now, exp };

  const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
  const encodedPayload = Buffer.from(JSON.stringify(jwtPayload)).toString('base64url');
  
  const signature = createHash('sha256')
    .update(`${encodedHeader}.${encodedPayload}`)
    .update(secret)
    .digest('base64url');

  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

const testRegisterInput: RegisterInput = {
  email: 'test@example.com',
  password: 'testpassword123',
  first_name: 'John',
  last_name: 'Doe',
  tenant_name: 'Test Company'
};

const testLoginInput: LoginInput = {
  email: 'test@example.com',
  password: 'testpassword123'
};

const testResetPasswordInput: ResetPasswordInput = {
  email: 'test@example.com'
};

describe('register', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should register a new user successfully', async () => {
    const result = await register(testRegisterInput);

    // Verify user fields
    expect(result.user.email).toEqual('test@example.com');
    expect(result.user.first_name).toEqual('John');
    expect(result.user.last_name).toEqual('Doe');
    expect(result.user.role).toEqual('user');
    expect(result.user.is_active).toEqual(true);
    expect(result.user.id).toBeDefined();
    expect(result.user.created_at).toBeInstanceOf(Date);
    expect(result.user.updated_at).toBeInstanceOf(Date);

    // Verify password is hashed (not the original password)
    expect(result.user.password_hash).not.toEqual('testpassword123');
    expect(result.user.password_hash.length).toBeGreaterThan(0);
    expect(result.user.password_hash).toContain(':'); // Our format includes salt:hash

    // Verify JWT token is provided
    expect(result.token).toBeDefined();
    expect(typeof result.token).toBe('string');
    expect(result.token.length).toBeGreaterThan(0);
  });

  it('should save user to database correctly', async () => {
    const result = await register(testRegisterInput);

    const users = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, result.user.id))
      .execute();

    expect(users).toHaveLength(1);
    expect(users[0].email).toEqual('test@example.com');
    expect(users[0].first_name).toEqual('John');
    expect(users[0].last_name).toEqual('Doe');
    expect(users[0].is_active).toEqual(true);
  });

  it('should create tenant and link user as owner', async () => {
    const result = await register(testRegisterInput);

    // Check tenant was created
    const tenants = await db.select()
      .from(tenantsTable)
      .execute();

    expect(tenants).toHaveLength(1);
    expect(tenants[0].name).toEqual('Test Company');
    expect(tenants[0].slug).toEqual('test-company');
    expect(tenants[0].plan).toEqual('free');
    expect(tenants[0].is_active).toEqual(true);

    // Check user-tenant relationship
    const userTenants = await db.select()
      .from(userTenantsTable)
      .where(eq(userTenantsTable.user_id, result.user.id))
      .execute();

    expect(userTenants).toHaveLength(1);
    expect(userTenants[0].tenant_id).toEqual(tenants[0].id);
    expect(userTenants[0].role).toEqual('owner');
  });

  it('should generate valid JWT token', async () => {
    const result = await register(testRegisterInput);

    const decoded = parseJWT(result.token);
    expect(decoded.userId).toEqual(result.user.id);
    expect(decoded.email).toEqual(result.user.email);
    expect(decoded.exp).toBeGreaterThan(Date.now() / 1000);
  });

  it('should reject duplicate email registration', async () => {
    await register(testRegisterInput);

    expect(() => register(testRegisterInput)).toThrow(/already exists/i);
  });

  it('should create tenant slug correctly from various names', async () => {
    const testCases = [
      { name: 'My Amazing Company!', expectedSlug: 'my-amazing-company' },
      { name: 'Test & Co.', expectedSlug: 'test-co' },
      { name: '123 Numbers Corp', expectedSlug: '123-numbers-corp' }
    ];

    for (const testCase of testCases) {
      const input = { ...testRegisterInput, email: `test${Date.now()}@example.com`, tenant_name: testCase.name };
      await register(input);

      const tenants = await db.select()
        .from(tenantsTable)
        .execute();

      const createdTenant = tenants.find(t => t.name === testCase.name);
      expect(createdTenant?.slug).toEqual(testCase.expectedSlug);
    }
  });
});

describe('login', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should login successfully with valid credentials', async () => {
    // First register a user
    await register(testRegisterInput);

    const result = await login(testLoginInput);

    expect(result.user.email).toEqual('test@example.com');
    expect(result.user.first_name).toEqual('John');
    expect(result.user.last_name).toEqual('Doe');
    expect(result.token).toBeDefined();
    expect(typeof result.token).toBe('string');
  });

  it('should generate valid JWT token on login', async () => {
    await register(testRegisterInput);
    const result = await login(testLoginInput);

    const decoded = parseJWT(result.token);
    expect(decoded.userId).toEqual(result.user.id);
    expect(decoded.email).toEqual(result.user.email);
  });

  it('should reject login with invalid email', async () => {
    const invalidInput = { ...testLoginInput, email: 'nonexistent@example.com' };

    expect(() => login(invalidInput)).toThrow(/invalid email or password/i);
  });

  it('should reject login with invalid password', async () => {
    await register(testRegisterInput);
    const invalidInput = { ...testLoginInput, password: 'wrongpassword' };

    expect(() => login(invalidInput)).toThrow(/invalid email or password/i);
  });

  it('should reject login for inactive user', async () => {
    const { user } = await register(testRegisterInput);

    // Deactivate user
    await db.update(usersTable)
      .set({ is_active: false })
      .where(eq(usersTable.id, user.id))
      .execute();

    expect(() => login(testLoginInput)).toThrow(/account is deactivated/i);
  });
});

describe('resetPassword', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should return success for existing user', async () => {
    await register(testRegisterInput);

    const result = await resetPassword(testResetPasswordInput);

    expect(result.success).toBe(true);
    expect(result.message).toEqual('Password reset email sent successfully');
  });

  it('should return success for non-existing user (security)', async () => {
    const result = await resetPassword({ email: 'nonexistent@example.com' });

    expect(result.success).toBe(true);
    expect(result.message).toContain('If an account with that email exists');
  });

  it('should return success for inactive user (security)', async () => {
    const { user } = await register(testRegisterInput);

    // Deactivate user
    await db.update(usersTable)
      .set({ is_active: false })
      .where(eq(usersTable.id, user.id))
      .execute();

    const result = await resetPassword(testResetPasswordInput);

    expect(result.success).toBe(true);
    expect(result.message).toContain('If an account with that email exists');
  });
});

describe('verifyToken', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should verify valid token and return user', async () => {
    const { user, token } = await register(testRegisterInput);

    const verifiedUser = await verifyToken(token);

    expect(verifiedUser).not.toBeNull();
    expect(verifiedUser!.id).toEqual(user.id);
    expect(verifiedUser!.email).toEqual(user.email);
  });

  it('should return null for invalid token', async () => {
    const invalidToken = 'invalid.jwt.token';

    const result = await verifyToken(invalidToken);

    expect(result).toBeNull();
  });

  it('should return null for expired token', async () => {
    const { user } = await register(testRegisterInput);

    // Create an expired token
    const expiredToken = createTestJWT(
      { userId: user.id, email: user.email },
      JWT_SECRET
      // No expiresIn provided, defaults to expired
    );

    const result = await verifyToken(expiredToken);

    expect(result).toBeNull();
  });

  it('should return null for inactive user even with valid token', async () => {
    const { user, token } = await register(testRegisterInput);

    // Deactivate user
    await db.update(usersTable)
      .set({ is_active: false })
      .where(eq(usersTable.id, user.id))
      .execute();

    const result = await verifyToken(token);

    expect(result).toBeNull();
  });

  it('should return null for token with non-existent user', async () => {
    // Create token with non-existent user ID
    const fakeToken = createTestJWT(
      { userId: 999999, email: 'fake@example.com' },
      JWT_SECRET,
      3600 // Valid for 1 hour
    );

    const result = await verifyToken(fakeToken);

    expect(result).toBeNull();
  });
});