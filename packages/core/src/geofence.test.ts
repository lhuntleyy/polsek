import { describe, expect, it } from "vitest";
import {
  classifyLocation,
  geometryCenter,
  pointInRegion,
  validateGeoPolygon
} from "../src/geofence.js";
import type { RegionInput } from "../src/types.js";

const square = {
  type: "Polygon" as const,
  coordinates: [
    [
      [-0.01, -0.01],
      [0.01, -0.01],
      [0.01, 0.01],
      [-0.01, 0.01],
      [-0.01, -0.01]
    ]
  ]
};

const region: RegionInput = {
  id: "region-1",
  name: "Contoh",
  geojson: square,
  center: { lat: 0, lng: 0 }
};

describe("geofence", () => {
  it("accepts a point inside the polygon", () => {
    expect(pointInRegion(0, 0, region)).toBe(true);
    const result = classifyLocation({ lat: 0, lng: 0, accuracyM: 10 }, [region]);
    expect(result.status).toBe("verified");
    expect(result.regionId).toBe("region-1");
  });

  it("flags a point just outside the boundary as needing verification", () => {
    const result = classifyLocation({ lat: 0.011, lng: 0.011, accuracyM: 10 }, [region]);
    expect(result.status).toBe("needs_verification");
    expect(result.reason).toBe("near_boundary");
  });

  it("rejects a point far outside the wilkum", () => {
    const result = classifyLocation({ lat: 0.03, lng: 0.03, accuracyM: 10 }, [region]);
    expect(result.status).toBe("outside");
    expect(result.nearestRegionId).toBe("region-1");
  });

  it("flags low accuracy even when inside", () => {
    const result = classifyLocation({ lat: 0, lng: 0, accuracyM: 150 }, [region]);
    expect(result.status).toBe("needs_verification");
    expect(result.reason).toBe("accuracy_low");
  });

  it("handles invalid coordinates", () => {
    const result = classifyLocation({ lat: Number.NaN, lng: 0 }, [region]);
    expect(result.status).toBe("needs_verification");
    expect(result.reason).toBe("invalid_coordinates");
  });

  it("handles an empty region list", () => {
    const result = classifyLocation({ lat: 0, lng: 0 }, []);
    expect(result.status).toBe("needs_verification");
    expect(result.reason).toBe("no_regions");
  });

  it("rejects an open ring", () => {
    const invalid = {
      type: "Polygon",
      coordinates: [
        [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1]
        ]
      ]
    };
    const result = validateGeoPolygon(invalid);
    expect(result.ok).toBe(false);
  });

  it("calculates a center", () => {
    const center = geometryCenter(square);
    expect(center.lat).toBeCloseTo(0);
    expect(center.lng).toBeCloseTo(0);
  });

  it("accepts RFC 7946 3D coordinates and rejects out-of-range coordinates", () => {
    const poly3d = {
      type: "Polygon" as const,
      coordinates: [
        [
          [-0.01, -0.01, 15],
          [0.01, -0.01, 20],
          [0.01, 0.01, 18],
          [-0.01, 0.01, 12],
          [-0.01, -0.01, 15]
        ]
      ]
    };
    expect(validateGeoPolygon(poly3d).ok).toBe(true);

    const outOfRange = {
      type: "Polygon" as const,
      coordinates: [
        [
          [200, 0],
          [201, 0],
          [201, 1],
          [200, 0]
        ]
      ]
    };
    expect(validateGeoPolygon(outOfRange).ok).toBe(false);
  });

  it("calculates center across MultiPolygon coordinates", () => {
    const multi = {
      type: "MultiPolygon" as const,
      coordinates: [
        [
          [
            [-0.02, -0.01],
            [0, -0.01],
            [0, 0.01],
            [-0.02, 0.01],
            [-0.02, -0.01]
          ]
        ],
        [
          [
            [0.02, -0.01],
            [0.04, -0.01],
            [0.04, 0.01],
            [0.02, 0.01],
            [0.02, -0.01]
          ]
        ]
      ]
    };
    const center = geometryCenter(multi);
    expect(center.lat).toBeCloseTo(0);
    expect(center.lng).toBeCloseTo(0.01);
  });

  it("picks the nearest polygon boundary when near-boundary buffers overlap", () => {
    const nearLeft: RegionInput = {
      id: "left-near",
      name: "Wilayah Kiri",
      geojson: {
        type: "Polygon",
        coordinates: [
          [
            [-0.01, -0.01],
            [0, -0.01],
            [0, 0.01],
            [-0.01, 0.01],
            [-0.01, -0.01]
          ]
        ]
      },
      center: { lat: 0, lng: -0.005 }
    };
    const wideRight: RegionInput = {
      id: "right-wide",
      name: "Wilayah Kanan",
      geojson: {
        type: "Polygon",
        coordinates: [
          [
            [0.002, -0.01],
            [0.1, -0.01],
            [0.1, 0.01],
            [0.002, 0.01],
            [0.002, -0.01]
          ]
        ]
      },
      center: { lat: 0, lng: 0.051 }
    };

    const result = classifyLocation({ lat: 0, lng: 0.0018, accuracyM: 10 }, [
      nearLeft,
      wideRight
    ]);
    expect(result.status).toBe("needs_verification");
    expect(result.reason).toBe("near_boundary");
    expect(result.regionId).toBe("right-wide");
  });
});
