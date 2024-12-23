import Enquirer from "enquirer";

export async function askConfirmation(message: string): Promise<boolean> {
  const questionName = crypto.randomUUID();

  const enquirerAnswersObject = await Enquirer.prompt<Record<string, boolean>>({
    name: questionName,
    message,
    type: "confirm",
    initial: "y",
  });

  console.log("");

  const answer = !!enquirerAnswersObject[questionName];
  return answer;
}