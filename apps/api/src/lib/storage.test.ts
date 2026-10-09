import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3"
import { describe, expect, it, vi } from "vitest"

import { createS3Storage } from "./storage"

describe("createS3Storage", () => {
  it("指定したバケットに保存・削除する", async () => {
    const send = vi.spyOn(S3Client.prototype, "send").mockResolvedValue({} as never)
    const storage = createS3Storage({
      endpoint: "http://minio:9000",
      region: "auto",
      bucket: "avatars",
      accessKeyId: "k",
      secretAccessKey: "s",
      forcePathStyle: true,
    })
    await storage.put("a.png", Buffer.from("x"), "image/png")
    await storage.delete("a.png")

    const [put, del] = send.mock.calls.map(([command]) => command)
    expect(put).toBeInstanceOf(PutObjectCommand)
    expect((put as PutObjectCommand).input).toMatchObject({ Bucket: "avatars", Key: "a.png", ContentType: "image/png" })
    expect(del).toBeInstanceOf(DeleteObjectCommand)
    expect((del as DeleteObjectCommand).input).toEqual({ Bucket: "avatars", Key: "a.png" })
  })
})
