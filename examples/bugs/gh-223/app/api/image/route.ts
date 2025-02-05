import { NextRequest, NextResponse } from "next/server";

import { getImageUrl } from "../../../src/utils/s3Bucket";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const fileName = searchParams.get("fileName");
  return NextResponse.json(
    {
      image: fileName ? await getImageUrl(fileName) : "",
    },
    {
      status: 200,
    }
  );
}
