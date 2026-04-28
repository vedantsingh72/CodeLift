import express from "express";
import cors from "cors";
import { simpleGit } from "simple-git";
import { generate } from "./utils.js";
import { getAllFiles } from "./file.js";
import {uploadFile} from "./upload.js";
import {createClient} from "redis"

import path from "path";
import { fileURLToPath } from "url";
import pkg from "aws-sdk";

const { S3 } = pkg;
const publisher = createClient();
publisher.connect();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const s3 = new S3();
const app = express();
const git = simpleGit();
app.use(cors());
app.use(express.json());



app.post("/deploy",async (req,res)=>{
     const repoUrl = req.body.repoUrl;
     console.log("Recieved the deploy request");
     console.log("Repo URL:",repoUrl);

    const id = generate();
    await git.clone(repoUrl, path.join(__dirname,`./temp/${id}`));
   
    //ab isko S3 mein store kardo.
    const allfiles = getAllFiles(path.join(__dirname,`./temp/${id}`));
    console.log(allfiles);

    allfiles.forEach(async (files) => {
    await uploadFile(
        files.slice(__dirname.length + 1),
        files
    );
});
 
    publisher.lPush("build-queue", id);
    
    res.json({ 
        id : id,
        message: "Repository cloned successfully",
     });
})

app.listen(3000, () => {
  console.log("Server is running on port http://localhost:3000");
});


