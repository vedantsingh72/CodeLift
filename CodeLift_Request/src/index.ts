import express from "express";
import pkg from "aws-sdk";
import path from "path";

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
  const hostId = req.hostname.split(".")[0];

  if (hostId !== "localhost" && hostId !== "127") {
    return hostId;
  }

  const queryId = typeof req.query.id === "string" ? req.query.id : null;

  if (queryId) {
    res.cookie("projectId", queryId, { httpOnly: true, sameSite: "lax" });
    return queryId;
  }

  return getCookie(req.headers.cookie, "projectId") ?? process.env.PROJECT_ID ?? null;
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

function getFilePath(requestPath: string) {
  if (requestPath === "/" || requestPath === "") {
    return "/index.html";
  }

  if (requestPath.endsWith("/")) {
    return `${requestPath}index.html`;
  }

  if (!path.posix.extname(requestPath)) {
    return `${requestPath}/index.html`;
  }

  return requestPath;
}

app.get(/.*/, async (req, res) => {
  try {
    // id.100xdevs.com
    const id = getProjectId(req, res);

    if (!id) {
      res
        .status(400)
        .send("Missing project id. Open http://localhost:3001/?id=YOUR_DEPLOY_ID");
      return;
    }

    const filePath = getFilePath(req.path);
    const key = `converted/${id}${filePath}`;

    console.log("Fetching S3 key:", key);

    const contents = await s3
      .getObject({
        Bucket: "VercelClone",
        Key: key
      })
      .promise();

    res.set("Content-Type", getContentType(filePath));
    res.send(contents.Body);
  } catch (err) {
    console.error("Failed to fetch converted file:", err);
    res.status(404).send("Not found");
  }
});


app.listen(3001, () => {
  console.log("Request server is running on http://localhost:3001");
});
