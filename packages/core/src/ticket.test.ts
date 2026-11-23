import { describe, expect, it } from "vitest";
import { formatDuration } from "../src/format.js";
import {
  canTransition,
  formatTicketNumber,
  parseTicketNumber,
  primaryNextStatus,
  shortTicketNumber,
  ticketDateCode
} from "../src/ticket.js";

describe("ticket state machine", () => {
  it("allows piket to accept a new ticket", () => {
    expect(canTransition("baru", "diterima", "piket")).toBe(true);
    expect(canTransition("baru", "diterima", "admin")).toBe(true);
  });

  it("rejects a domain transition that is not in the graph", () => {
    expect(canTransition("baru", "otw", "piket")).toBe(false);
    expect(canTransition("baru", "selesai", "admin")).toBe(false);
  });

  it("rejects an actor without the role", () => {
    expect(canTransition("baru", "diterima", "urc")).toBe(false);
    expect(canTransition("diterima", "otw", "urc")).toBe(true);
    expect(canTransition("selesai", "diterima", "piket")).toBe(false);
    expect(canTransition("selesai", "diterima", "pawas")).toBe(true);
  });

  it("allows reporter cancellation only before acceptance", () => {
    expect(canTransition("baru", "dibatalkan", "reporter")).toBe(true);
    expect(canTransition("diterima", "dibatalkan", "reporter")).toBe(false);
  });

  it("returns the primary next status", () => {
    expect(primaryNextStatus("baru")).toBe("diterima");
    expect(primaryNextStatus("ditkp")).toBe("selesai");
    expect(primaryNextStatus("selesai")).toBeNull();
  });
});

describe("ticket numbers", () => {
  const date = new Date("2026-11-14T14:00:00.000Z"); // 21:00 WIB

  it("uses the Jakarta date and pads the sequence", () => {
    expect(ticketDateCode(date)).toBe("261114");
    expect(formatTicketNumber("BKS", date, 14)).toBe("BKS-261114-014");
  });

  it("normalizes the unit code", () => {
    expect(formatTicketNumber(" bks ", date, 1)).toBe("BKS-261114-001");
  });

  it("parses a ticket number", () => {
    expect(parseTicketNumber("BKS-261114-014")).toEqual({
      unitCode: "BKS",
      dateCode: "261114",
      sequence: 14
    });
    expect(parseTicketNumber("bukan-tiket")).toBeNull();
  });

  it("shortens a ticket number for UI", () => {
    expect(shortTicketNumber("BKS-261114-014")).toBe("#014");
  });
});

describe("duration formatting", () => {
  it("normalizes boundary rounding without emitting 60 seconds or 60 minutes", () => {
    expect(formatDuration(59.6)).toBe("1m");
    expect(formatDuration(119.6)).toBe("2m");
    expect(formatDuration(61.4)).toBe("1m 1s");
    expect(formatDuration(3599.6)).toBe("1j");
    expect(formatDuration(3660)).toBe("1j 1m");
  });
});
