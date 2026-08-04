import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-auth";

export const dynamic = 'force-dynamic';
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request);
  if (auth.response) return auth.response;

  const { searchParams } = new URL(request.url);
  const url = searchParams.get("url");

  if (!url) {
    return NextResponse.json({ error: "Missing url parameter" }, { status: 400 });
  }

  // 只允许 TikTok CDN 域名
  const allowedDomains = [
    "ttcdn-us.com",
    "ibyteimg.com",
    "tiktokcdn.com",
    "byteimg.com",
    "tiktokv.com",
  ];
  try {
    const urlObj = new URL(url);
    if (urlObj.protocol !== "https:") {
      return NextResponse.json({ error: "Only HTTPS URLs are allowed" }, { status: 403 });
    }
    const hostname = urlObj.hostname.toLowerCase();
    const isAllowed = allowedDomains.some(d => hostname === d || hostname.endsWith(`.${d}`));
    if (!isAllowed) {
      return NextResponse.json({ error: "Domain not allowed" }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });
    clearTimeout(timeout);

    if (!response.ok) {
      return NextResponse.json(
        { error: `Upstream error: ${response.status}` },
        { status: 502 }
      );
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.toLowerCase().startsWith("image/")) {
      return NextResponse.json({ error: "Upstream response is not an image" }, { status: 415 });
    }
    const contentLength = Number(response.headers.get("content-length") || 0);
    if (contentLength > MAX_IMAGE_BYTES) {
      return NextResponse.json({ error: "Image is too large" }, { status: 413 });
    }
    if (!response.body) {
      return NextResponse.json({ error: "Empty image response" }, { status: 502 });
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_IMAGE_BYTES) {
        await reader.cancel();
        return NextResponse.json({ error: "Image is too large" }, { status: 413 });
      }
      chunks.push(value);
    }
    const buffer = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      buffer.set(chunk, offset);
      offset += chunk.byteLength;
    }

    // 缓存 7 天
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=604800, immutable",
        "CDN-Cache-Control": "public, max-age=604800",
      },
    });
  } catch (error: any) {
    console.error("[ImageProxy] Error:", error.message);
    return NextResponse.json(
      { error: "Failed to fetch image" },
      { status: 502 }
    );
  }
}
