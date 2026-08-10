// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
import type { FastifyInstance } from 'fastify';
import { authMiddleware } from '../auth/auth-middleware.js';
import { requireGrant } from '../rbac/rbac-middleware.js';
import {
  createPancakeOrderForConversation, getPancakeLink, retryPancakeGroupRename, getPancakeWarehouses, searchPancakeProducts, syncPancakeOrderByConversation, listPancakeOrders, getPancakeOrderDetail, updatePancakeOrder, PancakeIntegrationError,
} from './pancake-order-service.js';
import {
  getOrders,
  getOrderByConversation,
  createOrder,
  updateOrder,
  deleteOrder,
  getSalaryReport,
  getOrderStats,
} from './orders-controller.js';

export async function ordersRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  // Pancake POS — đơn bán hàng gắn hội thoại nhóm Zalo.
  app.get('/api/v1/orders/pancake/warehouses', async (request, reply) => {
    try { return { warehouses: await getPancakeWarehouses(request.user!) }; }
    catch (error) { if (error instanceof PancakeIntegrationError) return reply.status(error.statusCode).send({ error: error.message, code: error.code }); throw error; }
  });

  app.get<{ Params: { orderCode: string } }>('/api/v1/orders/pancake/detail/:orderCode', async (request, reply) => {
    try { return await getPancakeOrderDetail(request.user!, request.params.orderCode); }
    catch (error) { if (error instanceof PancakeIntegrationError) return reply.status(error.statusCode).send({ error: error.message, code: error.code }); throw error; }
  });
  app.put<{ Params: { orderCode: string }; Body: Record<string, unknown> }>('/api/v1/orders/pancake/detail/:orderCode', async (request, reply) => {
    try { return await updatePancakeOrder(request.user!, request.params.orderCode, request.body ?? {}); }
    catch (error) { if (error instanceof PancakeIntegrationError) return reply.status(error.statusCode).send({ error: error.message, code: error.code }); throw error; }
  });
  app.get<{ Querystring: { search?: string; page?: string; limit?: string; status?: string } }>('/api/v1/orders/pancake/list', async (request, reply) => {
    try { return await listPancakeOrders(request.user!, { search: request.query.search, pageNumber: Number(request.query.page || 1), pageSize: Number(request.query.limit || 100), status: request.query.status }); }
    catch (error) { if (error instanceof PancakeIntegrationError) return reply.status(error.statusCode).send({ error: error.message, code: error.code }); throw error; }
  });
  app.get<{ Querystring: { search?: string; page?: string; limit?: string } }>('/api/v1/orders/pancake/products', async (request, reply) => {
    try { return await searchPancakeProducts(request.user!, request.query.search || '', Number(request.query.page || 1), Number(request.query.limit || 30)); }
    catch (error) { if (error instanceof PancakeIntegrationError) return reply.status(error.statusCode).send({ error: error.message, code: error.code }); throw error; }
  });

  app.get<{ Params: { conversationId: string } }>('/api/v1/orders/pancake/sync-by-conversation/:conversationId', async (request, reply) => {
    try { return await syncPancakeOrderByConversation(request.params.conversationId, request.user!); }
    catch (error) { if (error instanceof PancakeIntegrationError) return reply.status(error.statusCode).send({ error: error.message, code: error.code }); throw error; }
  });
  app.get<{ Params: { conversationId: string } }>('/api/v1/orders/pancake/by-conversation/:conversationId', async (request) => {
    const link = await getPancakeLink(request.params.conversationId, request.user!.orgId);
    return { link };
  });

  app.post<{ Params: { conversationId: string }; Body: Record<string, unknown> }>('/api/v1/orders/pancake/from-conversation/:conversationId', async (request, reply) => {
    try {
      const result = await createPancakeOrderForConversation(request.params.conversationId, request.user!, request.body ?? {});
      return reply.status(result.alreadyExisted ? 200 : 201).send(result);
    } catch (error) {
      if (error instanceof PancakeIntegrationError) return reply.status(error.statusCode).send({ error: error.message, code: error.code });
      request.log.error({ err: error }, 'create Pancake order failed');
      return reply.status(500).send({ error: 'Tạo đơn Pancake thất bại' });
    }
  });

  app.post<{ Params: { conversationId: string } }>('/api/v1/orders/pancake/from-conversation/:conversationId/retry-rename', async (request, reply) => {
    try {
      const link = await retryPancakeGroupRename(request.params.conversationId, request.user!);
      return { link, renameSucceeded: true };
    } catch (error) {
      if (error instanceof PancakeIntegrationError) return reply.status(error.statusCode).send({ error: error.message, code: error.code });
      request.log.error({ err: error }, 'retry Pancake group rename failed');
      return reply.status(500).send({ error: 'Không đổi được tên nhóm Zalo' });
    }
  });
  // Quản lý đơn hàng
  app.get('/api/v1/orders', { preHandler: requireGrant('orders', 'access') }, getOrders);
  app.get('/api/v1/orders/by-conversation/:conversationId', { preHandler: requireGrant('orders', 'access') }, getOrderByConversation);
  app.post('/api/v1/orders', { preHandler: requireGrant('orders', 'create') }, createOrder);
  app.put('/api/v1/orders/:id', { preHandler: requireGrant('orders', 'edit') }, updateOrder);
  app.delete('/api/v1/orders/:id', { preHandler: requireGrant('orders', 'delete') }, deleteOrder);

  // Báo cáo lương thiết kế
  app.get('/api/v1/orders/reports', { preHandler: requireGrant('orders_salary', 'access') }, getSalaryReport);

  // Thống kê tổng quan (thẻ số liệu + biểu đồ)
  app.get('/api/v1/orders/stats', { preHandler: requireGrant('orders', 'access') }, getOrderStats);
}
