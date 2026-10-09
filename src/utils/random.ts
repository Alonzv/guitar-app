/** One item at random. */
export const pickOne = <X,>(xs: readonly X[]): X => xs[Math.floor(Math.random() * xs.length)];
