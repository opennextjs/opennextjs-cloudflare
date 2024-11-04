import ora from "ora";

/**
 * Runs a list of operations while presenting a loading spinner with some text
 *
 * @param spinnerText The text to add to the spinner
 * @param operations The operations to run
 * @returns The operations results
 */
export async function runOperationsWithSpinner<T>(
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
