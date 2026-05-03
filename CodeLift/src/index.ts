import express from "express";
import cors from "cors";
import { simpleGit } from "simple-git";
import { generate } from "./utils.js";
import { getAllFiles } from "./file.js";
import {uploadFile} from "./upload.js";
import {createClient} from "redis"
import dotenv from "dotenv";

import path from "path";
import { fileURLToPath } from "url";
import pkg from "aws-sdk";

dotenv.config();

const { S3 } = pkg;
const redisUrl = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";
const previewBaseUrl = process.env.PREVIEW_URL ?? "http://localhost:3001";
const port = Number(process.env.PORT ?? 3004);
const rawAllowedOrigins = process.env.CORS_ORIGINS ?? "";
const allowedOrigins = rawAllowedOrigins
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const publisher = createClient({ url: redisUrl });
const subscriber = createClient({ url: redisUrl });

publisher.on("error", (err) => {
  console.error("Redis connection error:", err.message);
});

subscriber.on("error", (err) => {
  console.error("Redis connection error:", err.message);
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const s3 = new S3();
const app = express();
const git = simpleGit();

const corsOptions: cors.CorsOptions = {
  origin(origin, callback) {
    // Allow server-to-server and curl requests that have no Origin header.
    if (!origin) {
      callback(null, true);
      return;
    }

    // If no allowlist is configured, keep development permissive.
    if (allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error(`Origin ${origin} is not allowed by CORS`));
  },
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: false,
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
app.options("/deploy", cors(corsOptions));
app.options("/status", cors(corsOptions));
app.use(express.json());

function getDeploymentUrl(id: string) {
  return `${previewBaseUrl.replace(/\/$/, "")}/?id=${encodeURIComponent(id)}`;
}



app.post("/deploy",async (req,res)=>{
  try {
     const repoUrl = req.body.repoUrl;
     console.log("Recieved the deploy request");
     console.log("Repo URL:",repoUrl);

    const id = generate();
    console.log("Generated project id:", id);
    await git.clone(repoUrl, path.join(__dirname,`./temp/${id}`));
   
    //ab isko S3 mein store kardo.
    const allfiles = getAllFiles(path.join(__dirname,`./temp/${id}`));
    console.log(`Uploading ${allfiles.length} files to S3 prefix temp/${id}/`);

    await Promise.all(allfiles.map((files) => uploadFile(
        files.slice(__dirname.length + 1).split(path.sep).join("/"),
        files
    )));
 
    await publisher.lPush("build-queue", `temp/${id}/`);
    console.log("Queued build job:", `temp/${id}/`);
    
    await publisher.hSet("status",id,"uploaded");
  
    res.json({ 
        id : id,
        deploymentUrl: getDeploymentUrl(id),
        message: "Repository cloned successfully",
     });
  } catch (err) {
    console.error("Deploy failed:", err);
    res.status(500).json({
      message: "Deployment failed",
    });
  }
});




app.get("/status",async (req , res)=>{
      const id=req.query.id;
      if (typeof id !== "string" || !id) {
        res.status(400).json({
          status: "failed",
          message: "Missing deployment id"
        });
        return;
      }

      const response = await subscriber.hGet("status",String(id));
      res.json({
         status:response,
         deploymentUrl: response === "deployed" ? getDeploymentUrl(id) : null
      })
})

const startServer = async () => {
  try {
    await publisher.connect();
    await subscriber.connect();

    app.listen(port, () => {
      console.log(`Server is running on port http://localhost:${port}`);
    });
  } catch (err) {
    console.error(`Could not connect to Redis at ${redisUrl}.`);
    console.error("Start Redis locally or set REDIS_URL in .env.");
    console.error(err);
    process.exit(1);
  }
};

startServer();
