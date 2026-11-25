# Sugarcane Shop Manager

A localhost-ready MVP for managing a sugarcane juice shop. It includes a React dashboard, Node.js/Express API, MongoDB persistence, recipe-based ingredient deduction, purchase and stock adjustments, sales, expenses, and business analytics.

## Features

- Dashboard: today's revenue, orders, estimated gross profit, low-stock count, sales trend, and best-selling flavours.
- Product/flavour setup with selling price and configurable recipe quantities.
- Raw-material inventory with units, opening stock, reorder levels, and current stock.
- Purchases: add stock and retain purchase history/cost.
- Sales: record multiple drinks in one order; stock is deducted from recipes automatically.
- Expenses: record operating expenses.
- Stock adjustments and wastage: keep an auditable stock movement history.
- Analytics: sales by flavour, ingredient usage, estimated gross profit, and daily sales.
- Sales report: revenue, orders, profit, flavour and payment-method breakdowns for any month or custom date range, with daily or monthly charts.
- Investments: record one-time setup spending (machine, freezer, furniture, rent deposit, etc.) and track how much has been earned back, with a break-even estimate.
- Low-stock alerts based on reorder levels.
- Seed data for a quick first run.

## Technology

- Frontend: React + Vite
- Backend: Node.js + Express
- Database: MongoDB + Mongoose
- Charts: Recharts
- Async error handling: `express-async-errors` (errors thrown in async route handlers are returned as JSON with the correct status code)

## Requirements

- Node.js 20 or newer (18.18+ should also work)
- npm
- MongoDB Community Server running locally, or a MongoDB Atlas connection string

## Quick start

### 1. Start MongoDB

For a local MongoDB installation, ensure the MongoDB service is running. The default connection string is:

`mongodb://127.0.0.1:27017/sugarcane_shop`

### 2. Configure and start the backend

```bash
cd server
cp .env.example .env
npm install
npm run seed
npm run dev
```

The API runs at `http://localhost:5000`.

### 3. Configure and start the frontend

Open a second terminal:

```bash
cd client
npm install
npm run dev
```

Open `http://localhost:5173`.

The Vite development server proxies `/api` requests to the backend.

## Project structure

```text
sugarcane-shop/
├── README.md
├── server/
│   ├── .env.example
│   ├── package.json
│   └── src/
│       ├── config/db.js
│       ├── models/
│       ├── routes/
│       ├── middleware/errorHandler.js
│       ├── seed.js
│       └── index.js
└── client/
    ├── index.html
    ├── package.json
    ├── vite.config.js
    └── src/
        ├── api.js
        ├── main.jsx
        ├── App.jsx
        ├── SalesReport.jsx
        ├── Investments.jsx
        └── styles.css
```

## Main workflows

### Set up ingredients

Open **Inventory** and add ingredients such as sugarcane, lemon, ginger, mint, ice, cups, and straws. Choose a consistent unit for each ingredient (for example, kg, g, ml, piece). Set the reorder level to receive low-stock warnings.

### Configure flavours and recipes

Open **Flavours** and create each drink. Add the quantity of each ingredient consumed per serving. Example: a 300 ml classic drink might consume 0.35 kg raw sugarcane, 0.3 piece cup, and 0.3 piece straw. These are example values only; measure your actual yield and serving sizes.

**Important:** Recipe quantities and ingredient stock must use the same unit. The app does not automatically convert kg to grams or litres to millilitres. If you store sugarcane in kg, enter recipe usage in kg.

### Record a sale

Open **New Sale**, add one or more flavours and quantities, then save. The backend calculates the order total and deducts recipe ingredients in a MongoDB transaction. If MongoDB is running as a standalone server without transaction support, sales may fail because multi-document stock changes are transactional. Use a single-node replica set for local development if needed (see below).

### Record a purchase

Open **Purchases**, choose an ingredient, enter quantity and total cost. Stock is increased and a purchase movement is recorded.

### View sales over a period

Open **Sales Report**. Choose a period in one of three ways:

- **Quick buttons:** Today, Last 7 days, Last 30 days, This month (default), Last month, This year.
- **Select month:** pick any month to see that whole month.
- **Custom range:** set From and To dates and click **Apply**. Both dates are included.

The report shows summary cards (revenue, average per day, orders, drinks sold, active days, average order, gross profit and net after expenses), a revenue chart, flavour performance, payment methods, a per-day or per-month breakdown with totals, and the list of sales in the period (latest 500).

Ranges of up to 62 days are grouped by day; longer ranges are grouped by month. The maximum range is 3 years. Dates use the server's local time zone.

### Track investments and payback

Open **Investments** and add each one-time cost of setting up the shop: title, category, amount, date and an optional note. Categories are Juice machine, Refrigerator / freezer, Furniture & fixtures, Utensils & equipment, Shop setup / renovation, Rent deposit / advance, and Other. Entries can be edited or deleted from the table.

The page shows:

- **Total invested**, **recovered so far**, **still to recover**, and a **break-even** estimate.
- A payback progress bar and a breakdown by category.

What counts where:

- **Investments:** one-time costs, such as a machine, a freezer or a rent deposit.
- **Expenses** (Purchases → Record expense): recurring costs, such as monthly rent, electricity and wages.
- **Purchases:** ingredient stock, including opening stock. Its cost is already counted through each sale's ingredient cost, so don't add it as an investment too.

### Record wastage or correction

Open **Inventory**, use the stock adjustment form and select `Wastage` or `Adjustment`. Wastage reduces stock; a positive adjustment increases it. The reason is saved in the stock movement history.

## MongoDB transaction note

For reliable atomic sales and stock deduction, MongoDB transactions are used. Transactions require a replica set, including for local development.

A simple local single-node replica set can be started with:

```bash
mongod --dbpath ./mongo-data --replSet rs0
```

In another terminal, initialize it once:

```bash
mongosh
```

```javascript
rs.initiate()
```

Then keep `MONGO_URI=mongodb://127.0.0.1:27017/sugarcane_shop?replicaSet=rs0` in `server/.env`.

If you already run MongoDB as a replica set or use Atlas, no extra setup is required.

## API overview

Base URL: `http://localhost:5000/api`

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/health` | Health check |
| GET | `/dashboard` | Dashboard summary |
| GET/POST | `/ingredients` | List/create ingredients |
| PUT/DELETE | `/ingredients/:id` | Update/delete ingredient |
| POST | `/ingredients/:id/adjust` | Record wastage/adjustment |
| GET/POST | `/flavours` | List/create flavours |
| PUT/DELETE | `/flavours/:id` | Update/delete flavour |
| GET/POST | `/sales` | List/create sales |
| GET | `/purchases` | Purchase history |
| POST | `/purchases` | Add purchase |
| GET/POST | `/expenses` | List/create expenses |
| GET | `/analytics` | Analytics data |
| GET | `/reports/sales?from=YYYY-MM-DD&to=YYYY-MM-DD` | Sales report for an inclusive date range |
| GET/POST | `/investments` | List/create investments |
| PUT/DELETE | `/investments/:id` | Update/delete an investment |
| GET | `/investments/categories` | Allowed investment categories |
| GET | `/investments/summary` | Total invested, amount recovered, break-even estimate, category breakdown |

### Sales report response

`GET /reports/sales?from=2026-11-01&to=2026-11-30` returns:

- `from`, `to`, `days`, `groupBy` (`day` for ranges up to 62 days, otherwise `month`)
- `summary`: `revenue`, `orders`, `cups`, `ingredientCost`, `grossProfit`, `expenses`, `netResult`, `averageOrder`, `averagePerDay`, `activeDays`, `bestPeriod`
- `series`: one entry per day or month with `label`, `revenue`, `orders`, `cups`, `ingredientCost`, `expenses`
- `flavours`, `payments`: breakdowns sorted by revenue
- `sales`: up to 500 most recent sales in the range

Invalid dates, a To date before the From date, or a range over 3 years return `400` with a `message`.

## Business logic and assumptions

- Sales revenue is based on the selling price saved on each sale line at the time of sale.
- Ingredient stock is deducted using the flavour recipe saved at the time the sale is submitted.
- Estimated ingredient cost uses each ingredient's `unitCost` at sale time. This is a practical MVP estimate, not a full weighted-average costing ledger.
- Gross profit = sales revenue minus estimated recipe ingredient cost.
- Net operating result = gross profit minus recorded expenses.
- Investment recovered = all-time net operating result, capped at the total invested. Still to recover = total invested minus net operating result.
- Break-even estimate = still to recover ÷ average net operating result per day, where the average is taken over the days since the first sale (including today). It is shown only while that average is positive, and it becomes more reliable after a few weeks of trading.
- Investments are not depreciated and do not affect gross profit or the sales report.
- Taxes, GST invoicing, refunds, discounts, supplier credit, staff roles, barcode printing, and multi-outlet support are not included in this MVP.
- This is a single-shop local application with no login. Do not expose it to the public internet without adding authentication, authorization, validation hardening, backups, and HTTPS.

## Backup

Back up the MongoDB database regularly. Example:

```bash
mongodump --uri="mongodb://127.0.0.1:27017/sugarcane_shop?replicaSet=rs0" --out=./backup
```

Restore with:

```bash
mongorestore --uri="mongodb://127.0.0.1:27017/sugarcane_shop?replicaSet=rs0" ./backup/sugarcane_shop
```

## Troubleshooting

- **Cannot connect to MongoDB:** confirm the service is running and `MONGO_URI` is correct.
- **Transaction numbers are only allowed on a replica set:** configure a local single-node replica set as described above.
- **Frontend cannot reach API:** confirm the backend is running on port 5000.
- **No charts/data:** run `npm run seed` from `server` after MongoDB is ready. Seeding is safe to rerun for an empty database; it does not overwrite existing records.

## Suggested next improvements

1. Add user login and cashier/admin roles.
2. Add purchase supplier management and weighted-average ingredient costing.
3. Add configurable cup sizes and recipe variants.
4. Add refunds/voids with stock reversal.
5. Add daily closing and cash/UPI reconciliation.
6. Add GST-ready invoices and exports.
7. Add WhatsApp alerts and daily sales summaries.
8. Add demand forecasting after several weeks of real sales history.
