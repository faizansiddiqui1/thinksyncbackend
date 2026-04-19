import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getCredentials } from "../services/credentialResolver.js";

function normalizeAws(creds = {}) {
  return {
    accessKeyId: creds.accessKeyId || "",
    secretAccessKey: creds.secretAccessKey || "",
    region: creds.region || "",
    bucketName: creds.bucketName || "",
  };
}

export async function resolveAwsConfig(tenant) {
  const creds = await getCredentials({ tenant }, "aws");
  const aws = normalizeAws(creds);

  if (
    !aws.accessKeyId ||
    !aws.secretAccessKey ||
    !aws.region ||
    !aws.bucketName
  ) {
    throw new Error("AWS credentials missing");
  }

  return aws;
}

function createS3Client(aws) {
  return new S3Client({
    region: aws.region,
    credentials: {
      accessKeyId: aws.accessKeyId,
      secretAccessKey: aws.secretAccessKey,
    },
  });
}

export function publicUrlForKey({ bucketName, region, key }) {
  if (!bucketName || !region || !key) {
    throw new Error("bucketName, region and key are required");
  }

  const encodedKey = String(key)
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");

  return `https://${bucketName}.s3.${region}.amazonaws.com/${encodedKey}`;
}

export async function createPresignedUpload({
  tenant,
  key,
  contentType,
  expiresSeconds = 900,
}) {
  if (!key) throw new Error("key is required");
  if (!contentType) throw new Error("contentType is required");

  const aws = await resolveAwsConfig(tenant);
  const s3 = createS3Client(aws);

  const cmd = new PutObjectCommand({
    Bucket: aws.bucketName,
    Key: key,
    ContentType: contentType,
  });

  const uploadUrl = await getSignedUrl(s3, cmd, { expiresIn: expiresSeconds });

  return {
    uploadUrl,
    key,
    expiresIn: expiresSeconds,
    bucketName: aws.bucketName,
    region: aws.region,
  };
}

export async function createSignedGetUrl({
  tenant,
  key,
  expiresSeconds = 900,
}) {
  if (!key) throw new Error("key is required");

  const aws = await resolveAwsConfig(tenant);
  const s3 = createS3Client(aws);

  const cmd = new GetObjectCommand({
    Bucket: aws.bucketName,
    Key: key,
  });

  return await getSignedUrl(s3, cmd, { expiresIn: expiresSeconds });
}

export async function deleteFromStorage({ tenant, key }) {
  if (!key) return false;

  const aws = await resolveAwsConfig(tenant);
  const s3 = createS3Client(aws);

  const cmd = new DeleteObjectCommand({
    Bucket: aws.bucketName,
    Key: key,
  });

  try {
    await s3.send(cmd);
    return true;
  } catch (err) {
    console.error("S3 delete failed:", err);
    throw new Error("Failed to delete file from storage");
  }
}