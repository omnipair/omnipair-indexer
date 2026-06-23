import path from 'path';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import dotenv from 'dotenv';
import routes from './routes';
import { errorHandler, notFound } from './middleware/errorHandler';
import { perfMetrics } from './utils/perfMetrics';

dotenv.config();

const app = express();

app.set('trust proxy', 2);

app.use('/docs-assets', express.static(path.join(__dirname, '../public')));

app.use(compression());
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true
}));

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const cfIp = req.headers['cf-connecting-ip'];
    if (typeof cfIp === 'string') return ipKeyGenerator(cfIp);
    return ipKeyGenerator(req.ip || req.socket.remoteAddress || 'unknown');
  },
  message: { success: false, error: 'Too many requests, please try again later.' },
});
app.use(limiter);

//safety for future proofing
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));

app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

perfMetrics.ensureReporting(60_000);

app.use('/', routes);

app.use(notFound);
app.use(errorHandler);

export default app;
