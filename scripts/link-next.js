const fs = require('fs');
const path = require('path');

const targetPath = path.join(__dirname, '../apps/web/node_modules/next');
const sourcePath = path.join(__dirname, '../node_modules/next');

if (!fs.existsSync(targetPath)) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  try {
    // Attempt junction first for Windows users running builds locally
    fs.symlinkSync(sourcePath, targetPath, 'junction');
    console.log("Successfully linked hoisted next package to apps/web for OpenNext");
  } catch (e) {
    try {
      // Fallback for Linux environments like Cloudflare
      fs.symlinkSync(sourcePath, targetPath, 'dir');
      console.log("Successfully linked hoisted next package to apps/web for OpenNext");
    } catch (e2) {
      console.warn("Could not create symlink, OpenNext build may fail. Error: " + e2.message);
    }
  }
}
