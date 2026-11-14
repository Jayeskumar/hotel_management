import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { clsx } from 'clsx';
import { Leaf, Pencil, Plus, Trash2, UtensilsCrossed } from 'lucide-react';
import { toast } from 'sonner';
import { STATIONS } from '@tablewise/shared';
import { api, errorMessage } from '../lib/api';
import { useAuth, useOutlet } from '../lib/auth';
import { bpsToPct, fromCents, money, pctToBps, titleCase, toCents } from '../lib/format';
import type { Category, InventoryItem, MenuItem, Modifier } from '../lib/types';
import { Badge, Button, Card, Checkbox, ConfirmDialog, EmptyState, Field, Input, Modal, PageHeader, PageLoader, Select, Textarea } from '../components/ui';
import { Page } from '../components/Layout';

export default function MenuPage() {
  const { outlet, base } = useOutlet();
  const { can } = useAuth();
  const qc = useQueryClient();
  const manage = can('menu:manage');
  const [editItem, setEditItem] = useState<MenuItem | 'new' | null>(null);
  const [editCat, setEditCat] = useState<Category | 'new' | null>(null);
  const [archive, setArchive] = useState<MenuItem | null>(null);
  const [catFilter, setCatFilter] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['menu', outlet.id],
    queryFn: () => api.get<{ categories: Category[]; items: MenuItem[] }>(`${base}/menu`),
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: ['menu'] });
  const toggle = useMutation({
    mutationFn: (i: MenuItem) => api.patch(`${base}/menu/items/${i.id}/availability`, { isAvailable: !i.isAvailable }),
    onSuccess: invalidate, onError: (e) => toast.error(errorMessage(e)),
  });
  const del = useMutation({
    mutationFn: (i: MenuItem) => api.del(`${base}/menu/items/${i.id}`),
    onSuccess: () => { invalidate(); setArchive(null); toast.success('Item archived'); }, onError: (e) => toast.error(errorMessage(e)),
  });

  if (isLoading || !data) return <Page><PageLoader /></Page>;
  const cats = data.categories.filter((c) => !catFilter || c.id === catFilter);

  return (
    <Page>
      <PageHeader title="Menu" description={manage ? 'Manage categories, items, pricing, modifiers and recipes.' : "Mark items as unavailable (86) when you run out."}
        actions={manage && <>
          <Button variant="secondary" onClick={() => setEditCat('new')}><Plus className="h-4 w-4" />Category</Button>
          <Button onClick={() => setEditItem('new')} disabled={!data.categories.length}><Plus className="h-4 w-4" />Menu item</Button>
        </>} />
      {data.categories.length === 0 ? (
        <Card><EmptyState icon={<UtensilsCrossed className="h-10 w-10" />} title="Your menu is empty" description="Start by creating a category such as Starters or Drinks."
          action={manage && <Button onClick={() => setEditCat('new')}>Create category</Button>} /></Card>
      ) : (
        <>
          <Select className="mb-4 w-56" value={catFilter} onChange={(e) => setCatFilter(e.target.value)} aria-label="Category filter">
            <option value="">All categories</option>
            {data.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <div className="space-y-6">
            {cats.map((c) => {
              const items = data.items.filter((i) => i.categoryId === c.id);
              return (
                <Card key={c.id} title={<span className="flex items-center gap-2">{c.name}{!c.isActive && <Badge>Hidden</Badge>}<span className="font-normal text-slate-400">({items.length})</span></span>}
                  actions={manage && <Button size="sm" variant="ghost" onClick={() => setEditCat(c)}><Pencil className="h-3.5 w-3.5" />Edit</Button>}>
                  {items.length === 0 ? <p className="px-4 py-6 text-center text-sm text-slate-500">No items in this category.</p> : (
                    <ul className="divide-y divide-slate-100">
                      {items.map((i) => (
                        <li key={i.id} className="flex flex-wrap items-center gap-4 px-4 py-3">
                          <div className="min-w-48 flex-1">
                            <p className="flex items-center gap-2 font-medium text-slate-900">
                              {i.name}{i.isVeg && <Leaf className="h-3.5 w-3.5 text-emerald-600" />}
                              {i.sku && <span className="text-xs font-normal text-slate-400">{i.sku}</span>}
                            </p>
                            <p className="text-xs text-slate-500">
                              {titleCase(i.station)} · {i.prepTimeMin} min{i.modifiers.length > 0 && ` · ${i.modifiers.length} options`}
                              {i.taxRateBps !== null && ` · tax ${bpsToPct(i.taxRateBps)}%`}
                            </p>
                          </div>
                          <span className="tabular w-24 text-right font-semibold">{money(i.priceCents, outlet.currency)}</span>
                          <button onClick={() => toggle.mutate(i)} disabled={toggle.isPending}
                            className={clsx('relative h-6 w-11 rounded-full transition', i.isAvailable ? 'bg-emerald-500' : 'bg-slate-300')}
                            role="switch" aria-checked={i.isAvailable} aria-label={`${i.name} available`}>
                            <span className={clsx('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition', i.isAvailable ? 'left-[1.375rem]' : 'left-0.5')} />
                          </button>
                          {manage && (
                            <div className="flex gap-1">
                              <Button size="sm" variant="ghost" onClick={() => setEditItem(i)} aria-label="Edit"><Pencil className="h-4 w-4" /></Button>
                              <Button size="sm" variant="ghost" onClick={() => setArchive(i)} aria-label="Archive"><Trash2 className="h-4 w-4 text-red-600" /></Button>
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              );
            })}
          </div>
        </>
      )}
      {editItem && <ItemForm item={editItem === 'new' ? null : editItem} categories={data.categories} onClose={() => setEditItem(null)} />}
      {editCat && <CategoryForm category={editCat === 'new' ? null : editCat} onClose={() => setEditCat(null)} />}
      <ConfirmDialog open={!!archive} title={`Archive ${archive?.name ?? ''}?`} confirmLabel="Archive" loading={del.isPending}
        message="The item will be removed from the menu. Past orders keep their history." onClose={() => setArchive(null)} onConfirm={() => del.mutate(archive!)} />
    </Page>
  );
}

function CategoryForm({ category, onClose }: { category: Category | null; onClose: () => void }) {
  const { base } = useOutlet();
  const qc = useQueryClient();
  const [name, setName] = useState(category?.name ?? '');
  const [sortOrder, setSortOrder] = useState(category?.sortOrder ?? 0);
  const [isActive, setActive] = useState(category?.isActive ?? true);
  const save = useMutation({
    mutationFn: () => category ? api.put(`${base}/menu/categories/${category.id}`, { name, sortOrder, isActive }) : api.post(`${base}/menu/categories`, { name, sortOrder, isActive }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['menu'] }); onClose(); }, onError: (e) => toast.error(errorMessage(e)),
  });
  const del = useMutation({
    mutationFn: () => api.del(`${base}/menu/categories/${category!.id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['menu'] }); onClose(); }, onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Modal open onClose={onClose} title={category ? 'Edit category' : 'New category'} size="sm"
      footer={<>
        {category && <Button variant="ghost" className="mr-auto text-red-600" onClick={() => del.mutate()} loading={del.isPending}>Delete</Button>}
        <Button variant="secondary" onClick={onClose}>Cancel</Button><Button form="cat-form" type="submit" loading={save.isPending}>Save</Button></>}>
      <form id="cat-form" className="space-y-3" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
        <Field label="Name"><Input required value={name} onChange={(e) => setName(e.target.value)} autoFocus /></Field>
        <Field label="Display order"><Input type="number" min={0} value={sortOrder} onChange={(e) => setSortOrder(Number(e.target.value))} /></Field>
        <Checkbox label="Visible on POS" checked={isActive} onChange={setActive} />
      </form>
    </Modal>
  );
}

function ItemForm({ item, categories, onClose }: { item: MenuItem | null; categories: Category[]; onClose: () => void }) {
  const { outlet, base } = useOutlet();
  const qc = useQueryClient();
  const [f, setF] = useState({
    categoryId: item?.categoryId ?? categories[0]!.id, name: item?.name ?? '', description: item?.description ?? '',
    sku: item?.sku ?? '', price: item ? fromCents(item.priceCents) : '', tax: item?.taxRateBps != null ? bpsToPct(item.taxRateBps) : '',
    station: item?.station ?? 'KITCHEN', isVeg: item?.isVeg ?? false, isAvailable: item?.isAvailable ?? true, prepTimeMin: item?.prepTimeMin ?? 10,
  });
  const [mods, setMods] = useState<{ name: string; price: string }[]>(item?.modifiers.map((m) => ({ name: m.name, price: fromCents(m.priceCents) })) ?? []);
  const [tab, setTab] = useState<'details' | 'recipe'>('details');

  const save = useMutation({
    mutationFn: () => {
      const body = {
        categoryId: f.categoryId, name: f.name, description: f.description || null, sku: f.sku || null,
        priceCents: toCents(f.price), taxRateBps: f.tax === '' ? null : pctToBps(f.tax), station: f.station,
        isVeg: f.isVeg, isAvailable: f.isAvailable, prepTimeMin: f.prepTimeMin,
        modifiers: mods.filter((m) => m.name.trim()).map<Modifier>((m) => ({ name: m.name.trim(), priceCents: toCents(m.price) })),
      };
      return item ? api.put(`${base}/menu/items/${item.id}`, body) : api.post(`${base}/menu/items`, body);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['menu'] }); toast.success('Menu item saved'); onClose(); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setF({ ...f, [k]: k === 'prepTimeMin' ? Number(e.target.value) : e.target.value });

  return (
    <Modal open onClose={onClose} title={item ? `Edit ${item.name}` : 'New menu item'} size="lg"
      footer={tab === 'details' && <><Button variant="secondary" onClick={onClose}>Cancel</Button><Button form="item-form" type="submit" loading={save.isPending}>Save</Button></>}>
      {item && (
        <div className="mb-4 flex gap-4 border-b border-slate-100 text-sm">
          {(['details', 'recipe'] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={clsx('-mb-px border-b-2 pb-2 font-medium', tab === t ? 'border-brand-700 text-brand-800' : 'border-transparent text-slate-500')}>
              {t === 'details' ? 'Details' : 'Recipe & stock'}
            </button>
          ))}
        </div>
      )}
      {tab === 'recipe' && item ? <RecipeEditor item={item} onDone={onClose} /> : (
        <form id="item-form" className="grid grid-cols-2 gap-3" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
          <Field label="Name" className="col-span-2"><Input required value={f.name} onChange={set('name')} /></Field>
          <Field label="Category"><Select value={f.categoryId} onChange={set('categoryId')}>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
          <Field label="Kitchen station"><Select value={f.station} onChange={set('station')}>{STATIONS.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}</Select></Field>
          <Field label={`Price (${outlet.currency})`}><Input required inputMode="decimal" value={f.price} onChange={set('price')} /></Field>
          <Field label="Tax rate %" hint={`Leave blank for outlet default (${bpsToPct(outlet.taxRateBps)}%)`}><Input inputMode="decimal" value={f.tax} onChange={set('tax')} /></Field>
          <Field label="SKU / PLU"><Input value={f.sku} onChange={set('sku')} /></Field>
          <Field label="Prep time (min)"><Input type="number" min={0} max={240} value={f.prepTimeMin} onChange={set('prepTimeMin')} /></Field>
          <Field label="Description" className="col-span-2"><Textarea rows={2} value={f.description} onChange={set('description')} /></Field>
          <div className="col-span-2 flex gap-6">
            <Checkbox label="Vegetarian" checked={f.isVeg} onChange={(v) => setF({ ...f, isVeg: v })} />
            <Checkbox label="Available" checked={f.isAvailable} onChange={(v) => setF({ ...f, isAvailable: v })} />
          </div>
          <div className="col-span-2">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium text-slate-700">Modifiers / options</span>
              <Button type="button" size="sm" variant="secondary" onClick={() => setMods([...mods, { name: '', price: '0.00' }])}><Plus className="h-3.5 w-3.5" />Add</Button>
            </div>
            <div className="space-y-2">
              {mods.map((m, idx) => (
                <div key={idx} className="flex gap-2">
                  <Input placeholder="e.g. Extra cheese" value={m.name} onChange={(e) => setMods(mods.map((x, i) => i === idx ? { ...x, name: e.target.value } : x))} />
                  <Input className="w-28" inputMode="decimal" value={m.price} onChange={(e) => setMods(mods.map((x, i) => i === idx ? { ...x, price: e.target.value } : x))} />
                  <Button type="button" variant="ghost" onClick={() => setMods(mods.filter((_, i) => i !== idx))} aria-label="Remove"><Trash2 className="h-4 w-4" /></Button>
                </div>
              ))}
            </div>
          </div>
        </form>
      )}
    </Modal>
  );
}

function RecipeEditor({ item, onDone }: { item: MenuItem; onDone: () => void }) {
  const { outlet, base } = useOutlet();
  const inv = useQuery({ queryKey: ['inventory', outlet.id], queryFn: () => api.get<InventoryItem[]>(`${base}/inventory`) });
  const recipe = useQuery({
    queryKey: ['recipe', item.id],
    queryFn: () => api.get<{ inventoryItemId: string; quantity: number }[]>(`${base}/menu/items/${item.id}/recipe`),
  });
  const [lines, setLines] = useState<{ inventoryItemId: string; quantity: string }[] | null>(null);
  const current = lines ?? recipe.data?.map((l) => ({ inventoryItemId: l.inventoryItemId, quantity: String(l.quantity) })) ?? [];
  const save = useMutation({
    mutationFn: () => api.put(`${base}/menu/items/${item.id}/recipe`, {
      lines: current.filter((l) => l.inventoryItemId && Number(l.quantity) > 0).map((l) => ({ inventoryItemId: l.inventoryItemId, quantity: Number(l.quantity) })),
    }),
    onSuccess: () => { toast.success('Recipe saved'); onDone(); }, onError: (e) => toast.error(errorMessage(e)),
  });
  if (inv.isLoading || recipe.isLoading) return <PageLoader />;
  if (!inv.data?.length) return <EmptyState title="No inventory items" description="Add ingredients on the Inventory page to link them to this dish." />;
  const unitOf = (id: string) => inv.data!.find((i) => i.id === id)?.unit ?? '';
  return (
    <div>
      <p className="mb-3 text-sm text-slate-500">Ingredients are deducted from stock automatically each time this item is sold.</p>
      <div className="space-y-2">
        {current.map((l, idx) => (
          <div key={idx} className="flex gap-2">
            <Select value={l.inventoryItemId} onChange={(e) => setLines(current.map((x, i) => i === idx ? { ...x, inventoryItemId: e.target.value } : x))}>
              <option value="">Select ingredient…</option>
              {inv.data!.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
            </Select>
            <Input className="w-28" inputMode="decimal" value={l.quantity} onChange={(e) => setLines(current.map((x, i) => i === idx ? { ...x, quantity: e.target.value } : x))} />
            <span className="w-10 self-center text-sm text-slate-500">{unitOf(l.inventoryItemId)}</span>
            <Button variant="ghost" onClick={() => setLines(current.filter((_, i) => i !== idx))} aria-label="Remove"><Trash2 className="h-4 w-4" /></Button>
          </div>
        ))}
      </div>
      <div className="mt-4 flex justify-between">
        <Button variant="secondary" size="sm" onClick={() => setLines([...current, { inventoryItemId: '', quantity: '1' }])}><Plus className="h-3.5 w-3.5" />Ingredient</Button>
        <Button onClick={() => save.mutate()} loading={save.isPending}>Save recipe</Button>
      </div>
    </div>
  );
}
