import pkg from "aws-sdk";
import fs from "fs";
import dotenv from "dotenv";
dotenv.config();
const { S3 } = pkg;
const s3 = new S3({
  endpoint: "https://s3.us-east-005.backblazeb2.com",
  accessKeyId: "00587b6d5335dd00000000002",
  secretAccessKey: "K005Gm5Ral7POSvrStAHUFpMgeoBeOs",
  region: "us-east-005",
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
  }
};