import { del, get, put } from "@vercel/blob";

type WorkerGlobal = typeof globalThis & { __FMG_FILES_BUCKET__?: R2Bucket };

function filesBucket() {
  return (globalThis as WorkerGlobal).__FMG_FILES_BUCKET__ ?? null;
}

export async function putPrivateFile(key: string, bytes: Uint8Array, contentType: string) {
  const bucket = filesBucket();
  if (bucket) {
    await bucket.put(key, bytes, { httpMetadata: { contentType } });
    return;
  }
  await put(key, Buffer.from(bytes), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: false,
    contentType,
    cacheControlMaxAge: 3600,
  });
}

export async function getPrivateFile(key: string) {
  const bucket = filesBucket();
  if (bucket) {
    const object = await bucket.get(key);
    if (!object) return null;
    return {
      stream: object.body,
      contentType: object.httpMetadata?.contentType || "application/octet-stream",
    };
  }
  const object = await get(key, { access: "private" });
  if (!object || object.statusCode !== 200) return null;
  return { stream: object.stream, contentType: object.blob.contentType || "application/octet-stream" };
}

export async function deletePrivateFile(key: string) {
  const bucket = filesBucket();
  if (bucket) {
    await bucket.delete(key);
    return;
  }
  await del(key);
}
