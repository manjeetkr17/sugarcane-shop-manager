import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from './config/db.js';
import { Ingredient, Flavour } from './models/index.js';

await connectDB();
if (await Ingredient.countDocuments() === 0) {
  const rows = await Ingredient.insertMany([
    {name:'Sugarcane',unit:'kg',stock:40,reorderLevel:10,unitCost:30},
    {name:'Lemon',unit:'piece',stock:30,reorderLevel:8,unitCost:4},
    {name:'Ginger',unit:'kg',stock:1,reorderLevel:0.25,unitCost:180},
    {name:'Mint',unit:'kg',stock:0.5,reorderLevel:0.15,unitCost:200},
    {name:'Ice',unit:'kg',stock:10,reorderLevel:3,unitCost:15},
    {name:'Cup',unit:'piece',stock:300,reorderLevel:75,unitCost:1.5},
    {name:'Straw',unit:'piece',stock:300,reorderLevel:75,unitCost:0.3}
  ]);
  const byName=Object.fromEntries(rows.map(x=>[x.name,x._id]));
  await Flavour.insertMany([
    {name:'Classic',price:30,description:'Fresh sugarcane juice',recipe:[{ingredient:byName.Sugarcane,quantity:0.35},{ingredient:byName.Cup,quantity:1},{ingredient:byName.Straw,quantity:1},{ingredient:byName.Ice,quantity:0.08}]},
    {name:'Lemon',price:40,description:'Sugarcane with lemon',recipe:[{ingredient:byName.Sugarcane,quantity:0.35},{ingredient:byName.Lemon,quantity:0.5},{ingredient:byName.Cup,quantity:1},{ingredient:byName.Straw,quantity:1},{ingredient:byName.Ice,quantity:0.08}]},
    {name:'Ginger',price:40,description:'Sugarcane with ginger',recipe:[{ingredient:byName.Sugarcane,quantity:0.35},{ingredient:byName.Ginger,quantity:0.005},{ingredient:byName.Cup,quantity:1},{ingredient:byName.Straw,quantity:1},{ingredient:byName.Ice,quantity:0.08}]},
    {name:'Mint',price:45,description:'Sugarcane with mint',recipe:[{ingredient:byName.Sugarcane,quantity:0.35},{ingredient:byName.Mint,quantity:0.005},{ingredient:byName.Cup,quantity:1},{ingredient:byName.Straw,quantity:1},{ingredient:byName.Ice,quantity:0.08}]}
  ]);
  console.log('Seeded sample ingredients and flavours.');
} else console.log('Database already contains ingredients; seed skipped.');
await mongoose.disconnect();
