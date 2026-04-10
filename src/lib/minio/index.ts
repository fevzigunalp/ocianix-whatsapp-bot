import { Client } from 'minio'

const globalForMinio = globalThis as unknown as {
  minio: Client | undefined
}

export const minioClient = globalForMinio.minio ?? new Client({
  endPoint: process.env.MINIO_ENDPOINT || 'localhost',
  port: parseInt(process.env.MINIO_PORT || '9000'),
  useSSL: false,
  accessKey: process.env.MINIO_ACCESS_KEY || '',
  secretKey: process.env.MINIO_SECRET_KEY || '',
})

if (process.env.NODE_ENV !== 'production') globalForMinio.minio = minioClient

const BUCKET = process.env.MINIO_BUCKET || 'wabot-media'

export async function ensureBucket(tenantSlug: string) {
  const bucketName = `${BUCKET}-${tenantSlug}`
  const exists = await minioClient.bucketExists(bucketName)
  if (!exists) {
    await minioClient.makeBucket(bucketName)
  }
  return bucketName
}

export async function uploadFile(
  tenantSlug: string,
  fileName: string,
  buffer: Buffer,
  contentType: string
): Promise<string> {
  const bucket = await ensureBucket(tenantSlug)
  const objectName = `${Date.now()}-${fileName}`
  await minioClient.putObject(bucket, objectName, buffer, buffer.length, {
    'Content-Type': contentType,
  })
  return `${process.env.MINIO_ENDPOINT}:${process.env.MINIO_PORT}/${bucket}/${objectName}`
}
