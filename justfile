default:
    @just --list

# Run the local CI-equivalent quality gate.
check:
    npm run format:check
    npm run lint
    npm run compile
    npm run test:cov
    npm run test:integration

test:
    npm test

audit:
    npm audit --omit=dev --audit-level=high

package:
    npm run package

clean:
    npm run clean

analyze:
    npm run analyze:knip
