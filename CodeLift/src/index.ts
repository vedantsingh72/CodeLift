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
app.use(cors());
app.use(express.json());



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
      const response = await subscriber.hGet("status",String(id));
      res.json({
         status:response
      })
})

const startServer = async () => {
  try {
    await publisher.connect();
    await subscriber.connect();

    app.listen(3000, () => {
      console.log("Server is running on port http://localhost:3000");
    });
  } catch (err) {
    console.error(`Could not connect to Redis at ${redisUrl}.`);
    console.error("Start Redis locally or set REDIS_URL in .env.");
    console.error(err);
    process.exit(1);
  }
};

startServer();
