// Copies the backend's JSON config into the app bundle (used by the standalone Android engine).
const fs = require("fs");
const path = require("path");
const src = path.join(__dirname, "..", "..", "json");
const dst = path.join(__dirname, "..", "src", "data");
fs.mkdirSync(dst, { recursive: true });
for (const f of ["links.json", "places.json", "keywords.json", "rehamna.json", "classifier.json"]) {
  fs.copyFileSync(path.join(src, f), path.join(dst, f));
}
console.log("Copied feed/keyword data into src/data");
