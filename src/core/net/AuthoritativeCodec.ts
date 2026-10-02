/** Wire values never contain prototypes, snapshots, code or arbitrary object graphs. */
export function encodeView(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) => {
    if (typeof v === "bigint") return { $wire: "bigint", value: v.toString() };
    if (v instanceof Set) return { $wire: "set", value: [...v] };
    if (ArrayBuffer.isView(v) && !(v instanceof DataView)) {
      return {
        $wire: v.constructor.name,
        value: Array.from(v as unknown as ArrayLike<number>),
      };
    }
    return v;
  });
}
export function decodeView(value: string): unknown {
  return JSON.parse(value, (_key, v: unknown) => {
    if (v === null || typeof v !== "object" || !("$wire" in v)) return v;
    const record = v as { $wire: string; value: unknown };
    if (record.$wire === "bigint") {
      if (
        typeof record.value !== "string" ||
        record.value.length > 100 ||
        !/^-?[0-9]+$/.test(record.value)
      )
        throw new Error("Invalid bigint");
      return BigInt(record.value);
    }
    // Numeric lengths must never become enormous allocations from a tiny client query.
    if (!Array.isArray(record.value) || record.value.length > 10_000_000)
      throw new Error("Invalid wire array");
    if (record.$wire === "set") return new Set(record.value);
    if (
      record.value.some(
        (n: unknown) => typeof n !== "number" || !Number.isFinite(n),
      )
    )
      throw new Error("Invalid numeric array");
    switch (record.$wire) {
      case "Uint32Array":
        return new Uint32Array(record.value);
      case "Uint16Array":
        return new Uint16Array(record.value);
      case "Uint8Array":
        return new Uint8Array(record.value);
      case "Float64Array":
        return new Float64Array(record.value);
      default:
        throw new Error("Unsupported authoritative wire value");
    }
  });
}
