// Helpers for the tests, needed because the project compiles with
// `noUncheckedIndexedAccess`: indexing an array yields `T | undefined`, so a
// test that reads a known element must say what happens when it is missing.
//
// The helpers fail the test with a clear message when the element is absent.
// They never change WHAT is asserted: the element is the same one the
// expression indexed before.

export function at<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) {
    throw new Error(`Expected an element at index ${index} of an array of ${items.length}`);
  }
  return item;
}

export function first<T>(items: readonly T[]): T {
  return at(items, 0);
}

export function last<T>(items: readonly T[]): T {
  return at(items, items.length - 1);
}
