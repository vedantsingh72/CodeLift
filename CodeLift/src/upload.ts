import pkg from "aws-sdk";
import fs from "fs";
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

export const uploadFile = async (
  fileName: string,
  localFilePath: string
) => {
  try {
    const fileContent = fs.readFileSync(localFilePath);

    const response = await s3.upload({
      Bucket: "VercelClone",
      Key: fileName,
      Body: fileContent,
    }).promise();

    console.log("Upload success:", response);
  } catch (err) {
    console.error("Upload failed:", err);
    throw err;
  }
};
