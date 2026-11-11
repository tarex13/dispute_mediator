import path from 'node:path';
import { fileURLToPath } from 'node:url';

import 'dotenv/config';
import express from 'express';
import disputesLoad from './server/api/disputesLoad.js';
import context from './server/api/disputes/[id]/context.js';
import recommend from './server/api/disputes/[id]/recommend.js';
import approve from './server/api/disputes/[id]/approve.js';
import newDispute from './server/api/webhook/dispute/new.js'

const app = express();
app.use(express.json({ limit: '100kb' }));
app.all('/api/disputesLoad', disputesLoad);
app.all('/api/disputes/:id/context', context);
app.all('/api/disputes/:id/recommend', recommend);
app.all('/api/disputes/:id/approve', approve);
app.all('/api/webhook/dispute/new', newDispute);

const port = process.env.PORT || 3000;
const clientDist = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'client', 'dist');
app.use(express.static(clientDist));
app.use((req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api')) {
    return res.sendFile(path.join(clientDist, 'index.html'));
  }
  next();
});

app.listen(port, () => console.log(`API on http://localhost:${port}`));