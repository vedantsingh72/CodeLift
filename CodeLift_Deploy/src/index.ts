import http from "node:http";
import { createClient } from "redis";
import { copyBuildOutputToS3, downloadS3Folder } from "./download.js";
import { buildProject } from "./utils.js";

const redisUrl = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";

/**
 * Render (and similar) Web Services probe for an open TCP port on $PORT.
 * This worker does not serve user traffic; we only expose a tiny health check.
 * Alternatively, create a Render **Background Worker** and omit PORT / this server.
 */
function startHealthServerIfNeeded() {
  const raw = process.env.PORT;
  if (!raw) {
    return;
  }

  const port = Number(raw);
  if (!Number.isFinite(port) || port <= 0) {
    console.warn("Ignoring invalid PORT:", raw);
    return;
  }

  const server = http.createServer((req, res) => {
    const path = req.url?.split("?")[0] ?? "/";
    if (req.method === "GET" && (path === "/" || path === "/health")) {
      res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("ok");
      return;
    }
    res.writeHead(404);
    res.end();
  });

  server.listen(port, "0.0.0.0", () => {
    console.log(`Health check listening on http://0.0.0.0:${port} (GET / or /health)`);
  });
}
const subscriber = createClient({ url: redisUrl });
const statusClient = createClient({ url: redisUrl });

subscriber.on("error", (err) => {
  console.error("Redis connection error:", err.message);
});

statusClient.on("error", (err) => {
  console.error("Redis status connection error:", err.message);
});

function getProjectId(prefix: string) {
  const normalizedPrefix = prefix.replaceAll("\\", "/");
  const parts = normalizedPrefix.split("/").filter(Boolean);
  return parts.at(-1) ?? "unknown";
}

async function main() {
  await subscriber.connect();
  await statusClient.connect();
  console.log(`Connected to Redis at ${redisUrl}`);
  console.log("Waiting for build jobs...");

  while (true) {
    const response = await subscriber.brPop("build-queue", 0);

    if (!response) {
      continue;
    }

    console.log("Received build job:", response.element);
    const projectId = getProjectId(response.element);

    try {
      await statusClient.hSet("status", projectId, "downloading");
      const downloadedFiles = await downloadS3Folder(response.element, projectId);

      if (downloadedFiles === 0) {
        console.log("No source files downloaded for project:", projectId);
        await statusClient.hSet("status", projectId, "failed");
        continue;
      }

      await statusClient.hSet("status", projectId, "building");
      const staticOutputDirs = await buildProject(projectId);

      if (staticOutputDirs.length === 0) {
        console.log("No generated output to upload for project:", projectId);
        await statusClient.hSet("status", projectId, "failed");
        continue;
      }

      await statusClient.hSet("status", projectId, "uploading");
      const uploadedFiles = await copyBuildOutputToS3(projectId);
      await statusClient.hSet("status", projectId, "deployed");
      console.log(`Build job complete for ${projectId}. Uploaded ${uploadedFiles} converted files.`);
    } catch (err) {
      await statusClient.hSet("status", projectId, "failed");
      console.error("Build job failed for project:", projectId, err);
    }
  }
}

startHealthServerIfNeeded();

main().catch((err) => {
  console.error("Deploy worker failed:", err);
});
