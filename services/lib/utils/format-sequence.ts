/**
 * Formats a sequence number according to the given rules.
 * Does NOT increment any counters.
 */
export function formatSequence(
  sequence: number,
  prefix: string,
  suffix: string,
  digits: number,
  includeYear: boolean,
  yearFormat: string,
  includeMonth: boolean,
  date: Date = new Date(),
): string {
  const components: string[] = [prefix];

  if (includeYear || includeMonth) {
    let dateStr = "";
    if (includeYear) {
      const yearStr = date.getFullYear().toString();
      dateStr += yearFormat === "YYYY" ? yearStr : yearStr.slice(-2);
    }
    if (includeMonth) {
      dateStr += (date.getMonth() + 1).toString().padStart(2, "0");
    }
    components.push(dateStr);
  }

  components.push("-"); // visual separator
  components.push(sequence.toString().padStart(digits, "0"));

  let formatted = components.filter(Boolean).join("");
  // remove possible `--` if prefix was empty and no date was used
  formatted = formatted.replace(/^[-]+|[-]+$/g, "").replace(/--+/g, "-");

  if (suffix) {
    formatted = `${formatted}-${suffix}`;
  }

  return formatted;
}
