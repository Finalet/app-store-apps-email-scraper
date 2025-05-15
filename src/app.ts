import { ReadUrlsFromCSV, AppendResultsToCSV } from "./csv";
import { appIDFromURL, ScrapeAppStorePage, ScrapedData } from "./scraper";
import dateAndTime from "date-and-time";

async function ScrapeAppStorePages(pages: string[], onResult?: (result: ScrapedData[]) => void) {
  const batchSize = 5;

  const results: ScrapedData[] = [];
  const batches = Math.ceil(pages.length / batchSize);

  console.log(`\n🧪 Scraping ${pages.length} pages in ${batches} batches of ${batchSize} pages each.`);

  for (let i = 0; i < batches; i++) {
    const batch = pages.slice(i * batchSize, (i + 1) * batchSize);
    console.log(`🧪 Scraping batch ${i + 1} of ${batches}.`);

    const batchResults = await Promise.all(batch.map((page) => ScrapeAppStorePage(page)));
    results.push(...batchResults);
    onResult?.(batchResults);
    await Sleep(3000 + Math.random() * 2000);
  }

  return results;
}

const Sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Depth 0 = only scrape original URLs, 1+ scrape original URLs and their suggested apps;
async function Start(depth: number = 0, recordFirstStep: boolean = true) {
  console.log(`\n🚀 Starting scraping with depth ${depth}.`);

  const date = dateAndTime.format(new Date(), "YYYY-MM-DD");
  const emailsFileName = `found-emails ${date}.csv`;
  const noEmailsFileName = `no-emails ${date}.csv`;
  const urlsFromCSV = await ReadUrlsFromCSV("./input/apps.csv");
  const cleanUrlsFromCSV = convertURLsToUSAppStore(urlsFromCSV);
  const IDsToIgnore = await ReadUrlsFromCSV("./input/ignore.csv");

  const ignoreIDs: string[] = IDsToIgnore;
  let urls = cleanUrlsFromCSV.filter((url) => !ignoreIDs.includes(appIDFromURL(url)));
  let nAppsWithEmail = 0;
  let nAppssWithoutEmail = 0;
  let nEmailsFound = 0;
  let nTotalApps = 0;
  let step = 0;

  while (urls.length > 0) {
    step++;
    const newResults = await ScrapeAppStoreURLs({
      urls,
      emailsFileName,
      noEmailsFileName,
      recordResults: step === 1 ? recordFirstStep : true,
    });

    nAppsWithEmail += newResults.filter((result) => (result.allEmails?.length ?? 0) > 0).length;
    nAppssWithoutEmail += newResults.filter((result) => (result.allEmails?.length ?? 0) === 0).length;
    nEmailsFound += newResults.reduce((acc, result) => acc + (result.allEmails?.length ?? 0), 0);
    nTotalApps += newResults.length;

    ignoreIDs.push(...newResults.map((r) => appIDFromURL(r.url)));

    const moreAppURLs = newResults
      .filter((result) => (result.otherApps?.length ?? 0) > 0)
      .flatMap((result) => result.otherApps!)
      .filter((url) => !ignoreIDs.includes(appIDFromURL(url)));
    const deduplicatedMoreAppURLs = [...new Set(moreAppURLs)];
    if (step <= depth) {
      urls = deduplicatedMoreAppURLs;
      console.log(`\n🔍 Found ${moreAppURLs.length} more apps to scrape. Continuing to step ${step} of ${depth}.`);
    } else urls = [];
  }

  console.log(`\n✅ Done scraping. Results saved to ./output. Stats:\n  - Scrapped apps: ${nTotalApps}.\n  - Apps with emails: ${nAppsWithEmail}.\n  - Apps without emails: ${nAppssWithoutEmail}.\n  - Total emails found: ${nEmailsFound}.`);
}

async function ScrapeAppStoreURLs({ urls, emailsFileName, noEmailsFileName, recordResults = true }: { urls: string[]; emailsFileName: string; noEmailsFileName: string; recordResults?: boolean }) {
  const csvHeaders = [
    "ID",
    "URL",
    "App Name",
    "Developer",
    "Last updated",
    "Rating",
    "Ratings count",
    "Website",
    "Price",
    "IAPs",
    "Category",
    "Email 1",
    "Email 2",
    "Email 3",
    "Email 4",
    "Email 5",
    "Email 6",
    "Email 7",
    "Email 8",
    "Email 9",
    "Email 10",
  ];

  return await ScrapeAppStorePages(urls, async (batchResult) => {
    const foundEmails = batchResult.filter((result) => (result.allEmails?.length ?? 0) > 0);
    const notFoundEmails = batchResult.filter((result) => (result.allEmails?.length ?? 0) === 0);

    const csvRowsFoundEmails = foundEmails.map((result) => {
      return {
        id: appIDFromURL(result.url),
        url: result.url,
        app: result.title?.replace(/,/g, " ") ?? "",
        developer: result.developer?.replace(/,/g, " ") ?? "",
        lastUpdatedDate: result.lastUpdatedDate ? dateAndTime.format(result.lastUpdatedDate, "YYYY-MM-DD") : "",
        rating: result.rating?.toString() ?? "",
        numberOfRatings: result.numberOfRatings?.toString() ?? "",
        website: result.website?.replace(/,/g, " ") ?? "",
        price: result.price?.toString() ?? "",
        inAppPurchases: (result.inAppPurchases?.length ?? 0) > 0 ? "Yes" : "No",
        category: result.category?.replace(/,/g, " ") ?? "",
        emails: result.allEmails?.join(","),
      };
    });

    const csvRowsNoEmails = notFoundEmails.map((result) => {
      return {
        id: appIDFromURL(result.url),
        url: result.url,
        app: result.title?.replace(/,/g, " ") ?? "",
        developer: result.developer?.replace(/,/g, " ") ?? "",
        lastUpdatedDate: result.lastUpdatedDate ? dateAndTime.format(result.lastUpdatedDate, "YYYY-MM-DD") : "",
        rating: result.rating?.toString() ?? "",
        numberOfRatings: result.numberOfRatings?.toString() ?? "",
        website: result.website?.replace(/,/g, " ") ?? "",
        price: result.price?.toString() ?? "",
        inAppPurchases: (result.inAppPurchases?.length ?? 0) > 0 ? "Yes" : "No",
        category: result.category?.replace(/,/g, " ") ?? "",
        emails: result.allEmails?.join(","),
      };
    });

    if (csvRowsFoundEmails.length > 0 && recordResults) await AppendResultsToCSV(csvRowsFoundEmails, `./output/${emailsFileName}`, csvHeaders);
    if (csvRowsNoEmails.length > 0 && recordResults) await AppendResultsToCSV(csvRowsNoEmails, `./output/${noEmailsFileName}`, csvHeaders);
  });
}

const convertURLsToUSAppStore = (urls: string[]) => {
  return urls.map((url) => {
    const array = url.split("/");
    const region = array[3];
    if (region === "us") return url;

    if (url.startsWith(`https://apps.apple.com/${region}/`)) return url.replace(`https://apps.apple.com/${region}/`, "https://apps.apple.com/us/");

    return url;
  });
};

// npm run start
// npm run start -- depth=2 rfs=0
const args = process.argv.slice(2);
const depthArg = args.find((arg) => arg.startsWith("depth="));
const depth = depthArg ? parseInt(depthArg.split("=")[1]) : 0;
const recordFirstStepArg = args.find((arg) => arg.startsWith("rfs="));
const recordFirstStep = recordFirstStepArg ? parseInt(recordFirstStepArg.split("=")[1]) === 1 : true;
Start(depth, recordFirstStep);
