# WCAG 2.2 Level A/AA readiness suites

This directory defines local-only readiness checks for all 55 WCAG 2.2 Level A and Level AA success criteria. Level AA conformance requires satisfying every applicable Level A and Level AA criterion, along with all WCAG conformance requirements.

The normative source is the [Web Content Accessibility Guidelines (WCAG) 2.2](https://www.w3.org/TR/WCAG22/). The catalog also follows W3C/WAI guidance on [evaluating web accessibility](https://www.w3.org/WAI/test-evaluate/), [selecting evaluation tools](https://www.w3.org/WAI/test-evaluate/tools/selecting/), [understanding conformance](https://www.w3.org/WAI/WCAG22/Understanding/conformance.html), and [WCAG test rules](https://www.w3.org/WAI/WCAG22/Understanding/understanding-act-rules).

## Critical boundary

Automated checks cannot establish WCAG conformance. W3C states that no tool alone can determine whether a site meets accessibility standards, tools cannot check all accessibility aspects automatically, and knowledgeable human evaluation is required. Automated results can also be false or misleading.

These suites therefore produce **readiness evidence**, findings, and prompts for human evaluation. A passing automated result means only that the implemented machine checks found no failure in the tested pages, states, environments, and rules. It is not a WCAG conformance claim, certification, or legal conclusion.

## Suite organization

[`catalog.json`](./catalog.json) has two suites:

- `wcag-22-a-aa-locally-automatable-readiness` contains criteria for which local software can gather repeatable evidence or detect likely failures. Most entries still identify a required human confirmation in `limitations`.
- `wcag-22-a-aa-manual-required` contains criteria whose outcome principally depends on meaning, completeness, exceptions, user intent, or full interaction. Local tools can assist the reviewer but cannot make the final determination.

Every test entry includes:

- `id`: the official success criterion number.
- `title`: the official success criterion title.
- `type`: `automated-readiness` or `manual-required`.
- `applicability`: when the criterion must be considered.
- `inputs`: local artifacts or states needed to run the check.
- `suggestedLocalTool`: a local implementation approach; it is not a W3C endorsement.
- `expectedEvidence`: artifacts the test should preserve.
- `limitations`: what the check cannot establish.
- `officialUrl`: the criterion's normative W3C URL.

## Local-only execution policy

Runtime tests must not call remote APIs, hosted scanners, analytics services, cloud browsers, or remote language models. Tests operate only on:

- An explicitly authorized target hosted on the GB10 or its private local container network.
- Locally installed browsers and test binaries.
- Local source files and media.
- Local MongoDB evidence storage.
- Local inference routed through the NemoClaw/OpenClaw/OpenShell stack.

The OpenShell policy should deny outbound network access and allow only named local services. Model weights, browser binaries, rule packages, and dependencies should be installed before the judged runtime. Test output should record tool and rule versions, target build identity, routes and states covered, timestamps, and hashes of retained evidence.

## Suggested execution flow

1. Load the authorized local target and generated `compliance-target.yaml`.
2. Determine which criteria apply to the target's content and functionality.
3. Crawl an approved route list and execute scripted representative journeys locally.
4. Run each applicable automated-readiness entry and retain its evidence.
5. Create manual-review tasks for every manual-required entry and every inconclusive automated result.
6. Evaluate complete pages, responsive variations, and complete processes with knowledgeable human reviewers and representative assistive technologies.
7. Report each criterion as `pass`, `fail`, `not-applicable`, or `not-tested`, with evidence and reviewer identity. Reserve any conformance claim until all WCAG 2.2 conformance requirements have been evaluated.

## Catalog scope and maintenance

The catalog targets WCAG 2.2 Level AA, so it includes all Level A and AA criteria and excludes Level AAA criteria. WCAG 2.2 removed the obsolete WCAG 2.1 success criterion 4.1.1 Parsing; it is therefore not present here.

The W3C specification is normative. W3C Understanding documents, techniques, and ACT test rules are informative aids and do not replace the success criteria. Before updating a check, compare it against the current normative criterion and record the catalog version change.
