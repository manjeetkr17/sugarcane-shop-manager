import React,{useEffect,useState} from 'react';
import { CalendarRange, TrendingUp, ShoppingCart, Receipt, ChartNoAxesCombined } from 'lucide-react';
import { BarChart,Bar,XAxis,YAxis,Tooltip,ResponsiveContainer,CartesianGrid } from 'recharts';
import {api} from './api';

const money=n=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}).format(n||0);
const ymd=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const monthRange=(y,m)=>({from:ymd(new Date(y,m,1)),to:ymd(new Date(y,m+1,0))});
const lastDays=n=>{const t=new Date();const f=new Date(t);f.setDate(t.getDate()-(n-1));return {from:ymd(f),to:ymd(t)}};
const presets=[
 ['Today',()=>lastDays(1)],
 ['Last 7 days',()=>lastDays(7)],
 ['Last 30 days',()=>lastDays(30)],
 ['This month',()=>{const t=new Date();return monthRange(t.getFullYear(),t.getMonth())}],
 ['Last month',()=>{const t=new Date();return monthRange(t.getFullYear(),t.getMonth()-1)}],
 ['This year',()=>{const t=new Date();return {from:`${t.getFullYear()}-01-01`,to:ymd(t)}}]
];

export default function SalesReport(){
 const init=presets[3][1]();
 const [mode,setMode]=useState('This month'),[range,setRange]=useState(init),[draft,setDraft]=useState(init);
 const [month,setMonth]=useState(init.from.slice(0,7));
 const [report,setReport]=useState(null),[loading,setLoading]=useState(false),[error,setError]=useState('');

 useEffect(()=>{let live=true;setLoading(true);setError('');
  api.get(`/reports/sales?from=${range.from}&to=${range.to}`).then(r=>live&&setReport(r)).catch(e=>live&&setError(e.message)).finally(()=>live&&setLoading(false));
  return()=>{live=false}},[range.from,range.to]);

 const pick=(name,fn)=>{const r=fn();setMode(name);setRange(r);setDraft(r);setMonth(r.from.slice(0,7))};
 const pickMonth=v=>{if(!v)return;const [y,m]=v.split('-').map(Number);const r=monthRange(y,m-1);setMonth(v);setMode('Month');setRange(r);setDraft(r)};
 const applyCustom=e=>{e.preventDefault();if(draft.from>draft.to)return setError('From date must be on or before To date');setMode('Custom');setRange({...draft})};

 const s=report?.summary;
 const fmtDate=d=>new Date(d+'T00:00:00').toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'});
 return <section className="content">
  <div className="panel report-filters">
   <div className="panel-head"><div><h3>Report period</h3><p>{fmtDate(range.from)} – {fmtDate(range.to)}{report?` · ${report.days} day${report.days>1?'s':''}`:''}</p></div><span className="subtle-tag"><CalendarRange size={12}/> {mode.toUpperCase()}</span></div>
   <div className="preset-row">{presets.map(([name,fn])=><button key={name} className={`chip ${mode===name?'active':''}`} onClick={()=>pick(name,fn)}>{name}</button>)}</div>
   <div className="filter-row">
    <label>Select month<input type="month" value={month} onChange={e=>pickMonth(e.target.value)}/></label>
    <form className="custom-range" onSubmit={applyCustom}>
     <label>From<input type="date" required value={draft.from} max={draft.to} onChange={e=>setDraft({...draft,from:e.target.value})}/></label>
     <label>To<input type="date" required value={draft.to} min={draft.from} onChange={e=>setDraft({...draft,to:e.target.value})}/></label>
     <button className="primary">Apply</button>
    </form>
   </div>
  </div>
  {error&&<div className="alert error inline">{error}<button onClick={()=>setError('')}>Dismiss</button></div>}
  {loading&&!report?<div className="loading">Loading report…</div>:report&&<div style={{opacity:loading?.55:1,transition:'opacity .15s'}}>
   <div className="stats-grid">{[
    ['Revenue',money(s.revenue),`${money(s.averagePerDay)} average per day`,TrendingUp],
    ['Orders',s.orders,`${s.cups} drinks · ${s.activeDays} active day${s.activeDays===1?'':'s'}`,ShoppingCart],
    ['Average order',money(s.averageOrder),'Revenue per order',Receipt],
    ['Gross profit',money(s.grossProfit),`Net ${money(s.netResult)} after ${money(s.expenses)} expenses`,ChartNoAxesCombined]
   ].map(([t,v,sub,I])=><div className="stat-card" key={t}><div className="stat-top"><span>{t}</span><span className="stat-icon"><I size={18}/></span></div><strong>{v}</strong><small>{sub}</small></div>)}</div>
   <div className="panel"><div className="panel-head"><div><h3>Revenue by {report.groupBy}</h3><p>{s.bestPeriod?.revenue?`Best ${report.groupBy}: ${s.bestPeriod.label} · ${money(s.bestPeriod.revenue)}`:'No sales in this period'}</p></div><span className="subtle-tag">{report.groupBy==='day'?'DAILY':'MONTHLY'}</span></div>
    <div className="chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={report.series}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#edf1ed"/><XAxis dataKey="label" axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={12}/><YAxis axisLine={false} tickLine={false} tickFormatter={v=>`₹${v}`}/><Tooltip formatter={(v,n)=>[money(v),n==='revenue'?'Revenue':n]} labelFormatter={(l,p)=>`${l}${p?.[0]?` · ${p[0].payload.orders} orders`:''}`}/><Bar dataKey="revenue" fill="#26965b" radius={[6,6,0,0]}/></BarChart></ResponsiveContainer></div>
   </div>
   <div className="two-col">
    <div className="panel"><div className="panel-head"><div><h3>Flavour performance</h3><p>Units and revenue in this period</p></div></div>{report.flavours.length?<div className="table-wrap"><table><thead><tr><th>Flavour</th><th>Sold</th><th>Revenue</th><th>Gross profit</th><th>Share</th></tr></thead><tbody>{report.flavours.map(f=><tr key={f.name}><td><b>{f.name}</b></td><td>{f.quantity}</td><td>{money(f.revenue)}</td><td>{money(f.revenue-f.ingredientCost)}</td><td>{s.revenue?Math.round(f.revenue/s.revenue*100):0}%</td></tr>)}</tbody></table></div>:<div className="empty-state">No flavours sold in this period.</div>}</div>
    <div className="panel"><div className="panel-head"><div><h3>Payment methods</h3><p>How customers paid</p></div></div>{report.payments.length?report.payments.map(p=><div className="rank-row" key={p.method}><b className="grow">{p.method}</b><span>{p.orders} orders · {money(p.revenue)}</span></div>):<div className="empty-state">No payments in this period.</div>}</div>
   </div>
   <div className="panel"><div className="panel-head"><div><h3>{report.groupBy==='day'?'Daily':'Monthly'} breakdown</h3><p>Revenue, cost and expenses per {report.groupBy}</p></div></div><div className="table-wrap"><table><thead><tr><th>{report.groupBy==='day'?'Date':'Month'}</th><th>Orders</th><th>Drinks</th><th>Revenue</th><th>Ingredient cost</th><th>Expenses</th><th>Net</th></tr></thead><tbody>{[...report.series].reverse().filter(b=>b.orders||b.expenses).map(b=><tr key={b.key}><td><b>{b.label}</b></td><td>{b.orders}</td><td>{b.cups}</td><td>{money(b.revenue)}</td><td>{money(b.ingredientCost)}</td><td>{money(b.expenses)}</td><td><b>{money(b.revenue-b.ingredientCost-b.expenses)}</b></td></tr>)}</tbody><tfoot><tr><td><b>Total</b></td><td><b>{s.orders}</b></td><td><b>{s.cups}</b></td><td><b>{money(s.revenue)}</b></td><td><b>{money(s.ingredientCost)}</b></td><td><b>{money(s.expenses)}</b></td><td><b>{money(s.netResult)}</b></td></tr></tfoot></table></div></div>
   <div className="panel"><div className="panel-head"><div><h3>Sales in period</h3><p>{report.sales.length<s.orders?`Showing latest ${report.sales.length} of ${s.orders}`:`${s.orders} orders`}</p></div></div>{report.sales.length?<div className="table-wrap report-sales"><table><thead><tr><th>Date / time</th><th>Items</th><th>Payment</th><th>Total</th></tr></thead><tbody>{report.sales.map(x=><tr key={x._id}><td>{new Date(x.soldAt).toLocaleString('en-IN')}</td><td>{x.items.map(i=>`${i.quantity} × ${i.flavourName}`).join(', ')}</td><td>{x.paymentMethod}</td><td><b>{money(x.total)}</b></td></tr>)}</tbody></table></div>:<div className="empty-state">No sales recorded in this period.</div>}</div>
  </div>}
 </section>;
}
