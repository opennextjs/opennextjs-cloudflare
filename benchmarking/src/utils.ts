import ora from "ora";

/**
 * Runs a list of operations in parallel while presenting a loading spinner with some text
 *
 * @param spinnerText The text to add to the spinner
 * @param operations The operations to run
 * @returns The operations results
 */
export async function parallelRunWithSpinner<T>(
  spinnerText: string,
  operations: (() => Promise<T>)[]
): Promise<T[]> {
  const spinner = ora({
    discardStdin: false,
    hideCursor: false,
  }).start();

  let doneCount = 0;

  const updateSpinnerText = () => {
    doneCount++;
    spinner.text = `${spinnerText} (${doneCount}/${operations.length})`;
  };

  updateSpinnerText();

  const results = await Promise.all(
    operations.map(async (operation) => {
      const result = await operation();
      updateSpinnerText();
      return result;
    })
  );

  spinner.stop();

  return results;
}

/**
 * Gets a specific percentile for a given set of numbers
 *
 * @param data the data which percentile value needs to be computed
 * @param percentile the requested percentile (a number between 0 and 100)
 * @returns the computed percentile
 */
export function getPercentile(data: number[], percentile: number): number {
  if (Number.isNaN(percentile) || percentile < 0 || percentile > 100) {
    throw new Error(`A percentile needs to be between 0 and 100, found: ${percentile}`);
  }

  data = data.sort((a, b) => a - b);

  const rank = (percentile / 100) * (data.length - 1);

  const rankInt = Math.floor(rank);
  const rankFract = rank - rankInt;

  return Math.round(data[rankInt]! + rankFract * (data[rankInt + 1]! - data[rankInt]!));
}
