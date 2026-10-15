// Recipe completeness + ingredient cards (B-25 module 2, Chef Max 15/10/2026) — READ ONLY.
// 'completeness' = Chef only. 'ingredients' / 'ingredient' = every signed-in user; vendors and prices are added
// server-side ONLY for the Chef (staff never receive them). Selects only: this module has no write path.
import * as K from '../_shared/kitchen_core.js'

type U = { id: number; role: 'chef' | 'staff' }
export class KitchenError extends Error { constructor(public status: number, public code: string) { super(code) } }
const must = <T>(r: { data: T | null; error: unknown }) => { if (r.error) throw r.error; return r.data as T }
const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s)
const ING_COLS = 'id,name,name_it,name_es,category,base_unit,notes,active,measure_type,avg_unit_weight_g,yield_factor'
const VEND_COLS = 'ingredient_id,vendor,vendor_sku,purchase_unit,pack_description,unit_price,price_per_100g,price_per_each,last_invoice_date,do_not_order,do_not_order_reason'

export async function completeness(u: U, svc: any) {
  if (u.role !== 'chef') throw new KitchenError(403, 'forbidden')
  const [attention, recipes] = await Promise.all([
    svc.from('attention_items').select('origin,attention,reason,family,recipe_id').eq('origin', 'office').eq('attention', 'backlog').limit(5000).then(must),
    svc.from('recipes').select('id,title,category').limit(5000).then(must),
  ])
  return K.completeness(attention as any[], recipes as any[])
}

export async function ingredients(u: U, svc: any) {
  const chef = u.role === 'chef'
  const [ing, vend] = await Promise.all([
    svc.from('ingredients').select('id,name,name_it,name_es,category,active').order('name').limit(5000).then(must),
    chef ? svc.from('ingredient_vendors').select('ingredient_id,do_not_order').limit(10000).then(must) : Promise.resolve([]),
  ])
  return { ingredients: K.ingredientList(ing as any[], vend as any[], chef) }
}

export async function ingredient(u: U, id: string, svc: any) {
  if (!isUuid(id)) throw new KitchenError(400, 'bad_id')
  const chef = u.role === 'chef'
  const [ing, bom, prep, vend] = await Promise.all([
    svc.from('ingredients').select(ING_COLS).eq('id', id).then(must),
    svc.from('recipe_bom').select('parent_recipe_id,item_id').eq('item_id', id).limit(5000).then(must),
    svc.from('prep_tasks').select('id,name,ingredient_id').eq('ingredient_id', id).not('archived', 'is', true).then(must),
    chef ? svc.from('ingredient_vendors').select(VEND_COLS).eq('ingredient_id', id).then(must) : Promise.resolve([]),
  ]) as any[][]
  if (!ing.length) throw new KitchenError(404, 'not_found')
  const parents = [...new Set(bom.map(b => b.parent_recipe_id))]
  const recipes = parents.length ? must(await svc.from('recipes').select('id,title').in('id', parents)) as any[] : []
  return K.ingredientCard(id, { ingredients: ing, bom, prep, recipes, vendors: vend }, chef)
}
