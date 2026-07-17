import { describe, expect, it } from "vitest";
import { sniffImageType } from "./sniff";

const bytes = (...values: (number | string)[]): Uint8Array => {
  const out: number[] = [];
  for (const value of values) {
    if (typeof value === "number") out.push(value);
    else for (const char of value) out.push(char.charCodeAt(0));
  }
  return new Uint8Array(out);
};

describe("sniffImageType", () => {
  it("recognizes the four supported formats by magic bytes", () => {
    expect(sniffImageType(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("image/jpeg");
    expect(sniffImageType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a))).toBe("image/png");
    expect(sniffImageType(bytes("RIFF", 0, 0, 0, 0, "WEBP"))).toBe("image/webp");
    expect(sniffImageType(bytes(0, 0, 0, 0x20, "ftypavif"))).toBe("image/avif");
  });

  it("rejects everything else, whatever it claims to be", () => {
    expect(sniffImageType(bytes("GIF89a"))).toBeNull(); // gif unsupported on purpose
    expect(sniffImageType(bytes("<svg xmlns="))).toBeNull(); // svg = script risk
    expect(sniffImageType(bytes("%PDF-1.7"))).toBeNull();
    expect(sniffImageType(new Uint8Array(0))).toBeNull();
    expect(sniffImageType(bytes(0xff, 0xd8))).toBeNull(); // truncated jpeg magic
  });
});
