import { S3Client } from "@aws-sdk/client-s3";
import { env } from "./env";

/**
 * The api's one S3-compatible client (R2 in production, the compose S3
 * gateway locally), shared by the publish and media adapters. Region "auto"
 * + path-style: R2 ignores the region, the local gateway is told to expect
 * it (VGW_REGION in docker-compose.dev.yml), and a gateway on localhost has
 * no per-bucket hostnames to address.
 */
export const s3 = new S3Client({
  region: "auto",
  endpoint: env.R2_ENDPOINT_URL,
  credentials: {
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  },
  forcePathStyle: true,
});
