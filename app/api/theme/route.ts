import { NextRequest, NextResponse } from "next/server";
import { loadThemesFromFile, saveThemesToFile } from "@/utils/themeFile";

export async function GET() {
  const themes = loadThemesFromFile();
  return NextResponse.json(themes);
}

export async function POST(req: NextRequest) {
  const newThemes = await req.json();
  saveThemesToFile(newThemes);
  return NextResponse.json({ success: true });
}
