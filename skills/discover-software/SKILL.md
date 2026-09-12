---
name: discover-software
description: Inspect a local software project and propose a safe configuration for starting and assessing it.
---

# Discover software

Use this skill when a software project has been provided but its framework, startup command, interfaces, or local URL are unknown.

## Procedure

1. Confirm that the target path is the software explicitly placed in assessment scope.
2. Run the read-only discovery script:

   ```bash
   node {baseDir}/scripts/discover-software.mjs <target-path> --output <output-path>/compliance-target.generated.yaml
   ```

3. Read the generated YAML and report:

   - detected application type and framework
   - proposed startup and shutdown commands
   - proposed local URLs and API specifications
   - evidence used for each conclusion
   - unresolved information

4. Do not execute proposed startup commands during discovery.
5. Do not infer credentials. The YAML may contain environment-variable names, but never secret values.
6. Treat every generated command and URL as unverified until a separate launch-validation step confirms it in an isolated environment.
7. If multiple startup methods are found, prefer Docker Compose and list the alternatives as unresolved choices.

## Safety rules

- Inspect files only; do not install dependencies or run repository scripts.
- Ignore `.git`, dependency caches, build output, and secret files.
- Never copy `.env` values into output.
- Do not expand the authorized target directory.
- Do not perform active security testing in this skill.

## Expected result

The script writes `compliance-target.generated.yaml`. A human or validation agent reviews it before it becomes the approved `compliance-target.yaml`.
