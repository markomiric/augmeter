---
name: lambda-log-diagnostics
description: "Use when the user wants to diagnose a misbehaving AWS Lambda function: failing invocations, cold-start timeouts, permission errors, or runtime exceptions. Triggers include why is my Lambda failing, check the logs for a function, what's throwing in production, and debug the deploy. Requires AWS CLI access; if unavailable, fall back to asking the user to paste a log excerpt."
---

# Lambda Log Investigator

You fetch and interpret CloudWatch Logs for a specific AWS Lambda function, classify the errors, and propose concrete fixes. You never guess -- you always cite the log lines you based the diagnosis on.

## Process

1. **Identify the function.** Ask the user for the function name and region if not given. If the user mentions a service (e.g. "the API deploy"), grep their repo for a matching Lambda name in _serverless.yml_, _template.yaml_, or Terraform files. Lambda function names built by Serverless Framework default to `<service>-<stage>-<functionName>` -- **but an explicit `name:` on the function overrides that pattern**, so always check for a `name:` key before assuming the default. When `name:` uses IaC variables (e.g. `name: ${self:custom.servicePrefix}-api`), resolve the variables from the config rather than guessing the literal. This repo sets such a `name:` -- see "This repo's conventions" below.

2. **Verify AWS CLI access.** Run `aws sts get-caller-identity` in the current shell. If it fails, stop and tell the user to authenticate first (via `aws configure`, `aws sso login`, or by exporting credentials). Do not try to continue without credentials.

3. **Resolve the log group.** Lambda log groups are `/aws/lambda/<function-name>`. Confirm it exists:

   ```sh
   aws logs describe-log-groups --log-group-name-prefix /aws/lambda/<function-name> --region <region>
   ```

4. **Pick a time window.** Default to the last hour. If the user mentions a specific deploy, use the deploy timestamp +/- 30 minutes. If they mention "the recent failures", look at the last 24 hours but only keep ERROR-level events. Use Unix ms epochs for `--start-time` / `--end-time`.

5. **Pull the logs.** Use `aws logs filter-log-events` (not `get-log-events` -- filter lets you scope by pattern):

   ```sh
   aws logs filter-log-events \
     --log-group-name /aws/lambda/<function-name> \
     --start-time <ms-epoch> \
     --end-time <ms-epoch> \
     --filter-pattern '?ERROR ?Exception ?Task\ timed\ out ?Runtime.ImportModuleError' \
     --region <region>
   ```

   For broader triage, drop the filter pattern and use a shorter window. Cap results with `--max-items 500` so you don't flood your context.

6. **Classify each error.** Map every error line to one of these classes:

   | Signal in logs                                        | Class                    |
   | ----------------------------------------------------- | ------------------------ |
   | `Task timed out after N seconds`                      | Timeout                  |
   | `AccessDenied`, `not authorized to perform`           | Permission (IAM)         |
   | `Unable to import module '<module>'`                  | Packaging / import error |
   | `Runtime.ImportModuleError`                           | Packaging / import error |
   | `Runtime exited without providing a reason`           | Container crash / OOM    |
   | `INIT_REPORT Init Duration: N ms ... Status: timeout` | Cold-start init timeout  |
   | `ValidationException`, `ResourceNotFoundException`    | AWS API call error       |
   | Python stack trace with application code              | Application bug          |
   | `ThrottlingException`                                 | Downstream rate limit    |

7. **Diagnose the top class.** For the most frequent class, produce:
   - A **count** and the **first/last occurrence** timestamps.
   - The **relevant log excerpt** (2-3 lines of context -- don't paste the whole stack trace unless asked).
   - A **proposed fix**, with concrete pointers to files or config to change.

8. **Propose a fix.** Use this mapping as a starting point (never guess beyond the evidence):
   - **Timeout:** Raise `timeout` in IaC (Lambda's service default is 3s; Serverless Framework defaults to 6s -- both are often too low), OR find the slow downstream call. Check if it's DynamoDB (missing index, full Scan), an external HTTP call (add a client-side timeout), or a cold start of a dependency (move initialization out of the handler).
   - **Permission:** The log line says exactly which action was denied (`not authorized to perform: dynamodb:Query on ...`). Extend the IAM statement in _serverless.yml_ / Terraform to cover that action on that resource ARN. Show the exact JSON patch.
   - **Import error:** Check that the package is in _requirements.txt_ / _pyproject.toml_ and is being exported/included in the deployment zip. If using Serverless Framework with Python, verify the packaging step runs before deploy.
   - **Container crash / OOM:** Check memory use via `max memory used` in the REPORT line. Increase `memorySize` if above 80% of the allocation. If not memory, look for segfaults in native dependencies.
   - **Cold-start init timeout:** The init code (module-level imports, global DB clients) ran longer than the `timeout`. Shrink imports, defer creation of clients, or enable provisioned concurrency.
   - **AWS API error:** ValidationException means malformed request -- log the params. ResourceNotFoundException means the wrong table/bucket name, often a stage mismatch.
   - **Application bug:** Cite the file and line number from the stack trace. Don't try to fix it blindly -- describe the bug and ask the user to confirm before editing.

9. **Produce the report.** Output in this structure:
   - **Summary line:** "Pulled N log events from <log-group> over <window>. Top error class: <class> (K occurrences)."
   - **Findings:** numbered list, top class first, with excerpt + diagnosis + proposed fix per class.
   - **Next step:** one sentence naming the single highest-priority action.

## Advanced: CloudWatch Logs Insights

If `filter-log-events` returns too much noise, fall back to CloudWatch Logs Insights for structured analysis:

```sh
aws logs start-query \
  --log-group-name /aws/lambda/<function-name> \
  --start-time <epoch> --end-time <epoch> \
  --query-string 'fields @timestamp, @message
    | filter @message like /ERROR|Exception|timed out/
    | sort @timestamp desc
    | limit 200' \
  --region <region>
```

Then poll with `aws logs get-query-results --query-id <id>`. Use this when you need to aggregate ("how many timeouts per hour over the last 24h") rather than eyeball individual events.

## Heuristics

- **Always anchor to evidence.** Quote log lines; don't paraphrase. If you can't find an error in the log, say so -- don't invent one.
- **Cold starts look like timeouts.** The INIT_REPORT line distinguishes them. If the first invocation after a deploy times out but subsequent ones succeed, it's cold start.
- **A deploy succeeded != the function works.** Always check for errors in the first 5 minutes after a deploy.
- **Stage matches matter.** A development function and a production function are different functions with different log groups. Confirm you're looking at the right stage.
- **Default retention is Never Expire.** A Lambda-created log group keeps logs indefinitely unless a retention period is set (via Serverless Framework's `logRetentionInDays`, or an explicit CloudFormation/Terraform `RetentionInDays`). If a retention period IS configured and the user asks about logs older than it, the logs are permanently gone -- tell them rather than silently returning nothing.
- **REPORT lines contain metrics.** Duration, billed duration, max memory, init duration. Parse them when diagnosing performance, not just errors.

## Common mistakes to flag

- Assuming a 500 response is from the Lambda. API Gateway can return 500 if the Lambda payload is malformed or the integration response is misconfigured -- check the API Gateway access logs too. A 401 on a protected route usually comes from the API Gateway authorizer (e.g. Cognito), before the Lambda runs at all.
- Blaming the code when the IAM role is missing a permission. Always check permissions first when the error is `AccessDenied`.
- Confusing function-level errors (inside the handler) with infrastructure errors (the Lambda service couldn't run the function at all). The REPORT line appears for successful runs; its absence means the function never started.
- Missing that `/aws/lambda/<fn>` contains logs from every invocation stream concatenated -- "last event" is different from "last invocation".

## This repo's conventions (supio)

When the user is debugging this repo's backend Lambda, you already know the identifiers -- don't ask for them. Treat these as _derived_ values, not fixed literals: re-resolve them from `services/backend/serverless.yml` if `projectName`, `service`, or `stage` ever change.

- **Function name:** derived as `name: ${self:custom.servicePrefix}-api`, where `servicePrefix = ${projectName}-${stage}-${service}`. With the current config that resolves to `supio-<stage>-backend-api` -- the deployed production function is `supio-production-backend-api`. Because `name:` is set explicitly, the default `<service>-<stage>-<fn>` pattern does **not** apply (don't look for `backend-production-API`). If `projectName` changes, re-derive instead of trusting this literal.
- **Log group:** `/aws/lambda/<function-name>` -- currently `/aws/lambda/supio-production-backend-api`.
- **Region:** `eu-west-1` (the repo default; `${opt:region, "eu-west-1"}`).
- **Retention:** the repo sets `logRetentionInDays: 90`, so logs older than 90 days are gone here (not the AWS "never expire" default).
- **Timeout / memory:** `timeout: 10`, `memorySize: 512`. So the timeout signal here is `Task timed out after 10.00 seconds`, not 3s.
- **One proxy Lambda for all routes:** handler is `app.main.handle` (FastAPI via Mangum). `GET /api/v1/health` is public; everything under `/{proxy+}` is behind the Cognito user-pool authorizer. A `401 {"message":"Unauthorized"}` on a protected route is the API Gateway authorizer rejecting the request before the Lambda runs -- not an application error in the logs.
- **IAM:** the execution role is intentionally narrow. It grants `dynamodb:Query/GetItem/PutItem/UpdateItem` on the table and indexes, X-Ray write actions, `ssm:GetParameter` for the Polar webhook secret path, and Bedrock invoke/retrieve actions scoped in `serverless.yml`. An `AccessDenied` for `Scan`, `DeleteItem`, or `DescribeTable` usually means the code is using an operation this repo deliberately avoids; confirm the access pattern before adding IAM.
- **Bedrock failures:** `AINotConfiguredError` maps to 503, throttling maps to 429, and upstream Bedrock faults map to 502 through global FastAPI handlers. Check `BEDROCK_MODEL_ID`, `KNOWLEDGE_BASE_ID`, model access, and `resources/bedrock.yml` before changing route code.
- **Deploy-time check:** CI verifies `GET /api/v1/health` returns `200` and a protected route returns `401` right after deploy (`.github/workflows/backend.yml`). If those smoke checks pass but the function still 500s, pull logs for the window just after the deploy.

## Output format

Always produce a Markdown report:

```markdown
## Lambda log report: <function-name> (<region>)

**Window:** <start> to <end>
**Events pulled:** N (filter: "<pattern>")
**Top error class:** <Class> (K occurrences)

### Findings

1. **<Class>** -- K occurrences, first at <t1>, last at <t2>
```

   <log excerpt>
   ```
   **Diagnosis:** <one paragraph>
   **Proposed fix:** <concrete action with file/config pointer>

2. ...

### Next step

<one-sentence top priority>
```
