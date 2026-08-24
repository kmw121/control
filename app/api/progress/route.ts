import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const FILE_PATH = path.join(process.cwd(), "data", "progress.json");
const TEMP_FILE_PATH = path.join(process.cwd(), "data", "progress.tmp.json");

export async function GET() {
  try {
    const data = fs.readFileSync(FILE_PATH, "utf-8");
    return NextResponse.json(JSON.parse(data));
  } catch {
    return NextResponse.json([]);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    fs.writeFileSync(TEMP_FILE_PATH, JSON.stringify(body, null, 2));
    fs.renameSync(TEMP_FILE_PATH, FILE_PATH);

    return NextResponse.json({ status: "ok" });
  } catch {
    return NextResponse.json({ error: "failed to save" }, { status: 500 });
  }
}
