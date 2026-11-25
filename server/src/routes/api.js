import { Router } from 'express';
import mongoose from 'mongoose';
import { Ingredient, Flavour, Sale, StockMovement, Purchase, Expense, Investment, INVESTMENT_CATEGORIES } from '../models/index.js';

const router = Router();
const num = (v, label) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) throw Object.assign(new Error(`${label} must be a non-negative number`), { status: 400 });
  return n;
};
const todayStart = () => { const d = new Date(); d.setHours(0,0,0,0); return d; };

router.get('/health', (req,res) => res.json({ status: 'ok', database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected' }));

router.get('/ingredients', async (req,res) => res.json(await Ingredient.find().sort({ name: 1 })));
router.post('/ingredients', async (req,res) => {
  const item = await Ingredient.create({ name: req.body.name, unit: req.body.unit || 'piece', stock: num(req.body.stock ?? 0,'Stock'), reorderLevel: num(req.body.reorderLevel ?? 0,'Reorder level'), unitCost: num(req.body.unitCost ?? 0,'Unit cost') });
  if (item.stock) await StockMovement.create({ ingredient:item._id, ingredientName:item.name, type:'Adjustment', quantity:item.stock, balanceAfter:item.stock, unit:item.unit, note:'Opening stock' });
  res.status(201).json(item);
});
router.put('/ingredients/:id', async (req,res) => res.json(await Ingredient.findByIdAndUpdate(req.params.id, req.body, { new:true, runValidators:true })));
router.delete('/ingredients/:id', async (req,res) => {
  const used = await Flavour.exists({ 'recipe.ingredient': req.params.id });
  if (used) return res.status(400).json({ message:'Ingredient is used in a recipe. Remove it from recipes first.' });
  await Ingredient.findByIdAndDelete(req.params.id); res.json({ success:true });
});
router.post('/ingredients/:id/adjust', async (req,res) => {
  const ingredient = await Ingredient.findById(req.params.id);
  if (!ingredient) throw Object.assign(new Error('Ingredient not found'), {status:404});
  const quantity = num(req.body.quantity,'Quantity');
  const type = req.body.type === 'Wastage' ? 'Wastage' : 'Adjustment';
  const delta = type === 'Wastage' ? -quantity : Number(req.body.direction === 'decrease' ? -quantity : quantity);
  if (ingredient.stock + delta < 0) throw Object.assign(new Error('Insufficient stock'), {status:400});
  ingredient.stock += delta; await ingredient.save();
  await StockMovement.create({ ingredient:ingredient._id, ingredientName:ingredient.name, type, quantity:delta, balanceAfter:ingredient.stock, unit:ingredient.unit, note:req.body.note || '' });
  res.json(ingredient);
});

router.get('/flavours', async (req,res) => res.json(await Flavour.find().populate('recipe.ingredient').sort({name:1})));
router.post('/flavours', async (req,res) => {
  const recipe = (req.body.recipe || []).map(r => ({ ingredient:r.ingredient, quantity:num(r.quantity,'Recipe quantity') }));
  res.status(201).json(await Flavour.create({ name:req.body.name, description:req.body.description, price:num(req.body.price,'Price'), recipe }));
});
router.put('/flavours/:id', async (req,res) => {
  const data = { ...req.body };
  if (data.recipe) data.recipe = data.recipe.map(r => ({ ingredient:r.ingredient?._id || r.ingredient, quantity:num(r.quantity,'Recipe quantity') }));
  res.json(await Flavour.findByIdAndUpdate(req.params.id, data, {new:true, runValidators:true}).populate('recipe.ingredient'));
});
router.delete('/flavours/:id', async (req,res) => { await Flavour.findByIdAndUpdate(req.params.id,{active:false}); res.json({success:true}); });

router.get('/sales', async (req,res) => {
  const limit = Math.min(Number(req.query.limit || 50), 200);
  res.json(await Sale.find().sort({soldAt:-1}).limit(limit));
});
router.post('/sales', async (req,res) => {
  if (!Array.isArray(req.body.items) || !req.body.items.length) return res.status(400).json({message:'Add at least one item'});
  // Validate everything and compute stock changes in memory first, then write.
  let total = 0, totalIngredientCost = 0;
  const saleItems = [], movements = [], touched = new Map();
  for (const line of req.body.items) {
    const flavour = await Flavour.findById(line.flavour).populate('recipe.ingredient');
    if (!flavour || !flavour.active) throw Object.assign(new Error('A selected flavour is unavailable'), {status:400});
    const quantity = Number(line.quantity);
    if (!Number.isInteger(quantity) || quantity < 1) throw Object.assign(new Error('Quantity must be a positive whole number'), {status:400});
    let ingredientCost = 0;
    for (const recipeLine of flavour.recipe) {
      const id = String(recipeLine.ingredient._id);
      if (!touched.has(id)) touched.set(id, await Ingredient.findById(id));
      const ingredient = touched.get(id);
      if (!ingredient || !ingredient.active) throw Object.assign(new Error(`Ingredient missing for ${flavour.name}`), {status:400});
      const required = recipeLine.quantity * quantity;
      if (ingredient.stock + 1e-9 < required) throw Object.assign(new Error(`Insufficient ${ingredient.name}. Required ${required} ${ingredient.unit}, available ${ingredient.stock} ${ingredient.unit}.`), {status:400});
      ingredient.stock -= required;
      ingredientCost += required * ingredient.unitCost;
      movements.push({ingredient:ingredient._id,ingredientName:ingredient.name,type:'Sale',quantity:-required,balanceAfter:ingredient.stock,unit:ingredient.unit,note:`${quantity} x ${flavour.name}`});
    }
    const lineTotal = flavour.price * quantity;
    total += lineTotal; totalIngredientCost += ingredientCost;
    saleItems.push({flavour:flavour._id,flavourName:flavour.name,quantity,unitPrice:flavour.price,lineTotal,ingredientCost});
  }
  for (const ingredient of touched.values()) await ingredient.save();
  await StockMovement.create(movements);
  const created = await Sale.create({items:saleItems,total,totalIngredientCost,paymentMethod:req.body.paymentMethod || 'Cash',note:req.body.note || ''});
  res.status(201).json(created);
});

router.get('/purchases', async (req,res) => res.json(await Purchase.find().sort({purchasedAt:-1}).limit(100)));
router.post('/purchases', async (req,res) => {
  const ingredient = await Ingredient.findById(req.body.ingredient);
  if (!ingredient) throw Object.assign(new Error('Ingredient not found'),{status:404});
  const quantity = num(req.body.quantity,'Quantity');
  if (quantity <= 0) throw Object.assign(new Error('Quantity must be greater than zero'),{status:400});
  const totalCost = num(req.body.totalCost ?? 0,'Total cost');
  ingredient.stock += quantity;
  if (totalCost > 0) ingredient.unitCost = totalCost / quantity;
  await ingredient.save();
  const purchase = await Purchase.create({ingredient:ingredient._id,ingredientName:ingredient.name,quantity,totalCost,supplier:req.body.supplier || '',note:req.body.note || ''});
  await StockMovement.create({ingredient:ingredient._id,ingredientName:ingredient.name,type:'Purchase',quantity,balanceAfter:ingredient.stock,unit:ingredient.unit,note:req.body.note || ''});
  res.status(201).json(purchase);
});

router.get('/expenses', async (req,res) => res.json(await Expense.find().sort({spentAt:-1}).limit(100)));
router.post('/expenses', async (req,res) => res.status(201).json(await Expense.create({category:req.body.category,amount:num(req.body.amount,'Amount'),note:req.body.note || ''})));

router.get('/dashboard', async (req,res) => {
  const start = todayStart();
  const [todaySales, allSales, ingredients, flavours, recentSales, expensesToday] = await Promise.all([
    Sale.find({soldAt:{$gte:start}}), Sale.find({}), Ingredient.find({active:true}), Flavour.find({active:true}), Sale.find().sort({soldAt:-1}).limit(5), Expense.find({spentAt:{$gte:start}})
  ]);
  const revenue = todaySales.reduce((s,x)=>s+x.total,0);
  const cost = todaySales.reduce((s,x)=>s+x.totalIngredientCost,0);
  const lowStock = ingredients.filter(i=>i.stock<=i.reorderLevel);
  const best = {};
  todaySales.forEach(s=>s.items.forEach(i=>best[i.flavourName]=(best[i.flavourName]||0)+i.quantity));
  const bestFlavours = Object.entries(best).map(([name,quantity])=>({name,quantity})).sort((a,b)=>b.quantity-a.quantity).slice(0,5);
  const trend = [];
  for(let d=6;d>=0;d--){ const day=new Date(); day.setHours(0,0,0,0); day.setDate(day.getDate()-d); const next=new Date(day); next.setDate(next.getDate()+1); const rows=allSales.filter(s=>s.soldAt>=day&&s.soldAt<next); trend.push({date:day.toLocaleDateString('en-IN',{day:'2-digit',month:'short'}),revenue:rows.reduce((a,x)=>a+x.total,0)}); }
  res.json({revenue,orders:todaySales.length,averageOrder:todaySales.length?revenue/todaySales.length:0,grossProfit:revenue-cost,expenses:expensesToday.reduce((a,x)=>a+x.amount,0),netAfterExpenses:revenue-cost-expensesToday.reduce((a,x)=>a+x.amount,0),lowStock,bestFlavours,trend,recentSales});
});

router.get('/analytics', async (req,res) => {
  const [sales, ingredients, movements, expenses] = await Promise.all([Sale.find(),Ingredient.find(),StockMovement.find().sort({occurredAt:-1}).limit(200),Expense.find()]);
  const flavourMap = {};
  sales.forEach(s=>s.items.forEach(i=>{const x=flavourMap[i.flavourName] ||= {name:i.flavourName,quantity:0,revenue:0,ingredientCost:0};x.quantity+=i.quantity;x.revenue+=i.lineTotal;x.ingredientCost+=i.ingredientCost;}));
  const totalRevenue=sales.reduce((a,s)=>a+s.total,0), totalCost=sales.reduce((a,s)=>a+s.totalIngredientCost,0), totalExpenses=expenses.reduce((a,e)=>a+e.amount,0);
  const ingredientUsage={};
  movements.filter(m=>m.type==='Sale').forEach(m=>ingredientUsage[m.ingredientName]=(ingredientUsage[m.ingredientName]||0)-m.quantity);
  res.json({flavours:Object.values(flavourMap).sort((a,b)=>b.revenue-a.revenue),ingredientUsage:Object.entries(ingredientUsage).map(([name,quantity])=>({name,quantity})),totalRevenue,totalIngredientCost:totalCost,grossProfit:totalRevenue-totalCost,totalExpenses,netResult:totalRevenue-totalCost-totalExpenses,stock:ingredients,movements});
});
// Parse a YYYY-MM-DD string as local midnight.
const parseDay = (v, label) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v || ''));
  const d = m && new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (!d || d.getMonth() !== Number(m[2]) - 1) throw Object.assign(new Error(`${label} must be a valid date (YYYY-MM-DD)`), { status: 400 });
  return d;
};
const dayKey = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const monthKey = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;

// Sales report over an inclusive date range: /reports/sales?from=2026-11-01&to=2026-11-30
router.get('/reports/sales', async (req,res) => {
  const from = parseDay(req.query.from, 'From date');
  const toDay = parseDay(req.query.to, 'To date');
  if (toDay < from) throw Object.assign(new Error('To date must be on or after From date'), { status: 400 });
  const to = new Date(toDay); to.setDate(to.getDate() + 1); // exclusive upper bound
  const days = Math.round((to - from) / 86400000);
  if (days > 366 * 3) throw Object.assign(new Error('Date range cannot exceed 3 years'), { status: 400 });

  const [sales, expenses] = await Promise.all([
    Sale.find({ soldAt: { $gte: from, $lt: to } }).sort({ soldAt: -1 }),
    Expense.find({ spentAt: { $gte: from, $lt: to } })
  ]);

  // Daily buckets for ranges up to ~2 months, monthly buckets beyond that.
  const groupBy = days <= 62 ? 'day' : 'month';
  const keyOf = groupBy === 'day' ? dayKey : monthKey;
  const buckets = new Map();
  for (const d = new Date(from); d < to; groupBy === 'day' ? d.setDate(d.getDate() + 1) : d.setMonth(d.getMonth() + 1, 1)) {
    const label = groupBy === 'day'
      ? d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
      : d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
    buckets.set(keyOf(d), { key: keyOf(d), label, revenue: 0, orders: 0, cups: 0, ingredientCost: 0, expenses: 0 });
  }

  const flavourMap = {}, paymentMap = {};
  let revenue = 0, ingredientCost = 0, cups = 0;
  for (const s of sales) {
    const b = buckets.get(keyOf(s.soldAt));
    const qty = s.items.reduce((a, i) => a + i.quantity, 0);
    revenue += s.total; ingredientCost += s.totalIngredientCost || 0; cups += qty;
    if (b) { b.revenue += s.total; b.orders += 1; b.cups += qty; b.ingredientCost += s.totalIngredientCost || 0; }
    const p = paymentMap[s.paymentMethod] ||= { method: s.paymentMethod, orders: 0, revenue: 0 };
    p.orders += 1; p.revenue += s.total;
    for (const i of s.items) {
      const f = flavourMap[i.flavourName] ||= { name: i.flavourName, quantity: 0, revenue: 0, ingredientCost: 0 };
      f.quantity += i.quantity; f.revenue += i.lineTotal; f.ingredientCost += i.ingredientCost || 0;
    }
  }
  let totalExpenses = 0;
  for (const e of expenses) {
    totalExpenses += e.amount;
    const b = buckets.get(keyOf(e.spentAt));
    if (b) b.expenses += e.amount;
  }

  const series = [...buckets.values()];
  const activeDays = groupBy === 'day' ? series.filter(b => b.orders).length : new Set(sales.map(s => dayKey(s.soldAt))).size;
  const best = series.reduce((a, b) => (b.revenue > (a?.revenue || 0) ? b : a), null);
  res.json({
    from: dayKey(from), to: dayKey(toDay), days, groupBy,
    summary: {
      revenue, orders: sales.length, cups, ingredientCost,
      grossProfit: revenue - ingredientCost, expenses: totalExpenses,
      netResult: revenue - ingredientCost - totalExpenses,
      averageOrder: sales.length ? revenue / sales.length : 0,
      averagePerDay: revenue / days, activeDays,
      bestPeriod: best ? { label: best.label, revenue: best.revenue } : null
    },
    series,
    flavours: Object.values(flavourMap).sort((a, b) => b.revenue - a.revenue),
    payments: Object.values(paymentMap).sort((a, b) => b.revenue - a.revenue),
    sales: sales.slice(0, 500)
  });
});
// ---- Investments (one-time setup spending) and payback tracking ----
const investmentData = body => {
  const title = String(body.title || '').trim();
  if (!title) throw Object.assign(new Error('Title is required'), { status: 400 });
  if (body.category && !INVESTMENT_CATEGORIES.includes(body.category)) throw Object.assign(new Error('Unknown investment category'), { status: 400 });
  const amount = num(body.amount, 'Amount');
  if (amount <= 0) throw Object.assign(new Error('Amount must be greater than zero'), { status: 400 });
  return { title, category: body.category || 'Other', amount, investedAt: body.investedAt ? parseDay(body.investedAt, 'Date') : new Date(), note: body.note || '' };
};
router.get('/investments/categories', (req,res) => res.json(INVESTMENT_CATEGORIES));
router.get('/investments', async (req,res) => res.json(await Investment.find().sort({ investedAt: -1, createdAt: -1 })));
router.post('/investments', async (req,res) => res.status(201).json(await Investment.create(investmentData(req.body))));
router.put('/investments/:id', async (req,res) => {
  const item = await Investment.findByIdAndUpdate(req.params.id, investmentData(req.body), { new: true, runValidators: true });
  if (!item) throw Object.assign(new Error('Investment not found'), { status: 404 });
  res.json(item);
});
router.delete('/investments/:id', async (req,res) => {
  const item = await Investment.findByIdAndDelete(req.params.id);
  if (!item) throw Object.assign(new Error('Investment not found'), { status: 404 });
  res.json({ success: true });
});

// Payback: all-time net profit (revenue - ingredient cost - expenses) vs total invested.
router.get('/investments/summary', async (req,res) => {
  const [investments, sales, expenses] = await Promise.all([Investment.find(), Sale.find({}, { total: 1, totalIngredientCost: 1, soldAt: 1 }), Expense.find({}, { amount: 1 })]);
  const totalInvested = investments.reduce((a, i) => a + i.amount, 0);
  const revenue = sales.reduce((a, s) => a + s.total, 0);
  const ingredientCost = sales.reduce((a, s) => a + (s.totalIngredientCost || 0), 0);
  const totalExpenses = expenses.reduce((a, e) => a + e.amount, 0);
  const netProfit = revenue - ingredientCost - totalExpenses;
  const recovered = Math.max(0, Math.min(netProfit, totalInvested));
  const remaining = Math.max(0, totalInvested - netProfit);

  // Average net profit per day since the first sale, used for the break-even estimate.
  const firstSale = sales.reduce((a, s) => (!a || s.soldAt < a ? s.soldAt : a), null);
  const daysTrading = firstSale ? Math.max(1, Math.ceil((todayStart() - new Date(firstSale).setHours(0,0,0,0)) / 86400000) + 1) : 0;
  const netPerDay = daysTrading ? netProfit / daysTrading : 0;
  let breakEven = null;
  if (totalInvested > 0 && remaining === 0) breakEven = { status: 'recovered' };
  else if (totalInvested > 0 && netPerDay > 0) {
    const daysLeft = Math.ceil(remaining / netPerDay), date = todayStart(); date.setDate(date.getDate() + daysLeft);
    breakEven = { status: 'estimated', daysLeft, date: dayKey(date) };
  } else if (totalInvested > 0) breakEven = { status: daysTrading ? 'not-profitable' : 'no-sales' };

  const byCategory = {};
  investments.forEach(i => byCategory[i.category] = (byCategory[i.category] || 0) + i.amount);
  res.json({
    totalInvested, count: investments.length, revenue, ingredientCost, totalExpenses, netProfit,
    recovered, remaining, recoveredPercent: totalInvested ? (recovered / totalInvested) * 100 : 0,
    daysTrading, netPerDay, netPerMonth: netPerDay * 30, breakEven,
    byCategory: Object.entries(byCategory).map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount)
  });
});
export default router;
