import { describe, it, expect } from "vitest";
import { GoogleCalendarEventMapper, normalizeDateTime } from "@/lib/sync/calendar/mapper";
import type { GoogleEvent } from "@/lib/integrations/google/calendar";

const mapper = new GoogleCalendarEventMapper();

describe("calendar normalizeDateTime", () => {
  it("normalizes a timed event to UTC ISO", () => {
    expect(normalizeDateTime({ dateTime: "2026-08-01T09:30:00-04:00" })).toBe("2026-08-01T13:30:00.000Z");
  });
  it("normalizes an all-day date to 00:00Z", () => {
    expect(normalizeDateTime({ date: "2026-08-01" })).toBe("2026-08-01T00:00:00.000Z");
  });
  it("returns null for empty/invalid", () => {
    expect(normalizeDateTime(undefined)).toBeNull();
    expect(normalizeDateTime({ dateTime: "nonsense" })).toBeNull();
  });
});

describe("GoogleCalendarEventMapper.toEventDTO", () => {
  const timed: GoogleEvent = {
    id: "evt1",
    status: "confirmed",
    summary: "Interview — Backend",
    description: "Panel",
    location: "Zoom",
    start: { dateTime: "2026-08-01T14:00:00Z", timeZone: "America/New_York" },
    end: { dateTime: "2026-08-01T15:00:00Z" },
    attendees: [{ email: "Recruiter@Corp.com", displayName: "Rex", responseStatus: "accepted" }],
    iCalUID: "abc@google.com",
    htmlLink: "https://cal/evt1",
  };

  it("maps a timed event, lowercasing attendee emails and capturing provenance", () => {
    const dto = mapper.toEventDTO(timed, "primary");
    expect(dto.externalEventId).toBe("evt1");
    expect(dto.calendarId).toBe("primary");
    expect(dto.title).toBe("Interview — Backend");
    expect(dto.allDay).toBe(false);
    expect(dto.startsAt).toBe("2026-08-01T14:00:00.000Z");
    expect(dto.endsAt).toBe("2026-08-01T15:00:00.000Z");
    expect(dto.status).toBe("confirmed");
    expect(dto.attendees).toEqual([{ email: "recruiter@corp.com", displayName: "Rex", responseStatus: "accepted" }]);
    expect(dto.externalIds).toEqual({ ical_uid: "abc@google.com" });
    expect(dto.metadata.timeZone).toBe("America/New_York");
  });

  it("flags all-day events", () => {
    const dto = mapper.toEventDTO({ id: "e2", start: { date: "2026-08-02" }, end: { date: "2026-08-03" } }, "primary");
    expect(dto.allDay).toBe(true);
    expect(dto.startsAt).toBe("2026-08-02T00:00:00.000Z");
  });

  it("maps cancelled status", () => {
    const dto = mapper.toEventDTO({ id: "e3", status: "cancelled" }, "primary");
    expect(dto.status).toBe("cancelled");
    expect(dto.attendees).toEqual([]);
    expect(dto.externalIds).toEqual({});
  });
});

describe("GoogleCalendarEventMapper.toGoogleInsert", () => {
  it("builds a Google insert resource with attendees", () => {
    const g = mapper.toGoogleInsert({
      title: "Interview",
      startsAt: "2026-08-01T14:00:00.000Z",
      endsAt: "2026-08-01T15:00:00.000Z",
      location: "Zoom",
      attendees: ["a@x.com"],
    });
    expect(g.summary).toBe("Interview");
    expect(g.start).toEqual({ dateTime: "2026-08-01T14:00:00.000Z" });
    expect(g.end).toEqual({ dateTime: "2026-08-01T15:00:00.000Z" });
    expect(g.location).toBe("Zoom");
    expect(g.attendees).toEqual([{ email: "a@x.com" }]);
  });

  it("omits attendees when none given", () => {
    const g = mapper.toGoogleInsert({ title: "x", startsAt: "2026-08-01T14:00:00Z", endsAt: "2026-08-01T15:00:00Z" });
    expect(g.attendees).toBeUndefined();
  });
});
