/**
 * S3 互換ストレージ（Bot アバターの原本保存）。
 */
import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3"

export interface ObjectStorage {
  put(key: string, body: Buffer, contentType: string): Promise<void>
  delete(key: string): Promise<void>
}

export interface S3StorageOptions {
  endpoint?: string
  region: string
  bucket: string
  accessKeyId: string
  secretAccessKey: string
  forcePathStyle: boolean
}

export function createS3Storage(options: S3StorageOptions): ObjectStorage {
  const client = new S3Client({
    endpoint: options.endpoint,
    region: options.region,
    forcePathStyle: options.forcePathStyle,
    credentials: { accessKeyId: options.accessKeyId, secretAccessKey: options.secretAccessKey },
  })
  return {
    async put(key, body, contentType) {
      await client.send(
        new PutObjectCommand({ Bucket: options.bucket, Key: key, Body: body, ContentType: contentType }),
      )
    },
    async delete(key) {
      await client.send(new DeleteObjectCommand({ Bucket: options.bucket, Key: key }))
    },
  }
}
