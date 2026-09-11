import { existsSync } from "node:fs";
import { appendFile, readFile } from "node:fs/promises";

const reportUrl = new URL("../.tmp-data/content-update-report.json", import.meta.url);
if (existsSync(reportUrl)) {
  const report = JSON.parse(await readFile(reportUrl, "utf8"));
  const release = report.weeklyRelease;
  const lines = report.status === "success" && release ? [
    `## Weekly new articles · ${release.week}`,
    "",
    "Scheduled for Monday 09:00, Asia/Shanghai. Counts include this week's previous successful runs.",
    "",
    "| Language | Newly collected | Target | Shortfall |",
    "| --- | ---: | ---: | ---: |",
    ...["cantonese", "english"].map((language) => `| ${language} | ${release[language].count} | ${release.targetPerLanguage} | ${release[language].shortfall} |`),
    "",
    "Only articles never previously collected are counted. Shortages are left unfilled; older articles are retained in the library.",
    ""
  ] : ["## Content update failed", "", "Generated content and collection history were restored. See the failed step for details.", ""];
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, lines.join("\n"));
  else console.log(lines.join("\n"));
}
