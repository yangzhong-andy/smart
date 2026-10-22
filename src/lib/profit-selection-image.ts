const MAX_IMAGE_BYTES = 300 * 1024;

export function parseSelectionImage(value: unknown): { mimeType: string; data: Buffer } {
  if (typeof value !== "string") throw new Error("图片格式无效");
  const match = /^data:image\/(jpeg|png|webp|gif);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match) throw new Error("仅支持 JPG、PNG、WebP 或 GIF 图片");
  const data = Buffer.from(match[2], "base64");
  if (!data.length || data.length > MAX_IMAGE_BYTES || data.toString("base64") !== match[2]) {
    throw new Error("图片不得超过 300 KB，或图片数据无效");
  }
  const mimeType = `image/${match[1]}`;
  const isJpeg = data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
  const isPng = data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const isWebp = data.toString("ascii", 0, 4) === "RIFF" && data.toString("ascii", 8, 12) === "WEBP";
  const isGif = ["GIF87a", "GIF89a"].includes(data.toString("ascii", 0, 6));
  if (!(mimeType === "image/jpeg" && isJpeg || mimeType === "image/png" && isPng ||
    mimeType === "image/webp" && isWebp || mimeType === "image/gif" && isGif)) {
    throw new Error("图片内容与格式不匹配");
  }
  return { mimeType, data };
}
