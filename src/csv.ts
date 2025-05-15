import fs from "fs";
import { parse } from "csv-parse";

export function ReadUrlsFromCSV(csvPath: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const urls: string[] = [];
    if (!fs.existsSync(csvPath)) {
      return resolve(urls);
    }

    fs.createReadStream(csvPath)
      .pipe(parse())
      .on("data", (row) => {
        const url = row[0].trim();
        if (url) {
          urls.push(url);
        }
      })
      .on("end", () => {
        resolve(urls);
      })
      .on("error", (error) => {
        reject(error);
      });
  });
}

export async function AppendResultsToCSV(results: any[], csvPath: string, headers?: string[]) {
  const csvContent =
    results
      .map((result) => {
        return Object.values(result).join(",");
      })
      .join("\n") + "\n";

  const outputDir = csvPath.substring(0, csvPath.lastIndexOf("/"));
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const hasHeaders = fs.existsSync(csvPath) && fs.readFileSync(csvPath, "utf-8").split("\n").shift();
  if (headers && !hasHeaders) {
    fs.appendFileSync(csvPath, headers.join(",") + "\n");
  }

  fs.appendFileSync(csvPath, csvContent);
}
