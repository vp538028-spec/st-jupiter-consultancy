const fs = require("fs");
const path = require("path");

const root = __dirname;
const dist = path.join(root, "dist");

// Remove dist directory if it exists
if (fs.existsSync(dist)) {
  console.log("Cleaning existing dist directory...");
  fs.rmSync(dist, { recursive: true, force: true });
}

// Create directories
fs.mkdirSync(dist, { recursive: true });
fs.mkdirSync(path.join(dist, "assets"), { recursive: true });
fs.mkdirSync(path.join(dist, "pages"), { recursive: true });

// Copy files from root to dist
const rootFiles = fs.readdirSync(root);
rootFiles.forEach((file) => {
  const filePath = path.join(root, file);
  const stat = fs.statSync(filePath);
    if (stat.isFile()) {
      const ext = path.extname(file).toLowerCase();
      if ([".html", ".css", ".js", ".json", ".xml", ".txt"].includes(ext)) {
        fs.copyFileSync(filePath, path.join(dist, file));
      }
    }
});

// Helper function to recursively copy directories
function copyDirSync(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (let entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else if (entry.isFile()) {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// Copy assets and pages recursively
if (fs.existsSync(path.join(root, "assets"))) {
  copyDirSync(path.join(root, "assets"), path.join(dist, "assets"));
}
if (fs.existsSync(path.join(root, "pages"))) {
  copyDirSync(path.join(root, "pages"), path.join(dist, "pages"));
}

// Copy .env if it exists
if (fs.existsSync(path.join(root, ".env"))) {
  fs.copyFileSync(path.join(root, ".env"), path.join(dist, ".env"));
}

console.log(`Build complete: ${dist}`);
