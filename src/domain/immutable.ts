/** Return a detached, recursively frozen snapshot of plain application data. */
export function immutableSnapshot<T>(value: T): T {
  return freeze(clone(value));
}

function clone<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => clone(item)) as T;
  }
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, clone(item)])
    ) as T;
  }
  return value;
}

function freeze<T>(value: T): T {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    Object.values(value).forEach((item) => freeze(item));
    Object.freeze(value);
  }
  return value;
}
