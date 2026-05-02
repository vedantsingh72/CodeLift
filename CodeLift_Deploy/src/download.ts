import pkg from "aws-sdk";
import fs from "fs";
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

function getProjectId(prefix: string) {
  const normalizedPrefix = prefix.replaceAll("\\", "/");
  const parts = normalizedPrefix.split("/").filter(Boolean);
  return parts.at(-1) ?? "unknown";
}

export async function downloadS3Folder(prefix: string, projectId = getProjectId(prefix)) {
  try {
    console.log("Fetching objects with prefix:", prefix);

    const fallbackPrefix = prefix.replaceAll("/", "\\");
    let activePrefix = prefix;
    let { Contents } = await s3.listObjectsV2({
      Bucket: "VercelClone",
      Prefix: activePrefix
    }).promise();

    if ((!Contents || Contents.length === 0) && fallbackPrefix !== prefix) {
      console.log("No files found with slash prefix, trying:", fallbackPrefix);
      activePrefix = fallbackPrefix;
      const fallbackResponse = await s3.listObjectsV2({
        Bucket: "VercelClone",
        Prefix: activePrefix
      }).promise();
      Contents = fallbackResponse.Contents;
    }

    if (!Contents || Contents.length === 0) {
      console.log("No files found");
      return 0;
    }

    const baseDir = path.join(process.cwd(), "output", projectId);
    console.log(`Found ${Contents.length} S3 objects. Downloading to:`, baseDir);

    await Promise.all(
      Contents.map(async ({ Key }) => {
        if (!Key) return;

        // Remove prefix and ensure path always remains relative on Windows/Linux.
        const relativePath = Key
          .replace(activePrefix, "")
          .replaceAll("\\", "/")
          .replace(/^\/+/, "")
          .split("/")
          .join(path.sep);

        const finalPath = path.join(baseDir, relativePath);

        fs.mkdirSync(path.dirname(finalPath), { recursive: true });

        console.log("Downloading:", Key);

        const fileStream = fs.createWriteStream(finalPath);

        const s3Stream = s3
          .getObject({
            Bucket: "VercelClone",
            Key
          })
          .createReadStream();

        await new Promise((resolve, reject) => {
          s3Stream
            .pipe(fileStream)
            .on("finish", resolve)
            .on("error", reject);
        });
      })
    );

    console.log(`Download complete for project ${projectId}`);
    return Contents.length;
  } catch (err) {
    console.error("Download failed:", err);
    throw err;
  }
}


export async function copyBuildOutputToS3(id: string) {
    const folderPath = path.join(process.cwd(), "output", id, "converted");

    if (!fs.existsSync(folderPath)) {
        console.log("No converted output folder found:", folderPath);
        return 0;
    }

    const allFiles = getAllFiles(folderPath);
    console.log(`Uploading ${allFiles.length} converted files to S3 prefix converted/${id}/`);

    await Promise.all(
        allFiles.map((file) => {
            const relativePath = file.slice(folderPath.length + 1).split(path.sep).join("/");
            return uploadFile(`converted/${id}/${relativePath}`, file);
        })
    );

    console.log("Uploaded converted output to S3:", `converted/${id}/`);
    return allFiles.length;
}



const getAllFiles = (folderPath: string) => {
    let response: string[] = [];

    const allFilesAndFolders = fs.readdirSync(folderPath);allFilesAndFolders.forEach(file => {
        const fullFilePath = path.join(folderPath, file);
        if (fs.statSync(fullFilePath).isDirectory()) {
            response = response.concat(getAllFiles(fullFilePath))
        } else {
            response.push(fullFilePath);
        }
    });
    return response;
}



const uploadFile = async (fileName: string, localFilePath: string) => {
    const fileContent = fs.readFileSync(localFilePath);
    const response = await s3.upload({
        Body: fileContent,
        Bucket: "VercelClone",
        Key: fileName,
    }).promise();
    console.log("Uploaded converted file:", response.Key);
}
