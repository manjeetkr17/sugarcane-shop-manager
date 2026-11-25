import mongoose from 'mongoose';
const { Schema, model } = mongoose;

const ingredientSchema = new Schema({
  name: { type: String, required: true, trim: true, unique: true },
  unit: { type: String, required: true, default: 'piece' },
  stock: { type: Number, default: 0, min: 0 },
  reorderLevel: { type: Number, default: 0, min: 0 },
  unitCost: { type: Number, default: 0, min: 0 },
  active: { type: Boolean, default: true }
}, { timestamps: true });

const flavourSchema = new Schema({
  name: { type: String, required: true, trim: true, unique: true },
  description: String,
  price: { type: Number, required: true, min: 0 },
  active: { type: Boolean, default: true },
  recipe: [{ ingredient: { type: Schema.Types.ObjectId, ref: 'Ingredient', required: true }, quantity: { type: Number, required: true, min: 0 } }]
}, { timestamps: true });

const saleSchema = new Schema({
  items: [{
    flavour: { type: Schema.Types.ObjectId, ref: 'Flavour' },
    flavourName: String,
    quantity: Number,
    unitPrice: Number,
    lineTotal: Number,
    ingredientCost: Number
  }],
  total: Number,
  totalIngredientCost: Number,
  paymentMethod: { type: String, enum: ['Cash', 'UPI', 'Card', 'Other'], default: 'Cash' },
  note: String,
  soldAt: { type: Date, default: Date.now }
}, { timestamps: true });

const movementSchema = new Schema({
  ingredient: { type: Schema.Types.ObjectId, ref: 'Ingredient', required: true },
  ingredientName: String,
  type: { type: String, enum: ['Purchase', 'Sale', 'Wastage', 'Adjustment'], required: true },
  quantity: Number,
  balanceAfter: Number,
  unit: String,
  reference: String,
  note: String,
  occurredAt: { type: Date, default: Date.now }
}, { timestamps: true });

const purchaseSchema = new Schema({
  ingredient: { type: Schema.Types.ObjectId, ref: 'Ingredient', required: true },
  ingredientName: String,
  quantity: Number,
  totalCost: Number,
  purchasedAt: { type: Date, default: Date.now },
  supplier: String,
  note: String
}, { timestamps: true });

const expenseSchema = new Schema({
  category: { type: String, required: true },
  amount: { type: Number, required: true, min: 0 },
  note: String,
  spentAt: { type: Date, default: Date.now }
}, { timestamps: true });

export const INVESTMENT_CATEGORIES = ['Juice machine', 'Refrigerator / freezer', 'Furniture & fixtures', 'Utensils & equipment', 'Shop setup / renovation', 'Rent deposit / advance', 'Other'];
const investmentSchema = new Schema({
  title: { type: String, required: true, trim: true },
  category: { type: String, enum: INVESTMENT_CATEGORIES, default: 'Other' },
  amount: { type: Number, required: true, min: 0 },
  investedAt: { type: Date, default: Date.now },
  note: String
}, { timestamps: true });

export const Ingredient = model('Ingredient', ingredientSchema);
export const Flavour = model('Flavour', flavourSchema);
export const Sale = model('Sale', saleSchema);
export const StockMovement = model('StockMovement', movementSchema);
export const Purchase = model('Purchase', purchaseSchema);
export const Expense = model('Expense', expenseSchema);
export const Investment = model('Investment', investmentSchema);
