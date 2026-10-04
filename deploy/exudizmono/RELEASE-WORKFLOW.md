# Exudizmono release workflow

The owner requested batched releases on 2026-10-04. This replaces the earlier habit of assigning and deploying a live version for each fix.

## Branches and versions

- `development` is the working branch. Push each completed change to this branch on Moonnooo/OpenFrontIO.
- `main` represents the latest approved production release. Do not push unfinished development changes to main.
- Live is currently Exudizmono 0.2.8, source commit 3e21eeeb1d61db9428b333b5c4243e3433182f1f.
- Use a development version such as `0.2.9-dev.1` for the next preview batch. Advance the development suffix for a new preview candidate when useful; individual source commits do not require a new public release version.
- Several fixes and features belong to one batch. Assign one stable version, such as `0.2.9`, only when preparing the complete batch for approval.

## Release a batch

1. Commit and push incremental work to development. Test changes in the isolated preview deployment at https://game.exudizmono.com:8443/.
2. Validate the combined batch, including affected UI behavior and multiplayer queries. Summarize all included changes together in the release notes.
3. Prepare the stable version and final image on development, test that exact candidate, and ask the owner to approve the complete batch for live deployment.
4. After explicit approval, merge the tested release into main and push main. Back up live configuration and SQLite data, deploy the exact tested image, and verify site/API health, public naval mode, data and account preservation.
5. Continue the next batch on development, starting from the released main state.

Do not automatically deploy live from either branch. Preview data, authentication settings and keys stay separate from live. Urgent individual hotfix releases still require explicit owner approval.
