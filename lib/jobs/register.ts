import "server-only";

/**
 * Job handler registration seam.
 *
 * Importing this module registers every milestone's job handlers for their
 * side effects. The cron drainer route imports it once; each milestone that
 * adds a handler adds its import here (not to the route). Keeps the job
 * platform (M1) decoupled from specific handlers.
 */

import "@/lib/jobs/handlers/gmail-sync"; // M3
import "@/lib/jobs/handlers/calendar-sync"; // M4
import "@/lib/jobs/handlers/notification-scan"; // M5
import "@/lib/jobs/handlers/notification-dispatch"; // M5
