# 0011: Agents file findings

Date: 2026-10-16

## Decided

- **Agents are a source, like people.** Heresay is where everything that should change in an app
  comes in: users' reports, the team's ideas from chat, and what coding agents notice while they
  work. A coding agent fixing one brief often finds another problem (a bug nearby, a security
  risk, dead code, a confusing flow, an idea). It files it with `file_finding` instead of
  fixing it outside its task.
- **Same gate as everything else.** A finding is a report with `source: 'agent'`, `from_repo`,
  `via` (which agent) and `files` (repo-relative paths, optional lines). It waits in the inbox;
  only a person's accept turns it into a brief. No agent works on another agent's say-so.
- **Scoped to the repo's token.** Only for the apps that repo is connected to; with one app it
  needn't be named. A type, never a priority. 30 an hour and 150 a day per repo. The same text
  from the same repo, still open, returns the one already there instead of a second.
- **Untrusted like report text.** An agent can quote code or comments from the repo, which may
  carry instructions. The prompt fences it and says to check it against the code.
- **Shown as "From an agent"**, with the repo, the agent and the files (linked to GitHub when the
  repo is there), in Markdown like the team's chat requests.

## Not done

- Agents seeing or commenting on others' findings. Each repo sees its own (`my_findings`).
- Automatic merging of findings across repos and with user reports: next, with duplicates.
