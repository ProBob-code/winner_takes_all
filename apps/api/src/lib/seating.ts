/**
 * Which seat at a new night is the host's own.
 *
 * WHY THIS IS ITS OWN FILE
 * "Run a night" used to put the host's account on the first seat whatever
 * name was typed there. On a real night the host typed "Bala" first and
 * themselves fourth, so their account collected Bala's frames and Bala's
 * trophies, and when the host's own seat won the night its 400K had no
 * account to go to. A seat now carries an account only when it is plainly the
 * host's: their name, or a blank first line the host left for themselves.
 *
 * Pure, so the rule is tested on its own (tests/seating.test.ts).
 */

const tidy = (name: string) => name.normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ");
const firstWord = (name: string) => tidy(name).split(" ")[0] ?? "";

/**
 * The index of the host's seat among `names`, or null for none.
 *
 * `supplied` is what the host typed (possibly shorter than `names`, which is
 * every seat with blanks filled as "Player n"). In order:
 *   1. a seat whose name is the host's account name, spaces and case aside;
 *   2. a seat whose name is the host's first name, or whose first word is,
 *      when exactly one seat fits (two "Rahul"s is no answer);
 *   3. the first seat, when the host typed nothing there: the old "the host
 *      takes the first seat" rule, kept for a host who just picks a size.
 * Otherwise nobody, and the host can claim their seat afterwards.
 */
export function hostSeatIndex(
  names: string[],
  supplied: string[],
  hostName: string,
  hostPlaying: boolean
): number | null {
  if (!hostPlaying) return null;
  const host = tidy(hostName);
  if (host) {
    const exact = names.findIndex((name, i) => (supplied[i] ?? "").trim() !== "" && tidy(name) === host);
    if (exact >= 0) return exact;

    const first = firstWord(hostName);
    if (first.length >= 2) {
      const fits = names
        .map((name, i) => ({ name, i }))
        .filter(({ name, i }) => (supplied[i] ?? "").trim() !== "" && (tidy(name) === first || firstWord(name) === first));
      if (fits.length === 1) return fits[0].i;
      if (fits.length > 1) return null;
    }
  }
  return (supplied[0] ?? "").trim() === "" ? 0 : null;
}
