import { and, asc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { can, categorySchema, menuItemSchema, recipeSchema, SOCKET_EVENTS } from '@tablewise/shared';
import { inventoryItems, menuCategories, menuItems, recipeLines } from '../db/schema.js';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.js';
import { parse } from '../lib/validate.js';
import { outletIdOf } from '../lib/http.js';
import { audit } from '../lib/audit.js';

export default async function menuRoutes(app: FastifyInstance) {
  const manage = { preHandler: [app.requirePermission('menu:manage')] };

  app.get('/menu', async (req) => {
    const outletId = outletIdOf(req);
    const [categories, items] = await Promise.all([
      app.db.select().from(menuCategories).where(eq(menuCategories.outletId, outletId))
        .orderBy(asc(menuCategories.sortOrder), asc(menuCategories.name)),
      app.db.select().from(menuItems)
        .where(and(eq(menuItems.outletId, outletId), eq(menuItems.isArchived, false)))
        .orderBy(asc(menuItems.name)),
    ]);
    return { categories, items };
  });

  // ---------------------------------------------------------- Categories
  app.post('/menu/categories', manage, async (req, reply) => {
    const outletId = outletIdOf(req);
    const input = parse(categorySchema, req.body);
    const [c] = await app.db.insert(menuCategories).values({ ...input, outletId }).returning();
    app.realtime.emit(outletId, SOCKET_EVENTS.MENU_UPDATED, {});
    reply.code(201);
    return c;
  });

  app.put('/menu/categories/:id', manage, async (req) => {
    const outletId = outletIdOf(req);
    const { id } = req.params as { id: string };
    const input = parse(categorySchema, req.body);
    const [c] = await app.db.update(menuCategories).set(input)
      .where(and(eq(menuCategories.id, id), eq(menuCategories.outletId, outletId))).returning();
    if (!c) throw notFound('entity.category');
    app.realtime.emit(outletId, SOCKET_EVENTS.MENU_UPDATED, {});
    return c;
  });

  app.delete('/menu/categories/:id', manage, async (req) => {
    const outletId = outletIdOf(req);
    const { id } = req.params as { id: string };
    const items = await app.db.select({ id: menuItems.id }).from(menuItems)
      .where(and(eq(menuItems.categoryId, id), eq(menuItems.isArchived, false))).limit(1);
    if (items.length) throw conflict('menu.categoryHasItems');
    const archived = await app.db.select({ id: menuItems.id }).from(menuItems).where(eq(menuItems.categoryId, id)).limit(1);
    if (archived.length) {
      // Keep archived items' history intact by deactivating instead of deleting.
      await app.db.update(menuCategories).set({ isActive: false })
        .where(and(eq(menuCategories.id, id), eq(menuCategories.outletId, outletId)));
    } else {
      const d = await app.db.delete(menuCategories)
        .where(and(eq(menuCategories.id, id), eq(menuCategories.outletId, outletId))).returning();
      if (!d.length) throw notFound('entity.category');
    }
    app.realtime.emit(outletId, SOCKET_EVENTS.MENU_UPDATED, {});
    return { ok: true };
  });

  // ---------------------------------------------------------- Items
  async function assertCategory(outletId: string, categoryId: string) {
    const [c] = await app.db.select({ id: menuCategories.id }).from(menuCategories)
      .where(and(eq(menuCategories.id, categoryId), eq(menuCategories.outletId, outletId)));
    if (!c) throw notFound('entity.category');
  }

  app.post('/menu/items', manage, async (req, reply) => {
    const outletId = outletIdOf(req);
    const input = parse(menuItemSchema, req.body);
    await assertCategory(outletId, input.categoryId);
    const [item] = await app.db.insert(menuItems).values({ ...input, outletId }).returning();
    await audit(app.db, req, { action: 'menu_item.created', entityType: 'menu_item', entityId: item!.id, outletId });
    app.realtime.emit(outletId, SOCKET_EVENTS.MENU_UPDATED, {});
    reply.code(201);
    return item;
  });

  app.put('/menu/items/:id', manage, async (req) => {
    const outletId = outletIdOf(req);
    const { id } = req.params as { id: string };
    const input = parse(menuItemSchema, req.body);
    await assertCategory(outletId, input.categoryId);
    const [before] = await app.db.select({ priceCents: menuItems.priceCents }).from(menuItems)
      .where(and(eq(menuItems.id, id), eq(menuItems.outletId, outletId)));
    if (!before) throw notFound('entity.menuItem');
    const [item] = await app.db.update(menuItems).set(input).where(eq(menuItems.id, id)).returning();
    await audit(app.db, req, {
      action: 'menu_item.updated', entityType: 'menu_item', entityId: id, outletId,
      metadata: before.priceCents !== input.priceCents ? { priceFrom: before.priceCents, priceTo: input.priceCents } : {},
    });
    app.realtime.emit(outletId, SOCKET_EVENTS.MENU_UPDATED, {});
    return item;
  });

  app.patch('/menu/items/:id/availability', async (req) => {
    // 86'ing an item is allowed for kitchen staff as well as menu managers.
    const outletId = outletIdOf(req);
    const { id } = req.params as { id: string };
    const { isAvailable } = req.body as { isAvailable?: unknown };
    if (typeof isAvailable !== 'boolean') throw badRequest('menu.availabilityBoolean');
    if (!can(req.user.role, 'menu:manage') && !can(req.user.role, 'kitchen:update')) throw forbidden();
    const [item] = await app.db.update(menuItems).set({ isAvailable })
      .where(and(eq(menuItems.id, id), eq(menuItems.outletId, outletId))).returning();
    if (!item) throw notFound('entity.menuItem');
    await audit(app.db, req, { action: isAvailable ? 'menu_item.restocked' : 'menu_item.86d', entityType: 'menu_item', entityId: id, outletId });
    app.realtime.emit(outletId, SOCKET_EVENTS.MENU_UPDATED, {});
    return item;
  });

  app.delete('/menu/items/:id', manage, async (req) => {
    const outletId = outletIdOf(req);
    const { id } = req.params as { id: string };
    // Archive rather than delete: historical orders reference the item.
    const [item] = await app.db.update(menuItems).set({ isArchived: true, isAvailable: false })
      .where(and(eq(menuItems.id, id), eq(menuItems.outletId, outletId))).returning();
    if (!item) throw notFound('entity.menuItem');
    await audit(app.db, req, { action: 'menu_item.archived', entityType: 'menu_item', entityId: id, outletId });
    app.realtime.emit(outletId, SOCKET_EVENTS.MENU_UPDATED, {});
    return { ok: true };
  });

  // ---------------------------------------------------------- Recipes (inventory linkage)
  app.get('/menu/items/:id/recipe', async (req) => {
    const outletId = outletIdOf(req);
    const { id } = req.params as { id: string };
    return app.db.select({
      inventoryItemId: recipeLines.inventoryItemId, quantity: recipeLines.quantity,
      name: inventoryItems.name, unit: inventoryItems.unit,
    }).from(recipeLines)
      .innerJoin(inventoryItems, eq(inventoryItems.id, recipeLines.inventoryItemId))
      .innerJoin(menuItems, eq(menuItems.id, recipeLines.menuItemId))
      .where(and(eq(recipeLines.menuItemId, id), eq(menuItems.outletId, outletId)));
  });

  app.put('/menu/items/:id/recipe', manage, async (req) => {
    const outletId = outletIdOf(req);
    const { id } = req.params as { id: string };
    const { lines } = parse(recipeSchema, req.body);
    const [item] = await app.db.select({ id: menuItems.id }).from(menuItems)
      .where(and(eq(menuItems.id, id), eq(menuItems.outletId, outletId)));
    if (!item) throw notFound('entity.menuItem');
    const inv = await app.db.select({ id: inventoryItems.id }).from(inventoryItems).where(eq(inventoryItems.outletId, outletId));
    const valid = new Set(inv.map((i) => i.id));
    if (lines.some((l) => !valid.has(l.inventoryItemId))) throw badRequest('recipe.unknownIngredient');
    if (new Set(lines.map((l) => l.inventoryItemId)).size !== lines.length) throw badRequest('recipe.duplicate');
    await app.db.transaction(async (tx) => {
      await tx.delete(recipeLines).where(eq(recipeLines.menuItemId, id));
      if (lines.length) await tx.insert(recipeLines).values(lines.map((l) => ({ ...l, menuItemId: id })));
      await audit(tx, req, { action: 'menu_item.recipe_updated', entityType: 'menu_item', entityId: id, outletId });
    });
    return { ok: true };
  });
}
