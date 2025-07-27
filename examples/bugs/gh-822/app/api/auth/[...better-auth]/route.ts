import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const segments = url.pathname.split('/').filter(Boolean);
  const authSegments = segments.slice(3); // Remove 'api', 'auth' parts

  return NextResponse.json({
    message: 'Better Auth route accessed successfully',
    segments: authSegments,
    url: url.pathname
  });
}

export async function POST(request: NextRequest) {
  return NextResponse.json({
    message: 'POST request to Better Auth route',
    url: request.url
  });
}