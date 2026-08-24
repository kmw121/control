import fs from "fs";
import path from "path";
import type { Theme } from "../stores/themeInfoStore";

const themeFilePath = path.join(process.cwd(), "data/themes.json");

export const loadThemesFromFile = (): Theme[] => {
  try {
    if (!fs.existsSync(themeFilePath)) return [];
    const data = fs.readFileSync(themeFilePath, "utf-8");
    return JSON.parse(data);
  } catch (err) {
    console.error("테마 불러오기 실패:", err);
    return [];
  }
};

export const saveThemesToFile = (themes: Theme[]) => {
  try {
    fs.writeFileSync(themeFilePath, JSON.stringify(themes, null, 2), "utf-8");
  } catch (err) {
    console.error("테마 저장 실패:", err);
  }
};
