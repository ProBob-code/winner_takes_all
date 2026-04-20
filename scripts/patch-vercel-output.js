const fs = require('fs');
const path = require('path');

// The Vercel build output generates /_error and /_not-found as Node.js serverless
// functions. These are Pages Router system stubs that Next.js 15 creates automatically.
// They conflict with @cloudflare/next-on-pages which requires ALL functions to be edge.
//
// Since we have proper App Router handlers (error.tsx, global-error.tsx, not-found.tsx),
// these stubs are redundant. Removing them lets next-on-pages proceed.

const outputDir = path.join(__dirname, '../apps/web/.vercel/output/functions');

const routesToRemove = ['_error.func', '_not-found.func'];

for (const route of routesToRemove) {
  const routePath = path.join(outputDir, route);
  if (fs.existsSync(routePath)) {
    fs.rmSync(routePath, { recursive: true });
    console.log(`Removed ${route} from Vercel output (handled by App Router)`);
  } else {
    console.log(`${route} not found in output, skipping`);
  }
}

console.log('Vercel output patched successfully');
