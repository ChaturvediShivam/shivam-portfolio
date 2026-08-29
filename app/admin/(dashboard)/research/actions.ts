"use server";

import { withAdminAction } from "@/lib/actions";
import { actionError, actionSuccess, type ActionResult } from "@/lib/action-result";
import {
  findCompaniesAcrossProviders,
  getCompanyDossier,
  getMacroSeries,
  searchJobsAcrossProviders,
  searchNewsAcrossProviders,
  searchScholarlyAcrossProviders,
  type CompanyDossier,
  type SearchOutcome,
} from "@/lib/research/search";
import type {
  CompanyRef,
  NormalizedEconomicSeries,
  NormalizedJob,
  NormalizedNewsItem,
  NormalizedScholarlyWork,
  ProviderUnavailable,
} from "@/lib/research/types";

/**
 * Research server actions.
 *
 * The trust boundary for the research UI. Every provider credential is read in
 * this process by the adapters and never crosses to the browser; the client
 * sends a query string and receives normalized source records.
 *
 * All four actions share one shape deliberately: results plus the reason
 * anything is missing. A caller can always distinguish "a provider ran and
 * found nothing" from "no provider could run", which is the distinction the
 * architecture exists to preserve.
 *
 * These call the research layer, NOT the AI Gateway. Nothing here is
 * synthesized by a model — that stays a separate, explicitly triggered step so
 * source facts and model output never blur together.
 */

/** Bounds a query before it reaches a provider or a log. */
const MAX_QUERY_CHARS = 200;

function cleanQuery(value: unknown): string {
  return typeof value === "string" ? value.trim().slice(0, MAX_QUERY_CHARS) : "";
}

export interface JobSearchInput {
  readonly query?: string;
  readonly remoteOnly?: boolean;
  readonly location?: string;
  readonly limit?: number;
}

export async function searchJobsAction(
  input: JobSearchInput,
): Promise<ActionResult<SearchOutcome<NormalizedJob>>> {
  return withAdminAction(async () => {
    try {
      const outcome = await searchJobsAcrossProviders({
        query: cleanQuery(input?.query) || undefined,
        remoteOnly: input?.remoteOnly === true,
        location: cleanQuery(input?.location) || undefined,
        limit: Math.min(50, Math.max(1, Math.trunc(Number(input?.limit) || 20))),
      });
      return actionSuccess(outcome);
    } catch (error) {
      // Provider errors are already provider-agnostic and carry no credentials
      // or query content; anything else stays generic.
      console.error("[research] job search failed:", error);
      return actionError({ formError: "Job search failed. Try again shortly." });
    }
  });
}

export async function searchNewsAction(
  input: { query?: string; limit?: number },
): Promise<ActionResult<SearchOutcome<NormalizedNewsItem>>> {
  return withAdminAction(async () => {
    const query = cleanQuery(input?.query);
    // An empty query would spend a provider's daily quota for an arbitrary
    // slice of the firehose.
    if (!query) return actionError({ formError: "Enter a search term." });

    try {
      const outcome = await searchNewsAcrossProviders(
        query,
        Math.min(25, Math.max(1, Math.trunc(Number(input?.limit) || 10))),
      );
      return actionSuccess(outcome);
    } catch (error) {
      console.error("[research] news search failed:", error);
      return actionError({ formError: "News search failed. Try again shortly." });
    }
  });
}

export async function findCompaniesAction(
  input: { query?: string },
): Promise<ActionResult<SearchOutcome<CompanyRef>>> {
  return withAdminAction(async () => {
    const query = cleanQuery(input?.query);
    if (!query) return actionError({ formError: "Enter a company name or ticker." });

    try {
      return actionSuccess(await findCompaniesAcrossProviders(query));
    } catch (error) {
      console.error("[research] company search failed:", error);
      return actionError({ formError: "Company search failed. Try again shortly." });
    }
  });
}

export async function getCompanyDossierAction(
  input: { providerId?: string; ref?: string },
): Promise<ActionResult<{ dossier: CompanyDossier | null; unavailable: readonly ProviderUnavailable[] }>> {
  return withAdminAction(async () => {
    const providerId = cleanQuery(input?.providerId);
    const ref = cleanQuery(input?.ref);
    if (!providerId || !ref) return actionError({ formError: "That company could not be identified." });

    try {
      return actionSuccess(await getCompanyDossier(providerId, ref));
    } catch (error) {
      console.error("[research] company dossier failed:", error);
      return actionError({ formError: "Could not load that company." });
    }
  });
}

export async function getMacroSeriesAction(
  input: { seriesId?: string; limit?: number },
): Promise<ActionResult<{
  series: NormalizedEconomicSeries | null;
  failed: readonly { provider: string; reason: string }[];
  unavailable: readonly ProviderUnavailable[];
}>> {
  return withAdminAction(async () => {
    const seriesId = cleanQuery(input?.seriesId);
    if (!seriesId) return actionError({ formError: "Enter a series identifier." });

    try {
      return actionSuccess(
        await getMacroSeries(seriesId, Math.min(120, Math.max(1, Math.trunc(Number(input?.limit) || 24)))),
      );
    } catch (error) {
      console.error("[research] macro series failed:", error);
      return actionError({ formError: "Could not load that series." });
    }
  });
}

/**
 * Search scholarly works.
 *
 * Answers "who is working on this?" — the one question the job, company, news
 * and macro providers cannot. Like the others it runs no model: these are
 * source records with their provenance intact.
 */
export async function searchScholarlyAction(
  input: { query?: string; fromDate?: string; limit?: number },
): Promise<ActionResult<SearchOutcome<NormalizedScholarlyWork>>> {
  return withAdminAction(async () => {
    const query = cleanQuery(input?.query);
    if (!query) return actionError({ formError: "Enter a research topic." });

    try {
      const outcome = await searchScholarlyAcrossProviders({
        query,
        fromDate: cleanQuery(input?.fromDate) || undefined,
        limit: Math.min(50, Math.max(1, Math.trunc(Number(input?.limit) || 20))),
      });
      return actionSuccess(outcome);
    } catch (error) {
      console.error("[research] scholarly search failed:", error);
      return actionError({ formError: "Research search failed. Try again shortly." });
    }
  });
}
