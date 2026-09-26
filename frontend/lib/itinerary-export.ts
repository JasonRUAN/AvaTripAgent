import { formatDayLabel, formatNumber, formatUsd } from "./format";
import { getDict, interpolate } from "./i18n";
import type { Locale } from "./i18n/config";
import { categoryLabel } from "./i18n/labels";
import { demoText, displayCity, preferenceDisplay } from "./i18n/dictionaries/demo";
import type { ItineraryDay, Quote, TripRequest } from "./types";

export interface ItineraryDocument {
  request?: TripRequest | null;
  days: ItineraryDay[];
  quote?: Quote;
}

export function itineraryMarkdown(doc: ItineraryDocument, locale: Locale): string {
  const request = doc.request;
  const dict = getDict(locale).exportDoc;
  const lines: string[] = [];

  // 城市与偏好以中文规范名存储，导出时按当前语言展示
  const title = request
    ? interpolate(dict.title, {
        origin: displayCity(request.origin, locale),
        destination: displayCity(request.destination, locale),
        days: request.days,
      })
    : dict.fallbackTitle;
  lines.push(`# ${title}`, "");

  if (request) {
    lines.push(
      interpolate(dict.departDate, { date: request.startDate }),
      interpolate(dict.pax, { n: request.pax }),
      interpolate(dict.rooms, { n: request.rooms }),
      interpolate(dict.budget, { n: formatNumber(request.budget, locale) }),
      request.preferences.length
        ? interpolate(dict.preferences, {
            list: request.preferences
              .map((pref) => preferenceDisplay(pref, locale))
              .join(demoText(locale).listSeparator),
          })
        : "",
      ""
    );
  }

  for (const day of doc.days) {
    lines.push(
      `## D${day.index + 1} ${day.theme}`,
      "",
      `${formatDayLabel(day.date, locale)}${
        day.dayCost > 0
          ? interpolate(dict.dayCost, { amount: formatNumber(day.dayCost, locale) })
          : ""
      }`,
      ""
    );
    if (day.items.length === 0) {
      lines.push(dict.emptyDay, "");
      continue;
    }
    for (const item of day.items) {
      const price = item.price
        ? ` · $${formatNumber(item.price, locale)}`
        : "";
      const note = item.note ? `  \n  ${item.note}` : "";
      lines.push(`- **${item.time || "—"}** ${item.title}${price}${note}`);
    }
    lines.push("");
  }

  if (doc.quote) {
    lines.push(dict.quoteTitle, "");
    for (const item of doc.quote.lineItems) {
      lines.push(
        interpolate(dict.quoteLine, {
          category: categoryLabel(item.category, locale),
          label: item.label,
          amount: formatUsd(item.amount),
        })
      );
    }
    lines.push("", interpolate(dict.quoteTotal, { total: formatUsd(doc.quote.total) }), "");
  }

  return lines.filter((line, index, all) => !(line === "" && all[index - 1] === "")).join("\n");
}

export function itineraryFilename(request?: TripRequest | null): string {
  const dest = request?.destination?.replace(/[\\/:*?"<>|]/g, "") || "trip";
  const date = request?.startDate || "itinerary";
  return `AvaTrip-${dest}-${date}.md`;
}

export function downloadItineraryMarkdown(doc: ItineraryDocument, locale: Locale): void {
  const blob = new Blob([itineraryMarkdown(doc, locale)], {
    type: "text/markdown;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = itineraryFilename(doc.request);
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export const LOCAL_ITINERARY_PREFIX = "avatrip:itinerary:";

export function saveLocalItinerary(orderId: string, doc: ItineraryDocument): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(`${LOCAL_ITINERARY_PREFIX}${orderId}`, JSON.stringify(doc));
  } catch {
    // 存储满时安静放弃
  }
}

export function loadLocalItinerary(orderId: string): ItineraryDocument | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(`${LOCAL_ITINERARY_PREFIX}${orderId}`);
    if (!raw) return null;
    return JSON.parse(raw) as ItineraryDocument;
  } catch {
    return null;
  }
}
