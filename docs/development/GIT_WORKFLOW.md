# Git Workflow

Commit and push after each verified milestone. Keep commits focused and never push broken builds to `main`; CI is the remote verification gate. Tag stable product milestones, and never commit build caches or installers.

When real MAVLink, firmware, or flight-control work begins, use focused feature branches, such as `feature/mavlink-readonly-transport`, rather than working directly on `main`.
