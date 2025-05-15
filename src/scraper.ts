import parse, { HTMLElement } from "node-html-parser";

export interface ScrapedData {
  id: string;
  url: string;
  title?: string;
  developer?: string;
  lastUpdatedDate?: Date;
  rating?: string;
  numberOfRatings?: string;
  website?: string;
  price?: string;
  inAppPurchases?: { name: string; price: string }[];
  category?: string;
  emailsByUrl?: { [key: string]: string[] };
  allEmails?: string[];
  otherApps?: string[];
}

export async function ScrapeAppStorePage(page: string): Promise<ScrapedData> {
  console.log("🌐 Scraping page:", page);

  const appID = appIDFromURL(page);
  const rawHtml = await fetchPageHTML(page);
  if (!rawHtml) {
    return {
      id: appID,
      url: page,
    };
  }

  const html = parse(rawHtml);
  if (!html) {
    console.error("🔴 Failed to parse HTML from page:", page);
    return {
      id: appID,
      url: page,
    };
  }

  const title = getTitle(html);
  const developer = getDeveloper(html);
  const links = getLinks(html);
  const website = getWebsite(html);
  const price = getPrice(html);
  const inAppPurchases = getIAPs(html);
  const category = getCategory(html);
  const otherApps = getOtherAppsOnPage(html);
  const rating = getAverageRating(html);
  const numberOfRatings = getNumberOfRatings(html);
  const lastUpdatedDate = getLastUpdateDate(html);

  const emailsByUrl: { [key: string]: string[] } = {
    [page]: await getEmailsFromHtml(html),
  };
  for (const link of links) {
    const scapedEmails = await getEmailsFromUrl(link);
    if (emailsByUrl) {
      emailsByUrl[link] = scapedEmails ?? [];
    }
  }
  const emails = Array.from(new Set(Object.values(emailsByUrl).flat()));

  return {
    id: appID,
    url: page,
    title,
    developer,
    lastUpdatedDate,
    rating,
    numberOfRatings,
    website,
    price,
    inAppPurchases,
    category,
    emailsByUrl,
    allEmails: emails,
    otherApps,
  };
}

const getTitle = (html: HTMLElement) => {
  const appTitle = html.querySelector("h1");
  appTitle?.querySelectorAll("span").forEach((span) => span.remove());
  return cleanInnerText(appTitle);
};

const getDeveloper = (html: HTMLElement) => {
  const developer = html.querySelector("h2.product-header__identity > a");
  return cleanInnerText(developer);
};

const getWebsite = (html: HTMLElement) => {
  const links = html.querySelectorAll("ul.inline-list.inline-list--app-extensions > li > a");
  if (!links) return undefined;
  const developerLink = links.find((link) => {
    const metricAttribute = link.getAttribute("data-metrics-click");
    if (!metricAttribute) return false;
    const json = JSON.parse(metricAttribute);
    return json && json.actionDetails && json.actionDetails.type === "developer";
  });
  if (!developerLink) return undefined;
  return developerLink.getAttribute("href");
};

const getLinks = (html: HTMLElement) => {
  const links = html.querySelectorAll("ul.inline-list.inline-list--app-extensions > li > a");
  if (!links) return [];
  return links
    .map((link) => {
      return link.getAttribute("href") ?? null;
    })
    .filter((link) => link !== null) as string[];
};

const cleanInnerText = (html: HTMLElement | null): string | undefined => {
  if (!html) return undefined;
  // remove all unicode characters except for letters, numbers, spaces, and symbols
  return html.text
    .replace(/[\u200B-\u200F\u202A-\u202E\uFEFF\u2028-\u202F]/g, "") // Remove invisible unicode chars
    .replace(/[^\x20-\x7E\s\u00A2-\u00A5\u20A0-\u20CF\u0080]/g, "") // Keep ASCII + currency symbols
    .replace(/\s+/g, " ") // Normalize whitespace
    .trim();
};

const fetchPageHTML = async (url: string): Promise<string | null> => {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
      },
    });
    if (!response.ok) {
      console.error("🔴 Failed to fetch page:", url, response.statusText);
      return null;
    }
    return await response.text();
  } catch (error) {
    console.error("🔴 Failed to fetch page:", url, error);
    return null;
  }
};

async function getEmailsFromHtml(html: HTMLElement): Promise<string[]> {
  const anchorEmails = emailsFromAnchors(html);
  const rawTextEmails = emailsFromText(html);

  const deduplicatedEmails = Array.from(new Set([...anchorEmails, ...rawTextEmails]));
  return deduplicatedEmails;
}

async function getEmailsFromUrl(link: string): Promise<string[]> {
  const page = await fetchPageHTML(link);
  if (!page) return [];
  const html = parse(page);
  return await getEmailsFromHtml(html);
}

const emailsFromAnchors = (html: HTMLElement) => {
  const emails = html
    .querySelectorAll("a[href^='mailto:']")
    ?.map((a) => a.getAttribute("href")?.replace("mailto:", "").split("?").shift()?.trim())
    .filter((email) => email !== undefined);

  const protectedEmails = html
    .querySelectorAll("a[href^='/cdn-cgi/l/email-protection#']")
    ?.map((a) => a.getAttribute("href")?.replace("/cdn-cgi/l/email-protection#", "").trim())
    .filter((email) => email !== undefined)
    .map((email) => decodeEmail(email).split("?").shift() ?? "");

  const protectedEmails1 = html
    .querySelectorAll("a[href^='/cdn-cgi/l/email-protection']")
    ?.map((a) => a.getAttribute("data-cfemail")?.trim())
    .filter((email) => email !== undefined)
    .map((email) => decodeEmail(email).split("?").shift() ?? "");
  return [...emails, ...protectedEmails, ...protectedEmails1];
};

const emailsFromText = (html: HTMLElement) => {
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

  const elements = html.querySelectorAll("span, p, div, li, h1, h2, h3, h4, h5, h6, dd, dt, a");

  const emails = elements
    .map((element) => {
      const text = element.textContent;
      if (!text) return null;
      const matches = text.match(emailRegex);
      if (!matches) return null;
      return matches.map((email) => email.trim());
    })
    .filter((email) => email !== null) as string[][];

  const flattenedEmails = emails.flat();

  return Array.from(new Set(flattenedEmails));
};

function decodeEmail(encoded: string): string {
  const hex = encoded.slice(2); // skip the first 2 characters (used as the XOR key)
  const key = parseInt(encoded.slice(0, 2), 16); // get the key from the first 2 characters
  let email = "";

  for (let i = 0; i < hex.length; i += 2) {
    const byte = parseInt(hex.slice(i, i + 2), 16);
    email += String.fromCharCode(byte ^ key);
  }

  return email;
}

function getAverageRating(html: HTMLElement) {
  const element = html.querySelector("figcaption.we-rating-count");
  const text = cleanInnerText(element)?.replace(/,/g, ".");
  return text?.split(" ").shift()?.trim();
}

function getNumberOfRatings(html: HTMLElement) {
  const element = html.querySelector("figcaption.we-rating-count");
  const text = cleanInnerText(element);
  if (!text) return undefined;
  const array = text.split(" ");
  if (array.length < 3) return undefined;
  let number = array[1];
  if (number.includes("K")) {
    number = number.replace("K", "");
    number = (parseFloat(number) * 1000).toString();
  } else if (number.includes("M")) {
    number = number.replace("M", "");
    number = (parseFloat(number) * 1000000).toString();
  }
  return number;
}

function getLastUpdateDate(html: HTMLElement) {
  const element = html.querySelector("time[class='']");
  if (!element) return undefined;
  const datetime = element.getAttribute("datetime");
  if (!datetime) return undefined;
  return new Date(datetime);
}

function getOtherAppsOnPage(html: HTMLElement): string[] | undefined {
  const anchors = html.querySelectorAll("a[href^='https://apps.apple.com/']");
  const otherAppsAnchors = anchors.filter((anchor) => {
    const dataMetric = anchor.getAttribute("data-metrics-location");
    if (!dataMetric) return false;
    const json = JSON.parse(dataMetric);
    return json && json.locationType === "shelfCustomersAlsoBoughtApps";
  });

  const urls = otherAppsAnchors.map((anchor) => anchor.getAttribute("href")).filter((u) => u !== undefined);
  return urls;
}

function getCategory(html: HTMLElement): string | undefined {
  const elements = html.querySelectorAll("a.link");
  const categoryElement = elements.find((element) => {
    const dataMetricsClick = element.getAttribute("data-metrics-click");
    if (!dataMetricsClick) return false;
    const json = JSON.parse(dataMetricsClick);
    return json && json.targetId === "GenrePage";
  });
  if (!categoryElement) return undefined;
  return cleanInnerText(categoryElement);
}

const getPrice = (html: HTMLElement) => {
  const priceElement = html.querySelector("li.app-header__list__item--price");
  return cleanInnerText(priceElement);
};

const getIAPs = (html: HTMLElement): { name: string; price: string }[] => {
  const list = html.querySelectorAll(`dd.information-list__item__definition > ol[role="table"] > div > li`);
  if (!list) return [];

  return list
    .map((item) => {
      const spans = item.querySelectorAll("span").slice(-2);
      if (spans.length < 2) return null;
      const iapName = cleanInnerText(spans[0] as HTMLElement);
      const iapPrice = cleanInnerText(spans[1] as HTMLElement);
      if (!iapName || !iapPrice) return null;
      return {
        name: iapName,
        price: iapPrice,
      };
    })
    .filter((iap) => !!iap) as { name: string; price: string }[];
};

export const appIDFromURL = (url: string) => url.split("/").pop()?.split("?").shift() ?? "";
