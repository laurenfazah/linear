/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/no-var-requires */
import chalk from "chalk";
import * as inquirer from "inquirer";
import { asanaCsvImport } from "./importers/asanaCsv";
import { clubhouseCsvImport } from "./importers/clubhouseCsv";
import { githubImport } from "./importers/github";
import { jiraCsvImport } from "./importers/jiraCsv";
import { linearCsvImporter } from "./importers/linearCsv";
import { dequeCsvImporter } from "./importers/dequeCsv";
import { pivotalCsvImport } from "./importers/pivotalCsv";
import { trelloJsonImport } from "./importers/trelloJson";
import { importIssues } from "./importIssues";
import { ImportAnswers } from "./types";

inquirer.registerPrompt("filePath", require("inquirer-file-path"));

(async () => {
  try {
    const importAnswers = await inquirer.prompt<ImportAnswers>([
      {
        type: "input",
        name: "linearApiKey",
        message: "Input your Linear API key (https://linear.app/settings/api)",
      },
      {
        type: "list",
        name: "service",
        message: "Which service would you like to import from?",
        choices: [
          {
            name: "GitHub",
            value: "github",
          },
          {
            name: "Jira (CSV export)",
            value: "jiraCsv",
          },
          {
            name: "Deque (CSV export)",
            value: "dequeCsv",
          },
          {
            name: "Asana (CSV export)",
            value: "asanaCsv",
          },
          {
            name: "Pivotal (CSV export)",
            value: "pivotalCsv",
          },
          {
            name: "Clubhouse (CSV export)",
            value: "clubhouseCsv",
          },
          {
            name: "Trello (JSON export)",
            value: "trelloJson",
          },
          {
            name: "Linear (CSV export)",
            value: "linearCsv",
          },
        ],
      },
    ]);

    // TODO: Validate Linear API
    let importer;
    switch (importAnswers.service) {
      case "github":
        importer = await githubImport();
        break;
      case "jiraCsv":
        importer = await jiraCsvImport();
        break;
      case "asanaCsv":
        importer = await asanaCsvImport();
        break;
      case "dequeCsv":
        importer = await dequeCsvImporter();
        break;
      case "pivotalCsv":
        importer = await pivotalCsvImport();
        break;
      case "clubhouseCsv":
        importer = await clubhouseCsvImport();
        break;
      case "trelloJson":
        importer = await trelloJsonImport();
        break;
      case "linearCsv":
        importer = await linearCsvImporter();
        break;
      default:
        console.log(chalk.red(`Invalid importer`));
        return;
    }

    if (importer) {
      await importIssues(importAnswers.linearApiKey, importer);
    }
  } catch (e) {
    // Deal with the fact the chain failed
    console.error(e);
  }
})();
