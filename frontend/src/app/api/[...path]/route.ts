import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";
const SERVICE_KEY = process.env.SERVICE_KEY || "";

async function proxy(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  const path = params.path.join("/");
  const { search } = new URL(request.url);
  const targetUrl = `${BACKEND_URL}/${path}${search}`;

  const headers = new Headers(request.headers);
  if (SERVICE_KEY) headers.set("x-service-key", SERVICE_KEY);
  headers.delete("host");

  const body =
    request.method !== "GET" && request.method !== "HEAD"
      ? await request.arrayBuffer()
      : undefined;

  const upstream = await fetch(targetUrl, {
    method: request.method,
    headers,
    body,
  });

  const responseHeaders = new Headers(upstream.headers);
  responseHeaders.delete("transfer-encoding");
  responseHeaders.delete("content-encoding");

  const responseBody = upstream.status === 204 ? null : await upstream.arrayBuffer();

  return new NextResponse(responseBody, {
    status: upstream.status,
    headers: responseHeaders,
  });
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
