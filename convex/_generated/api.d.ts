/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as accounts from "../accounts.js";
import type * as attendance from "../attendance.js";
import type * as auth from "../auth.js";
import type * as checkins from "../checkins.js";
import type * as emailVerification from "../emailVerification.js";
import type * as emails from "../emails.js";
import type * as eventStaff from "../eventStaff.js";
import type * as events from "../events.js";
import type * as http from "../http.js";
import type * as model from "../model.js";
import type * as registrations from "../registrations.js";
import type * as seed from "../seed.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  accounts: typeof accounts;
  attendance: typeof attendance;
  auth: typeof auth;
  checkins: typeof checkins;
  emailVerification: typeof emailVerification;
  emails: typeof emails;
  eventStaff: typeof eventStaff;
  events: typeof events;
  http: typeof http;
  model: typeof model;
  registrations: typeof registrations;
  seed: typeof seed;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
