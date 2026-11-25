import 'dotenv/config';
import express from 'express';
import 'express-async-errors'; // forward errors thrown in async route handlers to errorHandler
import cors from 'cors';
import morgan from 'morgan';
import { connectDB } from './config/db.js';
import api from './routes/api.js';
import { notFound, errorHandler } from './middleware/errorHandler.js';

const app = express();
app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173' }));
app.use(express.json({ limit: '1mb' }));
app.use(morgan('dev'));
app.use('/api', api);
app.use(notFound);
app.use(errorHandler);

const port = process.env.PORT || 5000;
connectDB().then(() => app.listen(port, () => console.log(`API listening on http://localhost:${port}`))).catch(err => {
  console.error('Startup failed:', err.message);
  process.exit(1);
});
