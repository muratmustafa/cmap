import express from 'express';
import path from 'path';

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

// In production serve the built client from the dist folder.
// During development (vite dev server) we don't serve static files here.
if (process.env.NODE_ENV === 'production') {
  const staticPath = path.join(__dirname, '..', '..', 'dist');
  app.use(express.static(staticPath));

  // Fallback to index.html for SPA routing
  app.get('*', (_req, res) => {
    res.sendFile(path.join(staticPath, 'index.html'));
  });
} else {
  console.log('Server running in development mode; not serving dist/static files.');
}

app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});
