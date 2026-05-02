const http = require("http");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "build");
const port = Number(process.env.PORT || 5173);
const types = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon"
};

http
  .createServer((req, res) => {
    const requestPath = decodeURIComponent((req.url || "/").split("?")[0]);
    let filePath = path.join(root, requestPath === "/" ? "index.html" : requestPath);

    if (!filePath.startsWith(root)) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }

    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = path.join(root, "index.html");
    }

    res.setHeader("Content-Type", types[path.extname(filePath)] || "application/octet-stream");
    fs.createReadStream(filePath).pipe(res);
  })
  .listen(port, () => {
    console.log(`CodeLift frontend running on http://localhost:${port}`);
  });
