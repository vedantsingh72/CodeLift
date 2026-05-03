import express from "express";
import pkg from "aws-sdk";
import path from "path";
import dotenv from "dotenv";
dotenv.config();

const { S3 } = pkg;

const s3 = new S3({
  endpoint: process.env.S3_ENDPOINT!,
  accessKeyId: process.env.S3_ACCESS_KEY!,
  secretAccessKey: process.env.S3_SECRET_KEY!,
  region: process.env.S3_REGION!,
  signatureVersion: "v4",
  s3ForcePathStyle: true
});

const app = express();

function getCookie(cookieHeader: string | undefined, name: string) {
  if (!cookieHeader) return null;

  const cookies = cookieHeader.split(";").map((cookie) => cookie.trim());
  const match = cookies.find((cookie) => cookie.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

function getProjectId(req: express.Request, res: express.Response) {
  const queryId = typeof req.query.id === "string" ? req.query.id : null;

  if (queryId) {
    res.cookie("projectId", queryId, { httpOnly: true, sameSite: "lax" });
    return queryId;
  }

  const cookieId = getCookie(req.headers.cookie, "projectId");
  if (cookieId) {
    return cookieId;
  }

  // Only use host-derived id for real wildcard-subdomain setups.
  // On Render hosts like "<service>.onrender.com", this would be incorrect.
  const hostId = req.hostname.split(".")[0];
  const isLocalHost = hostId === "localhost" || hostId === "127";
  const isRenderServiceHost = req.hostname.endsWith(".onrender.com");
  if (!isLocalHost && !isRenderServiceHost) {
    return hostId;
  }

  return process.env.PROJECT_ID ?? null;
}

function getContentType(filePath: string) {
  if (filePath.endsWith(".html")) return "text/html";
  if (filePath.endsWith(".css")) return "text/css";
  if (filePath.endsWith(".js")) return "application/javascript";
  if (filePath.endsWith(".json")) return "application/json";
  if (filePath.endsWith(".svg")) return "image/svg+xml";
  if (filePath.endsWith(".png")) return "image/png";
  if (filePath.endsWith(".jpg") || filePath.endsWith(".jpeg")) return "image/jpeg";
  if (filePath.endsWith(".ico")) return "image/x-icon";
  return "application/octet-stream";
}

function sanitizePath(requestPath: string) {
  const decodedPath = decodeURIComponent(requestPath || "/");
  const normalizedPath = path.posix.normalize(decodedPath);

  // Block traversal and non-rooted paths
  if (!normalizedPath.startsWith("/") || normalizedPath.includes("..")) {
    return null;
  }

  return normalizedPath === "/" ? "/index.html" : normalizedPath;
}

function isS3MissingKeyError(err: unknown) {
  if (!err || typeof err !== "object") {
    return false;
  }

  const code = "code" in err ? String((err as { code?: unknown }).code) : "";
  const statusCode =
    "statusCode" in err ? Number((err as { statusCode?: unknown }).statusCode) : null;
  return code === "NoSuchKey" || statusCode === 404;
}

async function fetchObjectFromS3(key: string) {
  return s3
    .getObject({
      Bucket: "VercelClone",
      Key: key
    })
    .promise();
}

/**
 * Vite often sets `base: '/Quiz/'`, so HTML requests `/Quiz/assets/...` while
 * deploy copies `dist/` flat to `converted/{id}/assets/...`. If the primary
 * key is missing, try without that one segment. Do not strip when the first
 * segment is already a standard static root (`assets`, `_next`, `static`).
 */
function withoutLeadingBaseSegment(filePath: string): string | null {
  const m = filePath.match(/^\/([^/]+)\/(.+)$/);
  if (!m) return null;
  const head = m[1];
  if (head === "assets" || head === "_next" || head === "static") return null;
  return `/${m[2]}`;
}

function candidateS3Keys(projectId: string, filePath: string): string[] {
  const primary = `converted/${projectId}${filePath}`;
  const keys = [primary];

  const stripped = withoutLeadingBaseSegment(filePath);
  if (stripped) {
    keys.push(`converted/${projectId}${stripped}`);
  }

  return keys;
}

app.get(/.*/, async (req, res) => {
  try {
    const id = getProjectId(req, res);

    if (!id) {
      res
        .status(400)
        .send("Missing project id. Open http://localhost:3001/?id=YOUR_DEPLOY_ID");
      return;
    }

    const filePath = sanitizePath(req.path);
    if (!filePath) {
      res.status(404).send("Not found");
      return;
    }

    const keysToTry = candidateS3Keys(id, filePath);
    console.log("Fetching S3 keys (in order):", keysToTry.join(", "));

    let lastErr: unknown;
    for (const key of keysToTry) {
      try {
        const contents = await fetchObjectFromS3(key);
        res.set("Content-Type", getContentType(filePath));
        res.send(contents.Body);
        return;
      } catch (err) {
        lastErr = err;
        if (!isS3MissingKeyError(err)) {
          throw err;
        }
      }
    }

    // For SPA routes (/about, /dashboard), fall back to index.html.
    if (!path.posix.extname(filePath) && lastErr && isS3MissingKeyError(lastErr)) {
      const fallbackKey = `converted/${id}/index.html`;
      console.log("Falling back to:", fallbackKey);
      const fallback = await fetchObjectFromS3(fallbackKey);
      res.set("Content-Type", "text/html");
      res.send(fallback.Body);
      return;
    }

    throw lastErr;
  } catch (err) {
    console.error("Failed to fetch converted file:", err);
    res.status(404).send("Not found");
  }
});


app.listen(3001, () => {
  console.log("Request server is running on http://localhost:3001");
});
