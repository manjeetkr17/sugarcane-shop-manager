import { Router } from 'express';
import mongoose from 'mongoose';
import { Ingredient, Flavour, Sale, StockMovement, Purchase, Expense } from '../models/index.js';

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
export default router;
