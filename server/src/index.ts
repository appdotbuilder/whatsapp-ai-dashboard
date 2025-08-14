import { initTRPC } from '@trpc/server';
import { createHTTPServer } from '@trpc/server/adapters/standalone';
import 'dotenv/config';
import cors from 'cors';
import superjson from 'superjson';
import { z } from 'zod';

// Import schemas
import {
  registerInputSchema,
  loginInputSchema,
  resetPasswordInputSchema,
  createWhatsappConnectionInputSchema,
  updateWhatsappConnectionInputSchema,
  createAIProviderInputSchema,
  updateAIProviderInputSchema,
  createKnowledgeBaseDocumentInputSchema,
  updateKnowledgeBaseDocumentInputSchema,
  createBotConfigurationInputSchema,
  updateBotConfigurationInputSchema,
  updateUserProfileInputSchema,
  getMessagesInputSchema,
  getUsageStatisticsInputSchema,
} from './schema';

// Import handlers
import { register, login, resetPassword, verifyToken } from './handlers/auth';
import { getTenantsByUser, getTenantById, getUserTenantRole, getTenantMembers } from './handlers/tenants';
import {
  createWhatsappConnection,
  getWhatsappConnections,
  getWhatsappConnectionById,
  updateWhatsappConnection,
  deleteWhatsappConnection,
  generateQRCode,
} from './handlers/whatsapp_connections';
import {
  createAIProvider,
  getAIProviders,
  getAIProviderById,
  updateAIProvider,
  deleteAIProvider,
  testAIProvider,
} from './handlers/ai_providers';
import {
  createKnowledgeBaseDocument,
  getKnowledgeBaseDocuments,
  getKnowledgeBaseDocumentById,
  updateKnowledgeBaseDocument,
  deleteKnowledgeBaseDocument,
  uploadKnowledgeBaseDocument,
  processDocumentEmbeddings,
} from './handlers/knowledge_base';
import {
  createBotConfiguration,
  getBotConfiguration,
  updateBotConfiguration,
  testBotConfiguration,
} from './handlers/bot_configuration';
import {
  getMessages,
  getMessageById,
  getRealtimeMessages,
  getMessageStats,
  sendMessage,
} from './handlers/messages';
import {
  getDashboardOverview,
  getConnectionStatus,
  getAIProviderStatus,
} from './handlers/dashboard';
import {
  getUserProfile,
  updateUserProfile,
  changePassword,
  deleteUserAccount,
} from './handlers/user_profile';
import {
  getAllUsers,
  getAllTenants,
  getUsersWithStats,
  getSystemUsageStatistics,
  toggleUserStatus,
  toggleTenantStatus,
  getTenantUsage,
} from './handlers/admin';
import {
  getUsageStatistics,
  recordDailyUsage,
  getCurrentUsage,
  generateUsageReport,
} from './handlers/usage_statistics';

const t = initTRPC.create({
  transformer: superjson,
});

const publicProcedure = t.procedure;
const router = t.router;

const appRouter = router({
  // Health check
  healthcheck: publicProcedure.query(() => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }),

  // Authentication routes
  auth: router({
    register: publicProcedure
      .input(registerInputSchema)
      .mutation(({ input }) => register(input)),
    login: publicProcedure
      .input(loginInputSchema)
      .mutation(({ input }) => login(input)),
    resetPassword: publicProcedure
      .input(resetPasswordInputSchema)
      .mutation(({ input }) => resetPassword(input)),
    verifyToken: publicProcedure
      .input(z.string())
      .query(({ input }) => verifyToken(input)),
  }),

  // Tenant management routes
  tenants: router({
    getUserTenants: publicProcedure
      .input(z.number())
      .query(({ input }) => getTenantsByUser(input)),
    getById: publicProcedure
      .input(z.number())
      .query(({ input }) => getTenantById(input)),
    getUserRole: publicProcedure
      .input(z.object({ userId: z.number(), tenantId: z.number() }))
      .query(({ input }) => getUserTenantRole(input.userId, input.tenantId)),
    getMembers: publicProcedure
      .input(z.number())
      .query(({ input }) => getTenantMembers(input)),
  }),

  // WhatsApp connection routes
  whatsapp: router({
    create: publicProcedure
      .input(createWhatsappConnectionInputSchema)
      .mutation(({ input }) => createWhatsappConnection(input)),
    getConnections: publicProcedure
      .input(z.number())
      .query(({ input }) => getWhatsappConnections(input)),
    getById: publicProcedure
      .input(z.number())
      .query(({ input }) => getWhatsappConnectionById(input)),
    update: publicProcedure
      .input(updateWhatsappConnectionInputSchema)
      .mutation(({ input }) => updateWhatsappConnection(input)),
    delete: publicProcedure
      .input(z.number())
      .mutation(({ input }) => deleteWhatsappConnection(input)),
    generateQR: publicProcedure
      .input(z.number())
      .mutation(({ input }) => generateQRCode(input)),
  }),

  // AI provider routes
  aiProviders: router({
    create: publicProcedure
      .input(createAIProviderInputSchema)
      .mutation(({ input }) => createAIProvider(input)),
    getProviders: publicProcedure
      .input(z.number())
      .query(({ input }) => getAIProviders(input)),
    getById: publicProcedure
      .input(z.number())
      .query(({ input }) => getAIProviderById(input)),
    update: publicProcedure
      .input(updateAIProviderInputSchema)
      .mutation(({ input }) => updateAIProvider(input)),
    delete: publicProcedure
      .input(z.number())
      .mutation(({ input }) => deleteAIProvider(input)),
    test: publicProcedure
      .input(z.number())
      .mutation(({ input }) => testAIProvider(input)),
  }),

  // Knowledge base routes
  knowledgeBase: router({
    create: publicProcedure
      .input(createKnowledgeBaseDocumentInputSchema)
      .mutation(({ input }) => createKnowledgeBaseDocument(input)),
    getDocuments: publicProcedure
      .input(z.number())
      .query(({ input }) => getKnowledgeBaseDocuments(input)),
    getById: publicProcedure
      .input(z.number())
      .query(({ input }) => getKnowledgeBaseDocumentById(input)),
    update: publicProcedure
      .input(updateKnowledgeBaseDocumentInputSchema)
      .mutation(({ input }) => updateKnowledgeBaseDocument(input)),
    delete: publicProcedure
      .input(z.number())
      .mutation(({ input }) => deleteKnowledgeBaseDocument(input)),
    upload: publicProcedure
      .input(z.object({
        tenantId: z.number(),
        file: z.object({
          name: z.string(),
          content: z.string(),
          type: z.string(),
          size: z.number(),
        }),
      }))
      .mutation(({ input }) => uploadKnowledgeBaseDocument(input.tenantId, input.file)),
    processEmbeddings: publicProcedure
      .input(z.number())
      .mutation(({ input }) => processDocumentEmbeddings(input)),
  }),

  // Bot configuration routes
  botConfig: router({
    create: publicProcedure
      .input(createBotConfigurationInputSchema)
      .mutation(({ input }) => createBotConfiguration(input)),
    get: publicProcedure
      .input(z.number())
      .query(({ input }) => getBotConfiguration(input)),
    update: publicProcedure
      .input(updateBotConfigurationInputSchema)
      .mutation(({ input }) => updateBotConfiguration(input)),
    test: publicProcedure
      .input(z.object({ tenantId: z.number(), testMessage: z.string() }))
      .mutation(({ input }) => testBotConfiguration(input.tenantId, input.testMessage)),
  }),

  // Message routes
  messages: router({
    getMessages: publicProcedure
      .input(getMessagesInputSchema)
      .query(({ input }) => getMessages(input)),
    getById: publicProcedure
      .input(z.number())
      .query(({ input }) => getMessageById(input)),
    getRealtime: publicProcedure
      .input(z.number())
      .query(({ input }) => getRealtimeMessages(input)),
    getStats: publicProcedure
      .input(z.object({ tenantId: z.number(), days: z.number().optional() }))
      .query(({ input }) => getMessageStats(input.tenantId, input.days)),
    send: publicProcedure
      .input(z.object({
        tenantId: z.number(),
        connectionId: z.number(),
        recipientPhone: z.string(),
        content: z.string(),
      }))
      .mutation(({ input }) => sendMessage(input.tenantId, input.connectionId, input.recipientPhone, input.content)),
  }),

  // Dashboard routes
  dashboard: router({
    getOverview: publicProcedure
      .input(z.number())
      .query(({ input }) => getDashboardOverview(input)),
    getConnectionStatus: publicProcedure
      .input(z.number())
      .query(({ input }) => getConnectionStatus(input)),
    getAIProviderStatus: publicProcedure
      .input(z.number())
      .query(({ input }) => getAIProviderStatus(input)),
  }),

  // User profile routes
  userProfile: router({
    get: publicProcedure
      .input(z.number())
      .query(({ input }) => getUserProfile(input)),
    update: publicProcedure
      .input(updateUserProfileInputSchema)
      .mutation(({ input }) => updateUserProfile(input)),
    changePassword: publicProcedure
      .input(z.object({
        userId: z.number(),
        currentPassword: z.string(),
        newPassword: z.string(),
      }))
      .mutation(({ input }) => changePassword(input.userId, input.currentPassword, input.newPassword)),
    delete: publicProcedure
      .input(z.number())
      .mutation(({ input }) => deleteUserAccount(input)),
  }),

  // Admin routes
  admin: router({
    getAllUsers: publicProcedure
      .query(() => getAllUsers()),
    getAllTenants: publicProcedure
      .query(() => getAllTenants()),
    getUsersWithStats: publicProcedure
      .query(() => getUsersWithStats()),
    getSystemUsage: publicProcedure
      .input(getUsageStatisticsInputSchema.optional())
      .query(({ input }) => getSystemUsageStatistics(input)),
    toggleUserStatus: publicProcedure
      .input(z.object({ userId: z.number(), isActive: z.boolean() }))
      .mutation(({ input }) => toggleUserStatus(input.userId, input.isActive)),
    toggleTenantStatus: publicProcedure
      .input(z.object({ tenantId: z.number(), isActive: z.boolean() }))
      .mutation(({ input }) => toggleTenantStatus(input.tenantId, input.isActive)),
    getTenantUsage: publicProcedure
      .input(z.number())
      .query(({ input }) => getTenantUsage(input)),
  }),

  // Usage statistics routes
  usage: router({
    getStatistics: publicProcedure
      .input(getUsageStatisticsInputSchema)
      .query(({ input }) => getUsageStatistics(input)),
    recordDaily: publicProcedure
      .input(z.object({ tenantId: z.number(), date: z.coerce.date() }))
      .mutation(({ input }) => recordDailyUsage(input.tenantId, input.date)),
    getCurrent: publicProcedure
      .input(z.number())
      .query(({ input }) => getCurrentUsage(input)),
    generateReport: publicProcedure
      .input(z.object({
        tenantId: z.number(),
        startDate: z.coerce.date(),
        endDate: z.coerce.date(),
      }))
      .query(({ input }) => generateUsageReport(input.tenantId, input.startDate, input.endDate)),
  }),
});

export type AppRouter = typeof appRouter;

async function start() {
  const port = process.env['SERVER_PORT'] || 2022;
  const server = createHTTPServer({
    middleware: (req, res, next) => {
      cors()(req, res, next);
    },
    router: appRouter,
    createContext() {
      return {};
    },
  });
  server.listen(port);
  console.log(`TRPC server listening at port: ${port}`);
}

start();