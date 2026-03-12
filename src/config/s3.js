// lib/s3.js
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const region = process.env.AWS_REGION;
const bucket = process.env.AWS_BUCKET_NAME;

if (!region || !bucket) {
  console.warn("AWS_REGION or S3_BUCKET not set in env — set them before using s3 helpers.");
}

export const s3 = new S3Client({
  region,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

/**
 * Create presigned PUT URL for direct browser upload.
 * returns { uploadUrl, key }
 */


export const createPresignedUpload = async ({ key, contentType, expiresSeconds = 900 }) => {
  const cmd = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType,
    // If you want public objects at upload time, you could add ACL: "public-read" (not recommended for private content)
  });
  const uploadUrl = await getSignedUrl(s3, cmd, { expiresIn: expiresSeconds });
  return { uploadUrl, key, expiresIn: expiresSeconds };
};

/**
 * Create signed GET URL for previewing a private object.
 * returns signed GET url string.
 */
export const createSignedGetUrl = async ({ key, expiresSeconds = 900 }) => {
  const cmd = new GetObjectCommand({ Bucket: bucket, Key: key });
  return await getSignedUrl(s3, cmd, { expiresIn: expiresSeconds });
};

/**
 * Public URL for object when bucket/object is publicly readable (or accessed via CloudFront)
 */
export const publicUrlForKey = ({ key }) => {
  return `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${encodeURIComponent(key)}`;
};


export const deleteFromStorage = async (key) => {
  if (!key) return false;

  const cmd = new DeleteObjectCommand({
    Bucket: bucket,
    Key: key,
  });

  try {
    await s3.send(cmd);
    return true;
  } catch (err) {
    console.error("S3 delete failed:", err);
    throw new Error("Failed to delete file from storage");
  }
};