import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from '../../shared/database/prisma-client.js';
import { authMiddleware } from '../auth/auth-middleware.js';
import { requireGrant } from '../rbac/rbac-middleware.js';

const SETTING_KEY = 'finance_state_v1';
const MAX_SUPPLIERS = 100;
const MAX_TRANSACTIONS = 100_000;

type FinanceState = {
  bankBalance: number;
  reserveBalance: number;
  profitBalance: number;
  suppliers: Array<Record<string, unknown>>;
  transactions: Array<Record<string, unknown>>;
};

function normalizeState(value: unknown): FinanceState | null {
  if (!value || typeof value !== 'object') return null;
  const state = value as Record<string, unknown>;
  const balances = ['bankBalance', 'reserveBalance', 'profitBalance'] as const;
  if (balances.some((key) => typeof state[key] !== 'number' || !Number.isFinite(state[key] as number))) return null;
  if (!Array.isArray(state.suppliers) || !Array.isArray(state.transactions)) return null;
  if (state.suppliers.length > MAX_SUPPLIERS || state.transactions.length > MAX_TRANSACTIONS) return null;
  if (state.suppliers.some((item) => !item || typeof item !== 'object')) return null;
  if (state.transactions.some((item) => !item || typeof item !== 'object')) return null;
  return {
    bankBalance: state.bankBalance as number,
    reserveBalance: state.reserveBalance as number,
    profitBalance: state.profitBalance as number,
    suppliers: state.suppliers as Array<Record<string, unknown>>,
    transactions: state.transactions as Array<Record<string, unknown>>,
  };
}

export async function financeRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  app.get('/api/v1/finance/state', { preHandler: requireGrant('finance', 'access') }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { orgId } = request.user!;
    const setting = await prisma.appSetting.findUnique({
      where: { orgId_settingKey: { orgId, settingKey: SETTING_KEY } },
      select: { valuePlain: true, updatedAt: true },
    });
    if (!setting?.valuePlain) return { state: null, updatedAt: null };
    try {
      const state = normalizeState(JSON.parse(setting.valuePlain));
      if (!state) return reply.status(500).send({ error: 'Invalid finance state' });
      return { state, updatedAt: setting.updatedAt.toISOString() };
    } catch {
      return reply.status(500).send({ error: 'Invalid finance state' });
    }
  });

  app.put('/api/v1/finance/state', { preHandler: requireGrant('finance', 'edit') }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { orgId } = request.user!;
    const body = request.body as { state?: unknown } | undefined;
    const state = normalizeState(body?.state);
    if (!state) return reply.status(400).send({ error: 'Invalid finance state' });
    const setting = await prisma.appSetting.upsert({
      where: { orgId_settingKey: { orgId, settingKey: SETTING_KEY } },
      create: { orgId, settingKey: SETTING_KEY, valuePlain: JSON.stringify(state) },
      update: { valuePlain: JSON.stringify(state) },
      select: { updatedAt: true },
    });
    return { ok: true, updatedAt: setting.updatedAt.toISOString() };
  });
}
