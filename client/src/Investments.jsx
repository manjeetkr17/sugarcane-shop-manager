import React,{useEffect,useState} from 'react';
import { Landmark, PiggyBank, Target, CalendarCheck, Plus, Pencil, Trash2, X } from 'lucide-react';
import {api} from './api';

const money=n=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}).format(n||0);
const ymd=d=>{d=new Date(d);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
const fmtDate=d=>new Date(d).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'});
const plural=(n,w)=>`${n} ${w}${n===1?'':'s'}`;
const duration=d=>d<60?plural(d,'day'):d<730?plural(Math.round(d/30.44),'month'):plural(Math.round(d/365.25),'year');
const blank=()=>({title:'',category:'Juice machine',amount:'',investedAt:ymd(new Date()),note:''});

export default function Investments({notify}){
 const [items,setItems]=useState([]),[summary,setSummary]=useState(null),[categories,setCategories]=useState([]);
 const [form,setForm]=useState(blank()),[editing,setEditing]=useState(null);
 const [loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState('');

 const load=async()=>{try{const [i,s,c]=await Promise.all([api.get('/investments'),api.get('/investments/summary'),api.get('/investments/categories')]);setItems(i);setSummary(s);setCategories(c)}catch(e){setError(e.message)}finally{setLoading(false)}};
 useEffect(()=>{load()},[]);

 const reset=()=>{setForm(blank());setEditing(null)};
 const save=async e=>{e.preventDefault();setSaving(true);setError('');
  try{editing?await api.put(`/investments/${editing}`,form):await api.post('/investments',form);reset();await load();notify?.(editing?'Investment updated':'Investment added')}
  catch(err){setError(err.message)}finally{setSaving(false)}};
 const edit=i=>{setEditing(i._id);setForm({title:i.title,category:i.category,amount:i.amount,investedAt:ymd(i.investedAt),note:i.note||''});window.scrollTo({top:0,behavior:'smooth'})};
 const remove=async i=>{if(!window.confirm(`Delete "${i.title}" (${money(i.amount)})?`))return;
  try{await api.del(`/investments/${i._id}`);if(editing===i._id)reset();await load();notify?.('Investment deleted')}catch(err){setError(err.message)}};

 if(loading)return <div className="loading">Loading investments…</div>;
 const s=summary||{},b=s.breakEven;
 const breakEvenText=!b?['—','Add your first investment']:
  b.status==='recovered'?['Recovered ✓','Your investment has been earned back']:
  b.status==='estimated'?[fmtDate(b.date),`About ${duration(b.daysLeft)} at ${money(s.netPerMonth)}/month net`]:
  b.status==='no-sales'?['—','Record sales to get an estimate']:['Not yet','Net profit so far is not positive'];
 const pct=Math.min(100,s.recoveredPercent||0);

 return <section className="content">
  <div className="stats-grid">{[
   ['Total invested',money(s.totalInvested),`${s.count||0} item${s.count===1?'':'s'}`,Landmark],
   ['Recovered so far',money(s.recovered),`Net profit to date ${money(s.netProfit)}`,PiggyBank],
   ['Still to recover',money(s.remaining),`${pct.toFixed(0)}% recovered`,Target],
   ['Break-even',breakEvenText[0],breakEvenText[1],CalendarCheck]
  ].map(([t,v,sub,I])=><div className="stat-card" key={t}><div className="stat-top"><span>{t}</span><span className="stat-icon"><I size={18}/></span></div><strong>{v}</strong><small>{sub}</small></div>)}</div>

  <div className="panel"><div className="panel-head"><div><h3>Payback progress</h3><p>Net profit (revenue − ingredient cost − expenses) compared with total investment</p></div><span className="subtle-tag">{pct.toFixed(0)}%</span></div>
   <div className="progress"><div className="progress-fill" style={{width:`${pct}%`}}/></div>
   <div className="progress-legend"><span>{money(s.recovered)} recovered</span><span>{money(s.totalInvested)} invested</span></div>
   {s.daysTrading>0&&<small className="muted">Based on {s.daysTrading} day{s.daysTrading===1?'':'s'} since your first sale: revenue {money(s.revenue)}, ingredient cost {money(s.ingredientCost)}, expenses {money(s.totalExpenses)}. Average net {money(s.netPerDay)} per day.</small>}
  </div>

  {error&&<div className="alert error inline">{error}<button onClick={()=>setError('')}>Dismiss</button></div>}
  <div className="two-col">
   <form className="panel form-panel" onSubmit={save}>
    <div className="panel-head"><div><h3>{editing?'Edit investment':'Add investment'}</h3><p>One-time spending to set up the shop.</p></div>{editing&&<button type="button" className="text-button" onClick={reset}><X size={13}/> Cancel</button>}</div>
    <label>What did you buy or pay for?<input required value={form.title} onChange={e=>setForm({...form,title:e.target.value})} placeholder="e.g. Sugarcane crushing machine"/></label>
    <div className="form-row">
     <label>Category<select value={form.category} onChange={e=>setForm({...form,category:e.target.value})}>{categories.map(c=><option key={c}>{c}</option>)}</select></label>
     <label>Amount (₹)<input required type="number" min="1" step="any" value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})}/></label>
    </div>
    <label>Date<input required type="date" value={form.investedAt} max={ymd(new Date())} onChange={e=>setForm({...form,investedAt:e.target.value})}/></label>
    <label>Note<input value={form.note} onChange={e=>setForm({...form,note:e.target.value})} placeholder="Optional — seller, warranty, bill no."/></label>
    <small className="muted">Monthly rent, electricity and wages go in <b>Purchases → Record expense</b>. Only one-time costs such as a rent deposit belong here.</small>
    <button className="primary" disabled={saving}>{editing?'Save changes':<><Plus size={16}/> Add investment</>}</button>
   </form>
   <div className="panel"><div className="panel-head"><div><h3>By category</h3><p>Where your money went</p></div></div>
    {s.byCategory?.length?s.byCategory.map(c=><div className="cat-row" key={c.category}><div className="cat-top"><b>{c.category}</b><span>{money(c.amount)} · {Math.round(c.amount/s.totalInvested*100)}%</span></div><div className="progress thin"><div className="progress-fill" style={{width:`${c.amount/s.totalInvested*100}%`}}/></div></div>)
    :<div className="empty-state"><Landmark size={25}/><b>No investments yet</b><small>Add your machine, freezer, deposit and other setup costs.</small></div>}
   </div>
  </div>

  <div className="panel"><div className="panel-head"><div><h3>All investments</h3><p>{items.length} recorded</p></div></div>
   {items.length?<div className="table-wrap"><table><thead><tr><th>Date</th><th>Item</th><th>Category</th><th>Amount</th><th>Note</th><th></th></tr></thead><tbody>{items.map(i=><tr key={i._id} className={editing===i._id?'editing':''}><td>{fmtDate(i.investedAt)}</td><td><b>{i.title}</b></td><td>{i.category}</td><td><b>{money(i.amount)}</b></td><td>{i.note}</td><td className="row-actions"><button className="remove" title="Edit" onClick={()=>edit(i)}><Pencil size={15}/></button><button className="remove" title="Delete" onClick={()=>remove(i)}><Trash2 size={15}/></button></td></tr>)}</tbody><tfoot><tr><td colSpan={3}><b>Total</b></td><td><b>{money(s.totalInvested)}</b></td><td colSpan={2}/></tr></tfoot></table></div>
   :<div className="empty-state">Investments you add will be listed here.</div>}
  </div>
 </section>;
}
