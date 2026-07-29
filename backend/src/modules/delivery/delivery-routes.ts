// SPDX-License-Identifier: AGPL-3.0-or-later
import type { FastifyInstance } from 'fastify';
import { authMiddleware } from '../auth/auth-middleware.js';
import { requireGrant } from '../rbac/rbac-middleware.js';
import * as service from './delivery-service.js';

export async function deliveryRoutes(app: FastifyInstance) {
  const read = { preHandler: [authMiddleware, requireGrant('delivery','access')] };
  app.get('/api/v1/delivery/orders', read, async (request) => service.list(request.user!, request.query as any));
  app.get('/api/v1/delivery/orders/:id', read, async (request:any,reply) => { const row=await service.get(request.user!,request.params.id);return row??reply.status(404).send({error:'Không tìm thấy đơn giao vận'}); });
  app.get('/api/v1/delivery/stats', read, async (request) => service.stats(request.user!));
  app.get('/api/v1/delivery/analytics', read, async (request, reply) => { try { return await service.analytics(request.user!, request.query as any); } catch (e: any) { return reply.status(400).send({ error: e.message }); } });
  app.post('/api/v1/delivery/orders', {preHandler:[authMiddleware,requireGrant('delivery','create')]}, async(request,reply)=>{try{return reply.status(201).send(await service.create(request.user!,request.body as any));}catch(e:any){return reply.status(service.duplicateError(e)?409:400).send({error:service.duplicateError(e)?'Mã đơn đã tồn tại':e.message});}});
  app.post('/api/v1/delivery/orders/bulk', {preHandler:[authMiddleware,requireGrant('delivery','create')]}, async(request,reply)=>{try{return reply.status(201).send(await service.bulkCreate(request.user!,request.body as any));}catch(e:any){return reply.status(400).send({error:e.message});}});
  app.put('/api/v1/delivery/orders/:id', {preHandler:[authMiddleware,requireGrant('delivery','edit')]}, async(request:any,reply)=>{try{const row=await service.update(request.user!,request.params.id,request.body as any);return row??reply.status(404).send({error:'Không tìm thấy đơn giao vận'});}catch(e:any){return reply.status(service.duplicateError(e)?409:400).send({error:service.duplicateError(e)?'Mã đơn đã tồn tại':e.message});}});
  app.post('/api/v1/delivery/orders/:id/refresh-tracking', {preHandler:[authMiddleware,requireGrant('delivery','edit')]}, async(request:any,reply)=>{try{const result=await service.refreshPancakeTracking(request.user!,request.params.id);return result??reply.status(404).send({error:'Không tìm thấy đơn giao vận'});}catch(e:any){const status=e instanceof service.PancakeIntegrationError?e.statusCode:502;return reply.status(status).send({error:e instanceof Error?e.message:'Không tải được tracking từ Pancake',code:e instanceof service.PancakeIntegrationError?e.code:'tracking_sync_failed'});}});
  app.delete('/api/v1/delivery/orders/:id', {preHandler:[authMiddleware,requireGrant('delivery','delete')]}, async(request:any,reply)=>await service.remove(request.user!,request.params.id)?{success:true}:reply.status(404).send({error:'Không tìm thấy đơn giao vận'}));
}
