const path = require('path');

const normalizedOptions = require('./normalized-options');

const templates = require('./templates');
const { createFile, createFolder, npmAddScriptSync, exec } = require('./utils');
const { execSync } = require('child_process');

const DEFAULT_PREFIX = '';
const DEFAULT_PACKAGE_IDENTIFIER = 'com.reactlibrary';
const DEFAULT_PLATFORMS = ['android', 'ios'];
const DEFAULT_GITHUB_ACCOUNT = 'github_account';
const DEFAULT_AUTHOR_NAME = 'Your Name';
const DEFAULT_AUTHOR_EMAIL = 'yourname@email.com';
const DEFAULT_LICENSE = 'Apache-2.0';
const DEFAULT_USE_COCOAPODS = false;
const DEFAULT_GENERATE_EXAMPLE = false;
const DEFAULT_EXAMPLE_NAME = 'example';

const renderTemplateIfValid = (root, template, templateArgs) => {
  const name = template.name(templateArgs);
  if (!name) return Promise.resolve();

  const filename = path.join(root, name);
  const baseDir = filename.split(path.basename(filename))[0];

  return createFolder(baseDir).then(() =>
    createFile(filename, template.content(templateArgs))
  );
};

// alias, at least for now:
const renderTemplate = renderTemplateIfValid;

const generateWithOptions = ({
  name = 'unknown', // (should be normalized)
  prefix = DEFAULT_PREFIX,
  moduleName = 'unknown', // (should be normalized)
  className = 'unknown', // (should be normalized)
  modulePrefix = '', // (should be normalized)
  packageIdentifier = DEFAULT_PACKAGE_IDENTIFIER,
  namespace = 'unknown', // (should be normalized)
  platforms = DEFAULT_PLATFORMS,
  githubAccount = DEFAULT_GITHUB_ACCOUNT,
  authorName = DEFAULT_AUTHOR_NAME,
  authorEmail = DEFAULT_AUTHOR_EMAIL,
  license = DEFAULT_LICENSE,
  view = false,
  useCocoapods = DEFAULT_USE_COCOAPODS,
  generateExample = DEFAULT_GENERATE_EXAMPLE,
  exampleName = DEFAULT_EXAMPLE_NAME,
}) => {
  if (packageIdentifier === DEFAULT_PACKAGE_IDENTIFIER) {
    console.warn(`While \`{DEFAULT_PACKAGE_IDENTIFIER}\` is the default package
      identifier, it is recommended to customize the package identifier.`);
  }

  // Note that the some of these console log messages are done as
  // console.info instead of verbose since they are needed to help
  // make sense of the console output from the third-party tools.

  console.info(
    `CREATE new React Native module with the following options:

  root moduleName: ${moduleName}
  name: ${name}
  prefix: ${prefix}
  modulePrefix: ${modulePrefix}
  packageIdentifier: ${packageIdentifier}
  platforms: ${platforms}
  githubAccount: ${githubAccount}
  authorName: ${authorName}
  authorEmail: ${authorEmail}
  authorEmail: ${authorEmail}
  license: ${license}
  view: ${view}
  useCocoapods: ${useCocoapods}
  generateExample: ${generateExample}
  exampleName: ${exampleName}
  `);

  if (generateExample) {
    const reactNativeVersionCommand = 'react-native --version';
    const yarnVersionCommand = 'yarn --version';

    const checkCliOptions = { stdio: 'inherit' };
    const errorRemedyMessage = 'both react-native-cli and yarn CLI tools are needed to generate example project';

    try {
      console.info('CREATE: Check for valid react-native-cli tool version, as needed to generate the example project');
      execSync(reactNativeVersionCommand, checkCliOptions);
      console.info(`${reactNativeVersionCommand} ok`);
    } catch (e) {
      throw new Error(
        `${reactNativeVersionCommand} failed; ${errorRemedyMessage}`);
    }

    try {
      console.info('CREATE: Check for valid Yarn CLI tool version, as needed to generate the example project');
      execSync(yarnVersionCommand, checkCliOptions);
      console.info(`${yarnVersionCommand} ok`);
    } catch (e) {
      throw new Error(
        `${yarnVersionCommand} failed; ${errorRemedyMessage}`);
    }
  }

  console.info('CREATE: Generating the React Native library module');

  const generateWithoutExample = () => {
    return createFolder(moduleName).then(() => {
      return Promise.all(templates.filter((template) => {
        if (template.platform) {
          return (platforms.indexOf(template.platform) >= 0);
        }

        return true;
      }).map((template) => {
        if (!template.name) {
          return Promise.resolve();
        }
        const templateArgs = {
          name: className,
          moduleName,
          packageIdentifier,
          namespace,
          platforms,
          githubAccount,
          authorName,
          authorEmail,
          license,
          view,
          useCocoapods,
          generateExample,
          exampleName,
        };

        return renderTemplateIfValid(moduleName, template, templateArgs);
      }));
    });
  };

  // The separate promise makes it easier to generate
  // multiple test/sample projects, if needed.
  const generateExampleWithName =
    (exampleName, commandOptions) => {
      console.info('CREATE: Generating the example app');

      const addOptions = commandOptions
        ? ` ${commandOptions}`
        : '';
      const execOptions = { cwd: `./${moduleName}`, stdio: 'inherit' };
      return exec(`react-native init ${exampleName}${addOptions}`, execOptions)
        .then(() => {
          // Execute the example template
          const exampleTemplates = require('./templates/example');

          const templateArgs = {
            name: className,
            moduleName,
            view,
            useCocoapods,
            exampleName,
          };

          return Promise.all(
            exampleTemplates.map((template) => {
              return renderTemplate(moduleName, template, templateArgs);
            })
          );
        })
        .then(() => {
          // Adds and link the new library
          return new Promise((resolve, reject) => {
            // Add postinstall script to the example package.json
            console.info('Adding cleanup postinstall task to the example app');
            const pathExampleApp = `./${moduleName}/${exampleName}`;
            npmAddScriptSync(`${pathExampleApp}/package.json`, {
              key: 'postinstall',
              value: `node ../scripts/examples_postinstall.js`
            });

            // Add and link the new library
            console.info('Linking the new module library to the example app');
            const addLinkLibraryOptions = { cwd: pathExampleApp, stdio: 'inherit' };
            try {
              execSync('yarn add file:../', addLinkLibraryOptions);
            } catch (e) {
              execSync('npm install ../', addLinkLibraryOptions);
              execSync('npm install', addLinkLibraryOptions);
            }
            execSync('react-native link', addLinkLibraryOptions);

            return resolve();
          });
        });
    };

  return generateWithoutExample().then(() => {
    return (generateExample
      ? generateExampleWithName(exampleName)
      : Promise.resolve()
    );
  });
};

module.exports = (options) => {
  return generateWithOptions(normalizedOptions(options));
};
