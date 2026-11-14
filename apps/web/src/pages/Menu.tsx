import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { clsx } from 'clsx';
import { Pencil, Plus, Trash2, UtensilsCrossed } from 'lucide-react';
import { toast } from 'sonner';
import { STATIONS } from '@tablewise/shared';
import { api, errorMessage } from '../lib/api';
import { useAuth, useOutlet } from '../lib/auth';
import { bpsToPct, fromCents, money, pctToBps, toCents } from '../lib/format';
import { useI18n } from '../i18n';
import type { Category, InventoryItem, MenuItem, Modifier } from '../lib/types';
import { Badge, Button, Card, Checkbox, ConfirmDialog, EmptyState, Field, Input, Modal, PageHeader, PageLoader, Select, Textarea } from '../components/ui';
import { Page } from '../components/Layout';
import { VegMark } from './OrderScreen';

export default function MenuPage() {
  const { outlet, base } = useOutlet();
  const { can } = useAuth();
  const { t, dish, dishAlt } = useI18n();
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
    onSuccess: () => { invalidate(); setArchive(null); toast.success(t('menu.archived')); }, onError: (e) => toast.error(errorMessage(e)),
  });

  if (isLoading || !data) return <Page><PageLoader /></Page>;
  const cats = data.categories.filter((c) => !catFilter || c.id === catFilter);

  return (
    <Page>
      <PageHeader title={t('menu.title')} description={manage ? t('menu.subtitleManage') : t('menu.subtitleChef')}
        actions={manage && <>
          <Button variant="secondary" onClick={() => setEditCat('new')}><Plus className="h-4 w-4" />{t('menu.category')}</Button>
          <Button onClick={() => setEditItem('new')} disabled={!data.categories.length}><Plus className="h-4 w-4" />{t('menu.item')}</Button>
        </>} />
      {data.categories.length === 0 ? (
        <Card><EmptyState icon={<UtensilsCrossed className="h-10 w-10" />} title={t('menu.empty')} description={t('menu.emptyDesc')}
          action={manage && <Button onClick={() => setEditCat('new')}>{t('menu.createCategory')}</Button>} /></Card>
      ) : (
        <>
          <Select className="mb-4 w-56" value={catFilter} onChange={(e) => setCatFilter(e.target.value)} aria-label={t('menu.category')}>
            <option value="">{t('menu.allCategories')}</option>
            {data.categories.map((c) => <option key={c.id} value={c.id}>{dish(c)}</option>)}
          </Select>
          <div className="space-y-6">
            {cats.map((c) => {
              const items = data.items.filter((i) => i.categoryId === c.id);
              return (
                <Card key={c.id}
                  title={<span className="flex items-center gap-2">{dish(c)}{dishAlt(c) && <span className="font-normal text-slate-400">· {dishAlt(c)}</span>}{!c.isActive && <Badge>{t('menu.hidden')}</Badge>}<span className="font-normal text-slate-400">({items.length})</span></span>}
                  actions={manage && <Button size="sm" variant="ghost" onClick={() => setEditCat(c)}><Pencil className="h-3.5 w-3.5" />{t('common.edit')}</Button>}>
                  {items.length === 0 ? <p className="px-4 py-6 text-center text-sm text-slate-500">{t('menu.noItems')}</p> : (
                    <ul className="divide-y divide-slate-100">
                      {items.map((i) => (
                        <li key={i.id} className="flex flex-wrap items-center gap-4 px-4 py-3">
                          <VegMark veg={i.isVeg} />
                          <div className="min-w-48 flex-1">
                            <p className="font-medium text-slate-900">
                              {dish(i)} {dishAlt(i) && <span className="font-normal text-slate-500">· {dishAlt(i)}</span>}
                              {i.sku && <span className="ml-2 text-xs font-normal text-slate-400">{i.sku}</span>}
                            </p>
                            <p className="text-xs text-slate-500">
                              {t(`station.${i.station}`)} · {t('common.minutes', { n: i.prepTimeMin })}{i.modifiers.length > 0 && ` · ${t('menu.optionsN', { n: i.modifiers.length })}`}
                              {' · '}{t('menu.taxPct', { pct: bpsToPct(i.taxRateBps ?? outlet.taxRateBps) })}
                            </p>
                          </div>
                          <span className="tabular w-24 text-right font-semibold">{money(i.priceCents)}</span>
                          <button onClick={() => toggle.mutate(i)} disabled={toggle.isPending}
                            className={clsx('relative h-6 w-11 shrink-0 rounded-full transition', i.isAvailable ? 'bg-emerald-500' : 'bg-slate-300')}
                            role="switch" aria-checked={i.isAvailable} aria-label={t('menu.availableToggle', { item: dish(i) })}>
                            <span className={clsx('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition', i.isAvailable ? 'left-[1.375rem]' : 'left-0.5')} />
                          </button>
                          {manage && (
                            <div className="flex gap-1">
                              <Button size="sm" variant="ghost" onClick={() => setEditItem(i)} aria-label={t('common.edit')}><Pencil className="h-4 w-4" /></Button>
                              <Button size="sm" variant="ghost" onClick={() => setArchive(i)} aria-label={t('menu.archive')}><Trash2 className="h-4 w-4 text-red-600" /></Button>
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
      <ConfirmDialog open={!!archive} title={t('menu.archiveTitle', { item: archive ? dish(archive) : '' })} confirmLabel={t('menu.archive')} loading={del.isPending}
        message={t('menu.archiveMsg')} onClose={() => setArchive(null)} onConfirm={() => del.mutate(archive!)} />
    </Page>
  );
}

function CategoryForm({ category, onClose }: { category: Category | null; onClose: () => void }) {
  const { base } = useOutlet();
  const { t } = useI18n();
  const qc = useQueryClient();
  const [name, setName] = useState(category?.name ?? '');
  const [nameTa, setNameTa] = useState(category?.nameTa ?? '');
  const [sortOrder, setSortOrder] = useState(category?.sortOrder ?? 0);
  const [isActive, setActive] = useState(category?.isActive ?? true);
  const body = { name, nameTa: nameTa || null, sortOrder, isActive };
  const save = useMutation({
    mutationFn: () => category ? api.put(`${base}/menu/categories/${category.id}`, body) : api.post(`${base}/menu/categories`, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['menu'] }); onClose(); }, onError: (e) => toast.error(errorMessage(e)),
  });
  const del = useMutation({
    mutationFn: () => api.del(`${base}/menu/categories/${category!.id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['menu'] }); onClose(); }, onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Modal open onClose={onClose} title={category ? t('menu.editCategory') : t('menu.newCategory')} size="sm"
      footer={<>
        {category && <Button variant="ghost" className="mr-auto text-red-600" onClick={() => del.mutate()} loading={del.isPending}>{t('common.delete')}</Button>}
        <Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button><Button form="cat-form" type="submit" loading={save.isPending}>{t('common.save')}</Button></>}>
      <form id="cat-form" className="space-y-3" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
        <Field label={t('menu.nameEn')}><Input required value={name} onChange={(e) => setName(e.target.value)} autoFocus /></Field>
        <Field label={t('menu.nameTa')}><Input lang="ta" value={nameTa} onChange={(e) => setNameTa(e.target.value)} placeholder={t('menu.nameTaPh')} /></Field>
        <Field label={t('menu.displayOrder')}><Input type="number" min={0} value={sortOrder} onChange={(e) => setSortOrder(Number(e.target.value))} /></Field>
        <Checkbox label={t('menu.visible')} checked={isActive} onChange={setActive} />
      </form>
    </Modal>
  );
}

function ItemForm({ item, categories, onClose }: { item: MenuItem | null; categories: Category[]; onClose: () => void }) {
  const { outlet, base } = useOutlet();
  const { t, dish } = useI18n();
  const qc = useQueryClient();
  const [f, setF] = useState({
    categoryId: item?.categoryId ?? categories[0]!.id, name: item?.name ?? '', nameTa: item?.nameTa ?? '', description: item?.description ?? '',
    sku: item?.sku ?? '', price: item ? fromCents(item.priceCents) : '', tax: item?.taxRateBps != null ? bpsToPct(item.taxRateBps) : '',
    station: item?.station ?? 'KITCHEN', isVeg: item?.isVeg ?? true, isAvailable: item?.isAvailable ?? true, prepTimeMin: item?.prepTimeMin ?? 10,
  });
  const [mods, setMods] = useState<{ name: string; nameTa: string; price: string }[]>(
    item?.modifiers.map((m) => ({ name: m.name, nameTa: m.nameTa ?? '', price: fromCents(m.priceCents) })) ?? []);
  const [tab, setTab] = useState<'details' | 'recipe'>('details');

  const save = useMutation({
    mutationFn: () => {
      const body = {
        categoryId: f.categoryId, name: f.name, nameTa: f.nameTa || null, description: f.description || null, sku: f.sku || null,
        priceCents: toCents(f.price), taxRateBps: f.tax === '' ? null : pctToBps(f.tax), station: f.station,
        isVeg: f.isVeg, isAvailable: f.isAvailable, prepTimeMin: f.prepTimeMin,
        modifiers: mods.filter((m) => m.name.trim()).map<Modifier>((m) => ({ name: m.name.trim(), nameTa: m.nameTa.trim() || null, priceCents: toCents(m.price) })),
      };
      return item ? api.put(`${base}/menu/items/${item.id}`, body) : api.post(`${base}/menu/items`, body);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['menu'] }); toast.success(t('menu.saved')); onClose(); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setF({ ...f, [k]: k === 'prepTimeMin' ? Number(e.target.value) : e.target.value });

  return (
    <Modal open onClose={onClose} title={item ? t('menu.editItem', { item: dish(item) }) : t('menu.newItem')} size="lg"
      footer={tab === 'details' && <><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button><Button form="item-form" type="submit" loading={save.isPending}>{t('common.save')}</Button></>}>
      {item && (
        <div className="mb-4 flex gap-4 border-b border-slate-100 text-sm">
          {(['details', 'recipe'] as const).map((tb) => (
            <button key={tb} onClick={() => setTab(tb)} className={clsx('-mb-px border-b-2 pb-2 font-medium', tab === tb ? 'border-brand-700 text-brand-800' : 'border-transparent text-slate-500')}>
              {tb === 'details' ? t('menu.details') : t('menu.recipe')}
            </button>
          ))}
        </div>
      )}
      {tab === 'recipe' && item ? <RecipeEditor item={item} onDone={onClose} /> : (
        <form id="item-form" className="grid grid-cols-2 gap-3" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
          <Field label={t('menu.nameEn')}><Input required value={f.name} onChange={set('name')} /></Field>
          <Field label={t('menu.nameTa')}><Input lang="ta" value={f.nameTa} onChange={set('nameTa')} placeholder={t('menu.nameTaPh')} /></Field>
          <Field label={t('menu.category')}><Select value={f.categoryId} onChange={set('categoryId')}>{categories.map((c) => <option key={c.id} value={c.id}>{dish(c)}</option>)}</Select></Field>
          <Field label={t('menu.station')}><Select value={f.station} onChange={set('station')}>{STATIONS.map((s) => <option key={s} value={s}>{t(`station.${s}`)}</option>)}</Select></Field>
          <Field label={t('menu.price')}><Input required inputMode="decimal" value={f.price} onChange={set('price')} /></Field>
          <Field label={t('menu.taxRate')} hint={t('menu.taxHint', { pct: bpsToPct(outlet.taxRateBps) })}><Input inputMode="decimal" value={f.tax} onChange={set('tax')} /></Field>
          <Field label={t('menu.sku')}><Input value={f.sku} onChange={set('sku')} /></Field>
          <Field label={t('menu.prepTime')}><Input type="number" min={0} max={240} value={f.prepTimeMin} onChange={set('prepTimeMin')} /></Field>
          <Field label={t('menu.description')} className="col-span-2"><Textarea rows={2} value={f.description} onChange={set('description')} /></Field>
          <div className="col-span-2 flex gap-6">
            <Checkbox label={t('common.vegetarian')} checked={f.isVeg} onChange={(v) => setF({ ...f, isVeg: v })} />
            <Checkbox label={t('menu.available')} checked={f.isAvailable} onChange={(v) => setF({ ...f, isAvailable: v })} />
          </div>
          <div className="col-span-2">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium text-slate-700">{t('menu.addons')}</span>
              <Button type="button" size="sm" variant="secondary" onClick={() => setMods([...mods, { name: '', nameTa: '', price: '0.00' }])}><Plus className="h-3.5 w-3.5" />{t('common.add')}</Button>
            </div>
            <div className="space-y-2">
              {mods.map((m, idx) => (
                <div key={idx} className="flex gap-2">
                  <Input placeholder={t('menu.addonPh')} value={m.name} onChange={(e) => setMods(mods.map((x, i) => i === idx ? { ...x, name: e.target.value } : x))} />
                  <Input lang="ta" placeholder={t('menu.nameTaPh')} value={m.nameTa} onChange={(e) => setMods(mods.map((x, i) => i === idx ? { ...x, nameTa: e.target.value } : x))} />
                  <Input className="w-24" inputMode="decimal" value={m.price} onChange={(e) => setMods(mods.map((x, i) => i === idx ? { ...x, price: e.target.value } : x))} />
                  <Button type="button" variant="ghost" onClick={() => setMods(mods.filter((_, i) => i !== idx))} aria-label={t('common.remove')}><Trash2 className="h-4 w-4" /></Button>
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
  const { t } = useI18n();
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
    onSuccess: () => { toast.success(t('menu.recipeSaved')); onDone(); }, onError: (e) => toast.error(errorMessage(e)),
  });
  if (inv.isLoading || recipe.isLoading) return <PageLoader />;
  if (!inv.data?.length) return <EmptyState title={t('menu.noInventory')} description={t('menu.noInventoryDesc')} />;
  const unitOf = (id: string) => inv.data!.find((i) => i.id === id)?.unit ?? '';
  return (
    <div>
      <p className="mb-3 text-sm text-slate-500">{t('menu.recipeHint')}</p>
      <div className="space-y-2">
        {current.map((l, idx) => (
          <div key={idx} className="flex gap-2">
            <Select value={l.inventoryItemId} onChange={(e) => setLines(current.map((x, i) => i === idx ? { ...x, inventoryItemId: e.target.value } : x))}>
              <option value="">{t('menu.selectIngredient')}</option>
              {inv.data!.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
            </Select>
            <Input className="w-28" inputMode="decimal" value={l.quantity} onChange={(e) => setLines(current.map((x, i) => i === idx ? { ...x, quantity: e.target.value } : x))} />
            <span className="w-10 self-center text-sm text-slate-500">{unitOf(l.inventoryItemId)}</span>
            <Button variant="ghost" onClick={() => setLines(current.filter((_, i) => i !== idx))} aria-label={t('common.remove')}><Trash2 className="h-4 w-4" /></Button>
          </div>
        ))}
      </div>
      <div className="mt-4 flex justify-between">
        <Button variant="secondary" size="sm" onClick={() => setLines([...current, { inventoryItemId: '', quantity: '1' }])}><Plus className="h-3.5 w-3.5" />{t('menu.ingredient')}</Button>
        <Button onClick={() => save.mutate()} loading={save.isPending}>{t('menu.saveRecipe')}</Button>
      </div>
    </div>
  );
}
